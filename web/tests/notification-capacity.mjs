import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";
import { createServer } from "node:net";
import { mkdtemp, writeFile, rm, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Called by the database HTTP capacity contracts. Credentials arrive on stdin.
let input = "";
for await (const chunk of process.stdin) input += chunk;
const { apiURL, token } = JSON.parse(input);
const reservation = createServer();
await new Promise((resolve, reject) => { reservation.once("error", reject); reservation.listen(0, "127.0.0.1", resolve); });
const port = reservation.address().port;
await new Promise((resolve) => reservation.close(resolve));
const base = `http://127.0.0.1:${port}`;
const project = fileURLToPath(new URL("..", import.meta.url));
const cache = await mkdtemp(path.join(project, "node_modules/.notification-capacity-"));
const configPath = path.join(cache, "config.mjs");
await writeFile(configPath, `import react from "@vitejs/plugin-react"; export default { plugins: [react()], cacheDir: ${JSON.stringify(path.join(cache, "deps"))} };`);
const vite = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", String(port), "--strictPort", "--config", configPath], { cwd: new URL("..", import.meta.url), env: { ...process.env, VITE_API_BASE_URL: apiURL }, stdio: "pipe" });
let output = "";
vite.stdout.on("data", (chunk) => { output += chunk; });
vite.stderr.on("data", (chunk) => { output += chunk; });
async function launchBrowser() {
  const explicit = process.env.PLAYWRIGHT_EXECUTABLE_PATH;
  if (explicit) return chromium.launch({ headless: true, executablePath: explicit });
  try {
    return await chromium.launch({ headless: true });
  } catch (error) {
    if (!/Executable doesn't exist/.test(String(error))) throw error;
    // 允许复用本机已下载的其他 Playwright Chromium 版本。
    const root = path.join(homedir(), ".cache", "ms-playwright");
    const entries = await readdir(root).catch(() => []);
    const candidates = entries
      .filter((entry) => entry.startsWith("chromium"))
      .sort()
      .reverse()
      .flatMap((entry) => [
        path.join(root, entry, "chrome-linux64", "chrome"),
        path.join(root, entry, "chrome-linux", "chrome"),
        path.join(root, entry, "chrome-headless-shell-linux64", "chrome-headless-shell"),
      ]);
    for (const executablePath of candidates) {
      try {
        return await chromium.launch({ headless: true, executablePath });
      } catch {
        // 尝试下一个候选路径。
      }
    }
    throw error;
  }
}

let browser;
try {
  let started = false;
  for (let i = 0; i < 60; i += 1) { try { if ((await fetch(base)).ok) { started = true; break; } } catch { /* startup */ } await delay(250); }
  if (!started) throw new Error(`Vite startup failed: ${output}`);
  browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript((value) => localStorage.setItem("base-admin-auth", JSON.stringify({ token: value })), token);
  const initialPage = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/v1/system/notification/page" && response.ok());
  await page.goto(`${base}/notifications`);
  await initialPage;
  await page.getByText("暂无通知", { exact: true }).waitFor();
  const title = "容量验证群发消息";
  const response = await fetch(`${apiURL}/api/v1/system/notification`, { method: "POST", headers: { Authorization: token, "Content-Type": "application/json" }, body: JSON.stringify({ title, content: "1000个启用账号，100条并发连接", allUsers: true }) });
  const successTimeUnixMs = Date.now();
  const successAt = performance.now();
  assert.equal(response.status, 200);
  assert.equal((await response.json()).code, 200);
  await page.getByText(title, { exact: true }).waitFor({ timeout: 5000 });
  const browserUpdateMs = performance.now() - successAt;
  assert.ok(browserUpdateMs < 5000, `page update took ${browserUpdateMs}ms`);
  assert.deepEqual(errors, []);
  await page.screenshot({ path: `/tmp/notification-capacity-${new URL(apiURL).port}.png`, fullPage: true });
  console.log(JSON.stringify({ browserUpdateMs, successTimeUnixMs, viewport: "1440x1000", browser: browser.version(), network: "loopback HTTP, no proxy buffering" }));
} finally {
  await browser?.close();
  vite.kill("SIGTERM");
  if (vite.exitCode === null) await new Promise((resolve) => vite.once("exit", resolve));
  await rm(cache, { recursive: true, force: true });
}
