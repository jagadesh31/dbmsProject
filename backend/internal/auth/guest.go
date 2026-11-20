package auth

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"visora-backend/internal/db"
)

const GuestCookieName = "seenly_guest"

// GuestMaxScans is how many free full analyses one browser guest cookie may start.
func GuestMaxScans() int {
	n, _ := strconv.Atoi(strings.TrimSpace(os.Getenv("GUEST_MAX_SCANS")))
	if n <= 0 {
		return 1
	}
	return n
}

// UserMaxScansPerDay caps full re-scans for a signed-in account (email), not IP.
func UserMaxScansPerDay() int {
	n, _ := strconv.Atoi(strings.TrimSpace(os.Getenv("USER_MAX_SCANS_PER_DAY")))
	if n <= 0 {
		return 5
	}
	return n
}

func newGuestID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// EnsureGuest returns the guest id, creating + setting the cookie when missing.
func EnsureGuest(c *gin.Context) string {
	if id := strings.TrimSpace(c.GetString("guest_id")); id != "" {
		return id
	}
	id, err := c.Cookie(GuestCookieName)
	id = strings.TrimSpace(id)
	if err != nil || id == "" || len(id) < 16 {
		id = newGuestID()
	}
	writeCookie(c, GuestCookieName, id, cookieDomain(), 60*60*24*365, cookieSecure())
	c.Set("guest_id", id)
	upsertGuestSession(id, false)
	return id
}

func upsertGuestSession(guestID string, bumpScan bool) {
	if guestID == "" {
		return
	}
	var session db.GuestSession
	err := db.DB.Where("guest_id = ?", guestID).First(&session).Error
	now := time.Now().UTC()
	if err != nil || session.ID == 0 {
		session = db.GuestSession{
			GuestID:   guestID,
			ScanCount: 0,
			CreatedAt: now,
			UpdatedAt: now,
		}
		if bumpScan {
			session.ScanCount = 1
			session.LastScanAt = &now
		}
		_ = db.DB.Create(&session).Error
		return
	}
	updates := map[string]interface{}{"updated_at": now}
	if bumpScan {
		updates["scan_count"] = session.ScanCount + 1
		updates["last_scan_at"] = now
	}
	_ = db.DB.Model(&session).Updates(updates).Error
}

// GuestCanStartScan reports whether this guest cookie may start another free analysis.
// Limits are cookie / guest_id based only — never IP (shared office/NAT).
func GuestCanStartScan(guestID string) (bool, string) {
	max := GuestMaxScans()
	var session db.GuestSession
	_ = db.DB.Where("guest_id = ?", guestID).First(&session).Error

	var projectCount int64
	db.DB.Model(&db.Project{}).Where("guest_id = ?", guestID).Count(&projectCount)
	used := int(projectCount)
	if session.ScanCount > used {
		used = session.ScanCount
	}
	if used >= max {
		return false, "You've used your free Seenly scan. Sign in with Google to open the full report and run more analyses."
	}
	return true, ""
}

// UserCanStartScan caps signed-in re-scans per calendar day by account email.
func UserCanStartScan(email string) (bool, string) {
	email = strings.TrimSpace(strings.ToLower(email))
	if email == "" {
		return false, "Sign in required"
	}
	max := UserMaxScansPerDay()
	since := time.Now().UTC().Truncate(24 * time.Hour)
	var n int64
	db.DB.Model(&db.CrawlRun{}).
		Joins("JOIN projects ON projects.id = crawl_runs.project_id").
		Where("projects.user_email = ? AND crawl_runs.trigger = ? AND crawl_runs.created_at >= ? AND crawl_runs.competitor_id IS NULL",
			email, "full_scan", since).
		Count(&n)
	if int(n) >= max {
		return false, "Daily scan limit reached for this Seenly account. Try again tomorrow."
	}
	return true, ""
}

// RecordGuestScan increments the guest cookie's used free-scan counter.
func RecordGuestScan(guestID string) {
	upsertGuestSession(guestID, true)
}

// ClaimGuestProjects attaches anonymous guest projects to a logged-in account.
func ClaimGuestProjects(email, guestID string) int64 {
	email = strings.TrimSpace(strings.ToLower(email))
	guestID = strings.TrimSpace(guestID)
	if email == "" || guestID == "" {
		return 0
	}
	res := db.DB.Model(&db.Project{}).
		Where("guest_id = ? AND (user_email = '' OR user_email IS NULL)", guestID).
		Updates(map[string]interface{}{
			"user_email": email,
		})
	return res.RowsAffected
}

// IdentityJSON is a small debug helper for /auth/me style responses.
func IdentityJSON(c *gin.Context) gin.H {
	email := c.GetString("user_email")
	guest := c.GetString("guest_id")
	out := gin.H{"authenticated": email != ""}
	if email != "" {
		if claims, ok := c.Get("auth_claims"); ok {
			b, _ := json.Marshal(claims)
			var m map[string]interface{}
			_ = json.Unmarshal(b, &m)
			for k, v := range m {
				out[k] = v
			}
		}
		out["email"] = email
	}
	if guest != "" {
		out["guest_id"] = guest
	}
	return out
}
