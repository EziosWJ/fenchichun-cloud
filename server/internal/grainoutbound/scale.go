package grainoutbound

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"
)

// ScaleClient reads the local site's public device endpoint. The latest
// standalone-site server exposes /api/weighing/scales/{code}/device without a
// token; older deployments still require Bearer auth, so a configured service
// account is used only as a fallback on 401.
type ScaleClient struct {
	baseURL      string
	username     string
	password     string
	defaultScale string
	mock         bool
	http         *http.Client
	mu           sync.Mutex
	token        string
	expiresAt    time.Time
}

func NewScaleClient() *ScaleClient {
	client := &ScaleClient{
		baseURL:      strings.TrimRight(strings.TrimSpace(os.Getenv("WEIGHBRIDGE_API_URL")), "/"),
		username:     strings.TrimSpace(os.Getenv("WEIGHBRIDGE_USERNAME")),
		password:     os.Getenv("WEIGHBRIDGE_PASSWORD"),
		defaultScale: strings.TrimSpace(os.Getenv("WEIGHBRIDGE_SCALE_CODE")),
		http:         &http.Client{Timeout: 4 * time.Second},
	}
	if client.baseURL == "" && strings.EqualFold(os.Getenv("APP_ENV"), "dev") {
		client.baseURL = "http://127.0.0.1:8900/api"
		client.mock = true
	}
	if client.defaultScale == "" {
		client.defaultScale = "WB01"
	}
	return client
}

// Read reads the latest weight. stage is only used by the development mock so
// the first and second confirmations differ.
func (c *ScaleClient) Read(ctx context.Context, scaleCode, stage string) (ScaleReading, error) {
	if scaleCode == "" {
		scaleCode = c.defaultScale
	}
	if c.mock {
		weight := int64(32500)
		if stage == "second" {
			weight = int64(8200)
		}
		now := time.Now()
		return ScaleReading{
			Available: true, Online: true, Stable: true, DeviceOK: true,
			WeightMilliTonne: weight, ReceivedAt: &now, Mock: true,
			Message: "模拟读数（开发环境未接现场地磅）",
		}, nil
	}
	if c.baseURL == "" {
		return ScaleReading{Message: "地磅接口未配置"}, nil
	}
	if scaleCode == "" {
		return ScaleReading{Message: "未配置地磅号"}, nil
	}
	body, err := c.get(ctx, "/weighing/scales/"+url.PathEscape(scaleCode)+"/device")
	if err != nil {
		return ScaleReading{Message: "地磅服务不可用"}, err
	}
	data, err := parseDevicePayload(body)
	if err != nil {
		return ScaleReading{Message: "地磅响应格式错误"}, err
	}
	reading := ScaleReading{
		Online: data.Online, Stable: data.Stable, DeviceOK: data.DeviceOK,
		ReceivedAt: data.ReceivedAt,
	}
	if data.Weight != nil {
		if weight, parseErr := parseTonneString(*data.Weight); parseErr == nil {
			reading.WeightMilliTonne = weight
		} else {
			reading.Message = "称重读数无效"
		}
	}
	switch {
	case !reading.Online:
		reading.Message = "地磅离线"
	case !reading.DeviceOK:
		reading.Message = "地磅仪表故障"
	case data.Weight == nil:
		reading.Message = "重量不可用，请等待仪表上报"
	case !reading.Stable:
		reading.Message = "读数不稳定，请等待稳定"
	case data.ReceivedAt != nil && time.Since(*data.ReceivedAt) > 5*time.Second:
		reading.Message = "称重读数已超时"
	case reading.Message == "":
		reading.Available = true
		reading.Message = "读数可用"
	}
	if data.Error != "" && !reading.Available {
		reading.Message = data.Error
	}
	return reading, nil
}

type devicePayload struct {
	Online     bool       `json:"online"`
	DeviceOK   bool       `json:"deviceOk"`
	Stable     bool       `json:"stable"`
	Weight     *string    `json:"weight"`
	Unit       string     `json:"unit"`
	ReceivedAt *time.Time `json:"receivedAt"`
	Error      string     `json:"error"`
}

// parseDevicePayload accepts both the public raw payload and the historical
// {code,message,data} envelope used by the authenticated endpoint.
func parseDevicePayload(body []byte) (devicePayload, error) {
	var envelope struct {
		Code    int             `json:"code"`
		Message string          `json:"message"`
		Data    json.RawMessage `json:"data"`
	}
	if err := json.Unmarshal(body, &envelope); err != nil {
		return devicePayload{}, err
	}
	payload := body
	if len(envelope.Data) > 0 && string(envelope.Data) != "null" {
		payload = envelope.Data
	}
	var data devicePayload
	if err := json.Unmarshal(payload, &data); err != nil {
		return devicePayload{}, err
	}
	return data, nil
}

func (c *ScaleClient) get(ctx context.Context, path string) ([]byte, error) {
	body, status, err := c.request(ctx, path, "")
	if err != nil {
		return nil, err
	}
	if status == http.StatusOK {
		return body, nil
	}
	if status != http.StatusUnauthorized {
		return nil, fmt.Errorf("weighbridge http %d", status)
	}
	// Older local sites still require a Bearer token for the device endpoint.
	token, loginErr := c.login(ctx, false)
	if loginErr != nil {
		return nil, loginErr
	}
	body, status, err = c.request(ctx, path, token)
	if err != nil {
		return nil, err
	}
	if status != http.StatusOK {
		return nil, fmt.Errorf("weighbridge http %d", status)
	}
	return body, nil
}

func (c *ScaleClient) request(ctx context.Context, path, token string) ([]byte, int, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+path, nil)
	if err != nil {
		return nil, 0, err
	}
	if token != "" {
		request.Header.Set("Authorization", token)
	}
	response, err := c.http.Do(request)
	if err != nil {
		return nil, 0, err
	}
	defer response.Body.Close()
	body, err := io.ReadAll(response.Body)
	if err != nil {
		return nil, response.StatusCode, err
	}
	return body, response.StatusCode, nil
}

func (c *ScaleClient) login(ctx context.Context, force bool) (string, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if !force && c.token != "" && time.Now().Before(c.expiresAt) {
		return c.token, nil
	}
	payload, _ := json.Marshal(map[string]string{"username": c.username, "password": c.password})
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/auth/login", strings.NewReader(string(payload)))
	if err != nil {
		return "", err
	}
	request.Header.Set("Content-Type", "application/json")
	response, err := c.http.Do(request)
	if err != nil {
		return "", err
	}
	defer response.Body.Close()
	body, err := io.ReadAll(response.Body)
	if err != nil {
		return "", err
	}
	var envelope struct {
		Code    int    `json:"code"`
		Message string `json:"message"`
		Data    struct {
			TokenValue string `json:"tokenValue"`
			ExpiresIn  int64  `json:"expiresIn"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &envelope); err != nil {
		return "", err
	}
	if envelope.Code != 200 || envelope.Data.TokenValue == "" {
		return "", fmt.Errorf("地磅服务登录失败：%s", envelope.Message)
	}
	c.token = envelope.Data.TokenValue
	ttl := time.Duration(envelope.Data.ExpiresIn) * time.Second
	if ttl <= 0 {
		ttl = 30 * time.Minute
	}
	c.expiresAt = time.Now().Add(ttl - time.Minute)
	return c.token, nil
}

// parseTonneString converts the local site's tonne decimal string (up to three
// decimals) into milli-tonne without floating point rounding.
func parseTonneString(value string) (int64, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return 0, fmt.Errorf("empty weight")
	}
	negative := strings.HasPrefix(value, "-")
	if negative {
		value = value[1:]
	}
	parts := strings.Split(value, ".")
	if len(parts) > 2 || parts[0] == "" {
		return 0, fmt.Errorf("invalid weight")
	}
	whole, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		return 0, err
	}
	fraction := ""
	if len(parts) == 2 {
		fraction = parts[1]
	}
	if len(fraction) > 3 {
		return 0, fmt.Errorf("invalid weight precision")
	}
	for len(fraction) < 3 {
		fraction += "0"
	}
	milli, err := strconv.ParseInt(fraction, 10, 64)
	if err != nil {
		return 0, err
	}
	result := whole*1000 + milli
	if negative {
		result = -result
	}
	return result, nil
}
