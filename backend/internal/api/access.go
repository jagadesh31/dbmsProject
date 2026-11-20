package api

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"visora-backend/internal/auth"
	"visora-backend/internal/db"
)

// RequireIdentity allows logged-in users or browsers with a guest cookie.
func RequireIdentity() gin.HandlerFunc {
	return func(c *gin.Context) {
		email := strings.TrimSpace(c.GetString("user_email"))
		if email != "" {
			c.Next()
			return
		}
		guest := auth.EnsureGuest(c)
		if guest == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error":          "authentication required",
				"login_required": true,
			})
			return
		}
		c.Next()
	}
}

// RequireProjectAccess ensures the caller owns the :id project (email or guest).
func RequireProjectAccess() gin.HandlerFunc {
	return func(c *gin.Context) {
		ref := c.Param("id")
		if ref == "" {
			c.Next()
			return
		}
		var p db.Project
		if raw, ok := c.Get("project"); ok {
			switch v := raw.(type) {
			case db.Project:
				p = v
			case *db.Project:
				if v != nil {
					p = *v
				}
			}
		}
		if p.ID == 0 {
			found, err := db.FindProjectByRef(ref)
			if err != nil || found == nil {
				c.AbortWithStatusJSON(http.StatusNotFound, gin.H{"error": "Project not found"})
				return
			}
			p = *found
			c.Set("project", p)
		}
		if !ownsProject(c, p) {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"error":          "Sign in to open this Seenq report",
				"login_required": true,
			})
			return
		}
		c.Next()
	}
}

func ownsProject(c *gin.Context, p db.Project) bool {
	email := strings.TrimSpace(strings.ToLower(c.GetString("user_email")))
	guest := strings.TrimSpace(c.GetString("guest_id"))
	ownerEmail := strings.TrimSpace(strings.ToLower(p.UserEmail))
	if email != "" && ownerEmail != "" && email == ownerEmail {
		return true
	}
	// Logged-in user claiming / reopening a guest project they still have the cookie for.
	if email != "" && p.GuestID != "" && guest != "" && p.GuestID == guest {
		return true
	}
	// Anonymous guest viewing their own in-progress scan.
	if email == "" && p.GuestID != "" && guest != "" && p.GuestID == guest && ownerEmail == "" {
		return true
	}
	return false
}

func actorEmail(c *gin.Context) string {
	return strings.TrimSpace(c.GetString("user_email"))
}

func actorGuest(c *gin.Context) string {
	if g := strings.TrimSpace(c.GetString("guest_id")); g != "" {
		return g
	}
	return auth.EnsureGuest(c)
}
