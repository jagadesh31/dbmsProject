package ratelimit

import (
	"context"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
	"visora-backend/internal/db"
	"visora-backend/internal/redisx"
)

const (
	quotaUserPrefix  = "seenly:quota:user:"
	burstCreatePrefix = "seenly:burst:create:"
	burstAuthPrefix  = "seenly:burst:auth:"
	burstAPIPrefix   = "seenly:burst:api:"
)

func ctx() (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.Background(), 2*time.Second)
}

func userMaxScans() int {
	for _, key := range []string{"USER_MAX_SCANS", "USER_MAX_SCANS_PER_DAY"} {
		n, _ := strconv.Atoi(strings.TrimSpace(os.Getenv(key)))
		if n > 0 {
			return n
		}
	}
	return 1
}

func burstLimit(envKey string, fallback int) int {
	n, _ := strconv.Atoi(strings.TrimSpace(os.Getenv(envKey)))
	if n > 0 {
		return n
	}
	return fallback
}

func burstWindow(envKey string, fallback time.Duration) time.Duration {
	raw := strings.TrimSpace(os.Getenv(envKey))
	if raw == "" {
		return fallback
	}
	if secs, err := strconv.Atoi(raw); err == nil && secs > 0 {
		return time.Duration(secs) * time.Second
	}
	if d, err := time.ParseDuration(raw); err == nil && d > 0 {
		return d
	}
	return fallback
}

// Allow increments a fixed-window counter and returns whether the caller is under the limit.
func Allow(key string, limit int, window time.Duration) (bool, error) {
	c := redisx.Client()
	if c == nil || limit <= 0 {
		return true, nil
	}
	ctx, cancel := ctx()
	defer cancel()

	n, err := c.Incr(ctx, key).Result()
	if err != nil {
		return false, err
	}
	if n == 1 {
		_ = c.Expire(ctx, key, window).Err()
	}
	return n <= int64(limit), nil
}

// AllowCreateBurst limits how often one account may hit create-project.
func AllowCreateBurst(email string) (bool, string) {
	email = strings.TrimSpace(strings.ToLower(email))
	if email == "" {
		return false, "Sign in with Google to start a Seenly scan."
	}
	ok, err := Allow(
		burstCreatePrefix+email,
		burstLimit("RATE_LIMIT_CREATE_MAX", 8),
		burstWindow("RATE_LIMIT_CREATE_WINDOW_SEC", time.Hour),
	)
	if err != nil {
		// Fail open to Postgres quota if Redis blips — still protected by DB check.
		return true, ""
	}
	if !ok {
		return false, "Too many scan attempts. Wait a bit, then try again."
	}
	return true, ""
}

// AllowAuthBurst limits Google OAuth starts for one guest/browser id.
func AllowAuthBurst(guestID string) (bool, string) {
	guestID = strings.TrimSpace(guestID)
	if guestID == "" {
		guestID = "anon"
	}
	ok, err := Allow(
		burstAuthPrefix+guestID,
		burstLimit("RATE_LIMIT_AUTH_MAX", 12),
		burstWindow("RATE_LIMIT_AUTH_WINDOW_SEC", 10*time.Minute),
	)
	if err != nil {
		return true, ""
	}
	if !ok {
		return false, "Too many sign-in attempts. Wait a few minutes and try again."
	}
	return true, ""
}

// AllowAPIBurst is a light per-identity API throttle (email or guest).
func AllowAPIBurst(identity string) (bool, string) {
	identity = strings.TrimSpace(strings.ToLower(identity))
	if identity == "" {
		identity = "anon"
	}
	ok, err := Allow(
		burstAPIPrefix+identity,
		burstLimit("RATE_LIMIT_API_MAX", 120),
		burstWindow("RATE_LIMIT_API_WINDOW_SEC", time.Minute),
	)
	if err != nil {
		return true, ""
	}
	if !ok {
		return false, "Too many requests. Slow down and try again."
	}
	return true, ""
}

// CanTakeScan reports whether this Google account still has a Seenly scan credit.
// Redis is the fast path; Postgres backfills the key if Redis was empty.
func CanTakeScan(email string) (bool, string) {
	email = strings.TrimSpace(strings.ToLower(email))
	if email == "" {
		return false, "Sign in with Google to start a Seenly scan."
	}
	max := userMaxScans()
	msg := "This Google account already used its Seenly scan. Open your existing report, or sign in with a different Google account."

	c := redisx.Client()
	if c != nil {
		ctx, cancel := ctx()
		defer cancel()
		val, err := c.Get(ctx, quotaUserPrefix+email).Result()
		if err == nil {
			used, _ := strconv.Atoi(val)
			if used >= max {
				return false, msg
			}
			return true, ""
		}
		if err != nil && err != redis.Nil {
			// fall through to Postgres
		}
	}

	var n int64
	db.DB.Model(&db.Project{}).Where("user_email = ?", email).Count(&n)
	if int(n) >= max {
		_ = MarkScanUsed(email, int(n))
		return false, msg
	}
	return true, ""
}

// MarkScanUsed records that this account has consumed scan credits (lifetime key).
func MarkScanUsed(email string, used int) error {
	email = strings.TrimSpace(strings.ToLower(email))
	if email == "" {
		return nil
	}
	if used <= 0 {
		used = 1
	}
	c := redisx.Client()
	if c == nil {
		return nil
	}
	ctx, cancel := ctx()
	defer cancel()
	// No expiry — one scan per Google account for the life of the product.
	return c.Set(ctx, quotaUserPrefix+email, used, 0).Err()
}

// IncrScanUsed atomically increments the Redis quota after a successful create.
func IncrScanUsed(email string) error {
	email = strings.TrimSpace(strings.ToLower(email))
	if email == "" {
		return nil
	}
	c := redisx.Client()
	if c == nil {
		return nil
	}
	ctx, cancel := ctx()
	defer cancel()
	n, err := c.Incr(ctx, quotaUserPrefix+email).Result()
	if err != nil {
		return err
	}
	if n == 1 {
		// lifetime key — no expire
	}
	return nil
}

// SyncQuotaFromDB seeds Redis from Postgres for one email (optional warm-up).
func SyncQuotaFromDB(email string) error {
	email = strings.TrimSpace(strings.ToLower(email))
	if email == "" || redisx.Client() == nil {
		return nil
	}
	var n int64
	db.DB.Model(&db.Project{}).Where("user_email = ?", email).Count(&n)
	if n <= 0 {
		return nil
	}
	return MarkScanUsed(email, int(n))
}

// Status is a tiny health helper.
func Status() string {
	if !redisx.Enabled() {
		return "disabled"
	}
	ctx, cancel := ctx()
	defer cancel()
	if err := redisx.Client().Ping(ctx).Err(); err != nil {
		return fmt.Sprintf("error: %v", err)
	}
	return "ok"
}
