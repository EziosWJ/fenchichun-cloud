//go:build integration

package integration

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"testing"

	"fenchichun.local/server/internal/app"
	platformdatabase "fenchichun.local/server/internal/platform/database"
	"github.com/pressly/goose/v3"
)

func TestPostgresFileAccessURLMigration(t *testing.T) {
	if _, err := exec.LookPath("docker"); err != nil {
		t.Skip("Docker is required for PostgreSQL integration tests")
	}
	storageRoot := t.TempDir()
	temporary := startPostgres(t)
	runMigrations(t, projectRoot(t), temporary.dsn)
	database := openTemporaryDatabase(t, temporary.dsn)
	defer func() { _ = database.Close() }()

	verifyFileAccessURLMigration(t, database, testDependencies(t, database, storageRoot), storageRoot,
		"postgres", filepath.Join(projectRoot(t), "migrations", "schema"))
}

func verifyFileAccessURLMigration(t *testing.T, database *platformdatabase.Database, deps app.Dependencies, storageRoot, dialect, directory string) {
	t.Helper()
	ctx := context.Background()
	if err := goose.SetDialect(dialect); err != nil {
		t.Fatalf("set goose dialect: %v", err)
	}
	goose.SetTableName("goose_schema_db_version")
	if err := goose.DownToContext(ctx, database.SQL, directory, 9); err != nil {
		t.Fatalf("downgrade before file URL migration: %v", err)
	}

	const content = "legacy file content"
	legacyDir := filepath.Join(storageRoot, "legacy")
	if err := os.MkdirAll(legacyDir, 0o750); err != nil {
		t.Fatalf("create legacy storage directory: %v", err)
	}
	if err := os.WriteFile(filepath.Join(legacyDir, "kept.txt"), []byte(content), 0o600); err != nil {
		t.Fatalf("write legacy file: %v", err)
	}

	rows := []struct {
		id     int64
		path   string
		access string
	}{
		{id: 101, path: "legacy/kept.txt", access: "/api/system/file/101/view"},
		{id: 102, path: "legacy/custom.txt", access: "/api/system/file/custom/view"},
		{id: 103, path: "legacy/external.txt", access: "https://cdn.example/legacy/103"},
	}
	for _, row := range rows {
		if err := database.GORM.Exec(
			`INSERT INTO sys_file (id, original_name, storage_name, mime_type, file_size, storage_path, access_url, status, deleted) VALUES (?,?,?,?,?,?,?,1,0)`,
			row.id, "legacy.txt", fmt.Sprintf("legacy-%d.txt", row.id), "text/plain", len(content), row.path, row.access,
		).Error; err != nil {
			t.Fatalf("insert legacy file %d: %v", row.id, err)
		}
	}

	if err := goose.UpContext(ctx, database.SQL, directory); err != nil {
		t.Fatalf("apply file URL migration: %v", err)
	}

	for _, expected := range []struct {
		id     int64
		access string
		name   string
		path   string
	}{
		{id: 101, access: "/api/v1/system/file/101/view", name: "legacy.txt", path: "legacy/kept.txt"},
		{id: 102, access: "/api/system/file/custom/view", name: "legacy.txt", path: "legacy/custom.txt"},
		{id: 103, access: "https://cdn.example/legacy/103", name: "legacy.txt", path: "legacy/external.txt"},
	} {
		var actual struct {
			AccessURL      string
			OriginalName   string
			StoragePath    string
			BusinessModule *string
		}
		if err := database.GORM.Table("sys_file").
			Select("access_url, original_name, storage_path, business_module").
			Where("id = ?", expected.id).Take(&actual).Error; err != nil {
			t.Fatalf("load migrated file %d: %v", expected.id, err)
		}
		if actual.AccessURL != expected.access || actual.OriginalName != expected.name || actual.StoragePath != expected.path {
			t.Fatalf("migrated file %d = %+v, want access %q name %q path %q", expected.id, actual, expected.access, expected.name, expected.path)
		}
	}

	router, err := app.Build(testAPIConfig(), database, deps)
	if err != nil {
		t.Fatalf("build file API after migration: %v", err)
	}
	token := loginAdmin(t, router)
	view := servePlain(t, router, http.MethodGet, "/api/v1/system/file/101/view", token)
	if view.Code != http.StatusOK || view.Body.String() != content {
		t.Fatalf("migrated file view = %d %q, want 200 %q", view.Code, view.Body.String(), content)
	}
	old := servePlain(t, router, http.MethodGet, "/api/system/file/101/view", token)
	if old.Code != http.StatusNotFound {
		t.Fatalf("legacy file route status = %d, want %d", old.Code, http.StatusNotFound)
	}
}
