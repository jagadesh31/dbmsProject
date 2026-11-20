package llm

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/sashabaranov/go-openai"
)

// Cheap DeepSeek Flash — used for every Seenly LLM call (brand, intents, GEO cards, fixes).
const modelDeepSeekFlash = "deepseek-flash"

// GetModel returns the unified cheap DeepSeek model for all pipeline steps.
func GetModel() string {
	return CanonicalModel(firstNonEmpty(
		os.Getenv("DEEPSEEK_MODEL"),
		os.Getenv("VISORA_LLM_MODEL"),
		modelDeepSeekFlash,
	))
}

// CanonicalModel forces every configured model id onto DeepSeek Flash (cheap).
func CanonicalModel(model string) string {
	m := strings.ToLower(strings.TrimSpace(model))
	if m == "" {
		return modelDeepSeekFlash
	}
	// Already a native DeepSeek Flash id (including legacy aliases DeepSeek still accepts).
	switch m {
	case "deepseek-flash", "deepseek-v4-flash", "deepseek-v4-flash-vision-exp",
		"deepseek-chat", "deepseek/deepseek-flash", "deepseek/deepseek-v4-flash",
		"deepseek/deepseek-v4-flash-vision-exp", "deepseek/deepseek-chat":
		return modelDeepSeekFlash
	}
	if strings.Contains(m, "deepseek") && (strings.Contains(m, "flash") || strings.Contains(m, "chat")) {
		return modelDeepSeekFlash
	}
	// Anything else (gateway slugs, Claude, Gemini, Grok, Pro) → cheap Flash.
	return modelDeepSeekFlash
}

func fallbackModels(primary string) []string {
	flash := CanonicalModel(primary)
	return []string{flash}
}

// GetGeoModel returns the GEO model (always cheap DeepSeek Flash).
func GetGeoModel() string {
	return CanonicalModel(firstNonEmpty(os.Getenv("GEO_OPENAI_MODEL"), GetModel()))
}

func apiKey() string {
	return firstNonEmpty(
		strings.TrimSpace(os.Getenv("DEEPSEEK_API_KEY")),
		strings.TrimSpace(os.Getenv("OPENAI_API_KEY")),
		strings.TrimSpace(os.Getenv("GEO_OPENAI_API_KEY")),
	)
}

func apiBaseURL() string {
	base := firstNonEmpty(
		strings.TrimRight(os.Getenv("DEEPSEEK_BASE_URL"), "/"),
		strings.TrimRight(os.Getenv("OPENAI_BASE_URL"), "/"),
		strings.TrimRight(os.Getenv("GEO_OPENAI_BASE_URL"), "/"),
		"https://api.deepseek.com/v1",
	)
	// If someone left the Vercel gateway URL while using a DeepSeek key, force DeepSeek host.
	if strings.Contains(strings.ToLower(base), "ai-gateway.vercel") || strings.Contains(strings.ToLower(base), "openai.com") {
		if strings.TrimSpace(os.Getenv("DEEPSEEK_API_KEY")) != "" || preferDeepSeek() {
			return "https://api.deepseek.com/v1"
		}
	}
	if !strings.HasSuffix(base, "/v1") && strings.Contains(strings.ToLower(base), "deepseek.com") {
		return strings.TrimRight(base, "/") + "/v1"
	}
	return base
}

func preferDeepSeek() bool {
	m := strings.ToLower(firstNonEmpty(os.Getenv("DEEPSEEK_MODEL"), os.Getenv("VISORA_LLM_MODEL")))
	return strings.Contains(m, "deepseek") || m == ""
}

func credentialsForModel(model string) (key, base string) {
	_ = model
	return apiKey(), apiBaseURL()
}

func nativeDeepSeekModel(model, base string) string {
	model = CanonicalModel(model)
	if strings.Contains(strings.ToLower(base), "deepseek.com") {
		// Native DeepSeek Chat Completions ids (no provider prefix).
		return modelDeepSeekFlash
	}
	return model
}

func deepSeekThinkingDisabled(base string) bool {
	return strings.Contains(strings.ToLower(base), "deepseek.com")
}

// NewClient builds an OpenAI-compatible client pointed at DeepSeek.
func NewClient() (*openai.Client, error) {
	key := apiKey()
	if key == "" {
		return nil, fmt.Errorf("DEEPSEEK_API_KEY (or OPENAI_API_KEY) not set")
	}
	config := openai.DefaultConfig(key)
	config.BaseURL = apiBaseURL()
	return openai.NewClientWithConfig(config), nil
}

// NewGeoClient builds the GEO client — same DeepSeek key/base as core AI.
func NewGeoClient() (*openai.Client, error) {
	return NewClient()
}

type chatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type chatRequest struct {
	Model       string        `json:"model"`
	Messages    []chatMessage `json:"messages"`
	Temperature float32       `json:"temperature,omitempty"`
	MaxTokens   int           `json:"max_tokens,omitempty"`
	Thinking    *struct {
		Type string `json:"type"`
	} `json:"thinking,omitempty"`
	ResponseFormat map[string]interface{} `json:"response_format,omitempty"`
}

type chatResponse struct {
	Choices []struct {
		Message struct {
			Content          string `json:"content"`
			ReasoningContent string `json:"reasoning_content"`
		} `json:"message"`
	} `json:"choices"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error"`
}

// Complete calls DeepSeek Flash (OpenAI-compatible chat completions).
func Complete(ctx context.Context, model string, messages []openai.ChatCompletionMessage, temperature float32, maxTokens int) (string, error) {
	var lastErr error
	for _, try := range fallbackModels(model) {
		text, err := completeOnce(ctx, try, messages, temperature, maxTokens)
		if err == nil {
			return text, nil
		}
		lastErr = err
	}
	if lastErr != nil {
		return "", lastErr
	}
	return "", fmt.Errorf("empty LLM response")
}

func completeOnce(ctx context.Context, model string, messages []openai.ChatCompletionMessage, temperature float32, maxTokens int) (string, error) {
	if model == "" {
		model = GetModel()
	}
	key, base := credentialsForModel(model)
	if key == "" {
		return "", fmt.Errorf("DEEPSEEK_API_KEY (or OPENAI_API_KEY) not set")
	}
	model = nativeDeepSeekModel(model, base)

	payload := chatRequest{
		Model:       model,
		Temperature: temperature,
		MaxTokens:   maxTokens,
	}
	// Flash defaults to thinking mode — disable it to keep Seenly cheap + fast.
	if deepSeekThinkingDisabled(base) {
		payload.Thinking = &struct{ Type string `json:"type"` }{Type: "disabled"}
	}
	for _, m := range messages {
		payload.Messages = append(payload.Messages, chatMessage{Role: m.Role, Content: m.Content})
	}

	body, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, base+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+key)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept-Language", "en-US,en")

	client := &http.Client{Timeout: 90 * time.Second}
	res, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(res.Body)

	var parsed chatResponse
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return "", fmt.Errorf("decode chat response: %w (%s)", err, truncate(string(raw), 200))
	}
	if res.StatusCode >= 400 {
		msg := string(raw)
		if parsed.Error != nil && parsed.Error.Message != "" {
			msg = parsed.Error.Message
		}
		return "", fmt.Errorf("chat completion %d: %s", res.StatusCode, truncate(msg, 300))
	}
	if len(parsed.Choices) == 0 {
		return "", fmt.Errorf("empty LLM response")
	}
	text := strings.TrimSpace(parsed.Choices[0].Message.Content)
	if text == "" {
		text = strings.TrimSpace(parsed.Choices[0].Message.ReasoningContent)
	}
	if text == "" {
		return "", fmt.Errorf("empty LLM content from %s", model)
	}
	return text, nil
}

// CompleteJSON is Complete + JSON-object bias for structured outputs.
func CompleteJSON(ctx context.Context, model string, messages []openai.ChatCompletionMessage, temperature float32) (string, error) {
	if model == "" {
		model = GetModel()
	}
	models := fallbackModels(model)

	var lastErr error
	for _, try := range models {
		text, err := completeJSONOnce(ctx, try, messages, temperature)
		if err == nil && strings.Contains(text, "{") {
			return ExtractJSONObject(text), nil
		}
		if err != nil {
			lastErr = err
		}
	}

	for _, try := range models {
		text, err := Complete(ctx, try, messages, temperature, 4096)
		if err != nil {
			lastErr = err
			continue
		}
		extracted := ExtractJSONObject(text)
		if strings.Contains(extracted, "{") {
			return extracted, nil
		}
	}
	if lastErr != nil {
		return "", lastErr
	}
	return "", fmt.Errorf("empty JSON from %s", model)
}

func completeJSONOnce(ctx context.Context, model string, messages []openai.ChatCompletionMessage, temperature float32) (string, error) {
	key, base := credentialsForModel(model)
	if key == "" {
		return "", fmt.Errorf("DEEPSEEK_API_KEY (or OPENAI_API_KEY) not set")
	}
	model = nativeDeepSeekModel(model, base)

	payload := chatRequest{
		Model:       model,
		Temperature: temperature,
		MaxTokens:   8192,
		ResponseFormat: map[string]interface{}{
			"type": "json_object",
		},
	}
	if deepSeekThinkingDisabled(base) {
		payload.Thinking = &struct{ Type string `json:"type"` }{Type: "disabled"}
	}
	for _, m := range messages {
		payload.Messages = append(payload.Messages, chatMessage{Role: m.Role, Content: m.Content})
	}

	body, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, base+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+key)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept-Language", "en-US,en")

	client := &http.Client{Timeout: 90 * time.Second}
	res, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(res.Body)

	var parsed chatResponse
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return "", fmt.Errorf("decode chat response: %w", err)
	}
	if res.StatusCode >= 400 {
		payload.ResponseFormat = nil
		body2, _ := json.Marshal(payload)
		req2, _ := http.NewRequestWithContext(ctx, http.MethodPost, base+"/chat/completions", bytes.NewReader(body2))
		req2.Header.Set("Authorization", "Bearer "+key)
		req2.Header.Set("Content-Type", "application/json")
		res2, err2 := client.Do(req2)
		if err2 != nil {
			return "", fmt.Errorf("chat completion %d: %s", res.StatusCode, truncate(string(raw), 300))
		}
		defer res2.Body.Close()
		raw2, _ := io.ReadAll(res2.Body)
		if res2.StatusCode >= 400 {
			return "", fmt.Errorf("chat completion %d: %s", res2.StatusCode, truncate(string(raw2), 300))
		}
		if err := json.Unmarshal(raw2, &parsed); err != nil {
			return "", fmt.Errorf("decode chat response: %w", err)
		}
	}
	if len(parsed.Choices) == 0 {
		return "", fmt.Errorf("empty LLM response")
	}
	text := strings.TrimSpace(parsed.Choices[0].Message.Content)
	if text == "" {
		text = strings.TrimSpace(parsed.Choices[0].Message.ReasoningContent)
	}
	if text == "" {
		return "", fmt.Errorf("empty LLM content")
	}
	return text, nil
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if strings.TrimSpace(v) != "" {
			return strings.TrimSpace(v)
		}
	}
	return ""
}

// ExtractJSONObject pulls the first complete JSON object from an LLM response that may
// include markdown fences, thinking tags, trailing instructions, or preamble text.
func ExtractJSONObject(raw string) string {
	raw = strings.TrimSpace(raw)
	if strings.HasPrefix(raw, "```") {
		raw = strings.TrimPrefix(raw, "```json")
		raw = strings.TrimPrefix(raw, "```JSON")
		raw = strings.TrimPrefix(raw, "```")
		if idx := strings.LastIndex(raw, "```"); idx >= 0 {
			raw = raw[:idx]
		}
		raw = strings.TrimSpace(raw)
	}
	start := strings.Index(raw, "{")
	if start < 0 {
		return raw
	}
	depth := 0
	inString := false
	escape := false
	for i := start; i < len(raw); i++ {
		ch := raw[i]
		if inString {
			if escape {
				escape = false
				continue
			}
			if ch == '\\' {
				escape = true
				continue
			}
			if ch == '"' {
				inString = false
			}
			continue
		}
		switch ch {
		case '"':
			inString = true
		case '{':
			depth++
		case '}':
			depth--
			if depth == 0 {
				return strings.TrimSpace(raw[start : i+1])
			}
		}
	}
	end := strings.LastIndex(raw, "}")
	if end > start {
		return strings.TrimSpace(raw[start : end+1])
	}
	return raw
}
