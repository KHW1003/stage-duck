/**
 * 브라우저 E2E 테스트 (Playwright). 실행: `npm run build && npm run e2e`
 * - 서버: e2e/server.py — 임시 SQLite + 시연 데이터, FastAPI 가 빌드된 화면을 보낸다 (시연 서버와 같은 길)
 * - 화면 폭 두 가지: 웹 1440 · 휴대폰 375 (DESIGN.md 2.5, 목업 760·560px 미디어 쿼리)
 * 단위 테스트(Vitest)는 tests/, E2E 는 e2e/ 에 둔다.
 */
import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

const PORT = Number(process.env.E2E_PORT ?? 8010);
// backend 가상환경 python (CI 는 PYTHON=python)
const PYTHON =
  process.env.PYTHON ??
  path.resolve(process.cwd(), "..", "backend", ".venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "ko-KR",
  },
  projects: [
    { name: "web-1440", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "mobile-375", use: { ...devices["Pixel 7"], viewport: { width: 375, height: 812 } } },
  ],
  webServer: {
    command: `"${PYTHON}" e2e/server.py`,
    url: `http://127.0.0.1:${PORT}/api/v1/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: { E2E_PORT: String(PORT) },
  },
});
