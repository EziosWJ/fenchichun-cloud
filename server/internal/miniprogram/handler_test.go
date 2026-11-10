package miniprogram

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

type stubService struct {
	value Dictionary
	err   error
}

func (s stubService) Dictionary(context.Context) (Dictionary, error) {
	return s.value, s.err
}

func newRouter(service HandlerService) *gin.Engine {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	NewHandler(service).Register(router)
	return router
}

func TestDictionariesServesAnonymousSnapshot(t *testing.T) {
	want := Dictionary{
		Version:   "abc123",
		Sites:     []Site{{Code: "F001", Name: "一号厂区"}},
		Materials: []Material{{Code: "C-M-0008", Name: "木片", InspectionMethod: "visual"}},
		Suppliers: []Supplier{{Code: "C-P-0001", Name: "上海福里希尔食品有限公司"}},
		Granaries: []Granary{{ID: 4, Name: "1号仓"}},
	}
	response := httptest.NewRecorder()
	newRouter(stubService{value: want}).ServeHTTP(
		response,
		httptest.NewRequest(http.MethodGet, "/miniprogram/dictionaries", nil),
	)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusOK)
	}
	var body struct {
		Code    int        `json:"code"`
		Message string     `json:"message"`
		Data    Dictionary `json:"data"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if body.Code != http.StatusOK || body.Data.Version != want.Version {
		t.Fatalf("body = %+v", body)
	}
	if len(body.Data.Materials) != 1 || body.Data.Materials[0].InspectionMethod != "visual" {
		t.Fatalf("materials = %+v", body.Data.Materials)
	}
}

func TestDictionariesReportsLoadFailure(t *testing.T) {
	response := httptest.NewRecorder()
	newRouter(stubService{err: errors.New("database unavailable")}).ServeHTTP(
		response,
		httptest.NewRequest(http.MethodGet, "/miniprogram/dictionaries", nil),
	)

	if response.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusInternalServerError)
	}
	var body struct {
		Code int `json:"code"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if body.Code != http.StatusInternalServerError {
		t.Fatalf("code = %d", body.Code)
	}
}
