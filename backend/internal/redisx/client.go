package redisx

import (
	"context"
	"fmt"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
)

var (
	once   sync.Once
	client *redis.Client
	initErr error
)

// Connect initializes the shared Redis client from REDIS_URL or REDIS_ADDR.
func Connect() error {
	once.Do(func() {
		opt, err := parseOptions()
		if err != nil {
			initErr = err
			return
		}
		c := redis.NewClient(opt)
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		if err := c.Ping(ctx).Err(); err != nil {
			initErr = fmt.Errorf("redis ping: %w", err)
			_ = c.Close()
			return
		}
		client = c
	})
	return initErr
}

func parseOptions() (*redis.Options, error) {
	if url := strings.TrimSpace(os.Getenv("REDIS_URL")); url != "" {
		opt, err := redis.ParseURL(url)
		if err != nil {
			return nil, fmt.Errorf("REDIS_URL: %w", err)
		}
		return opt, nil
	}
	addr := strings.TrimSpace(os.Getenv("REDIS_ADDR"))
	if addr == "" {
		addr = "redis:6379"
	}
	return &redis.Options{
		Addr:     addr,
		Password: strings.TrimSpace(os.Getenv("REDIS_PASSWORD")),
		DB:       0,
	}, nil
}

// Client returns the shared client (may be nil if Connect failed / was skipped).
func Client() *redis.Client {
	return client
}

// Enabled reports whether Redis is connected.
func Enabled() bool {
	return client != nil
}

// Close shuts down the client.
func Close() error {
	if client == nil {
		return nil
	}
	return client.Close()
}
