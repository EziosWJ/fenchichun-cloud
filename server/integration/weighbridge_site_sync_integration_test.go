//go:build integration

package integration

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"

	"fenchichun.local/server/internal/weighbridge"
	"github.com/gin-gonic/gin"
)

// This opt-in test runs the factory repository's integration test against a
// real HTTP handler and two isolated PostgreSQL databases.
func TestPostgresWeighbridgeSiteSync(t *testing.T) {
	siteRepo := os.Getenv("WB_SITE_REPO")
	if siteRepo == "" {
		t.Skip("set WB_SITE_REPO to the factory repository to run the cross-repository test")
	}
	temporary := startMigratedPostgres(t)
	database := openTemporaryDatabase(t, temporary.dsn)
	t.Cleanup(func() { _ = database.Close() })
	const token = "isolated-cross-repository-test-token"
	hash := sha256.Sum256([]byte(token))
	if err := database.GORM.Exec(`INSERT INTO wb_cloud_site (code, name) VALUES ('F001','一厂');
INSERT INTO wb_cloud_scale (site_id, code, name) SELECT id,'WB01','地磅' FROM wb_cloud_site WHERE code='F001';
INSERT INTO wb_cloud_category (code, name) VALUES ('C-C-0001', '谷物');
INSERT INTO wb_cloud_material (code, name, category_id, spec) SELECT 'C-M-0001', '高粱', id, '一级' FROM wb_cloud_category WHERE code='C-C-0001';
INSERT INTO wb_cloud_party (code, name, nature, is_supplier) VALUES ('C-P-0001', '供货方', 'enterprise', true);
INSERT INTO wb_cloud_contact (party_id, name, is_default) SELECT id, '联系人', true FROM wb_cloud_party WHERE code='C-P-0001';`).Error; err != nil {
		t.Fatal(err)
	}
	if err := database.GORM.Exec(`INSERT INTO wb_cloud_credential (site_id, token_hash) SELECT id,? FROM wb_cloud_site WHERE code='F001'`, hex.EncodeToString(hash[:])).Error; err != nil {
		t.Fatal(err)
	}
	router := gin.New()
	weighbridge.RegisterRoutes(router.Group("/api/v1"), weighbridge.NewHandler(weighbridge.NewService(weighbridge.NewRepository(database.GORM))))
	server := httptest.NewServer(router)
	t.Cleanup(server.Close)
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()
	cmd := exec.CommandContext(ctx, "go", "test", "-tags=integration", "./integration", "-run", "^TestPostgresMasterSyncRealCloud$", "-count=1", "-v")
	cmd.Dir = filepath.Join(siteRepo, "server")
	cmd.Env = append(os.Environ(), "WB_SYNC_TEST_URL="+server.URL, "WB_SYNC_TEST_TOKEN="+token)
	output, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("factory integration failed: %v\n%s", err, output)
	}
	if !bytes.Contains(output, []byte("--- PASS: TestPostgresMasterSyncRealCloud")) {
		t.Fatalf("factory integration did not execute successfully:\n%s", output)
	}
	t.Logf("factory integration:\n%s", output)
}
