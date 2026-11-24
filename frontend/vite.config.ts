/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // 목업 클래스 이름(.hero__grid)을 그대로 두고 styles.heroGrid 로 쓴다. 원래 이름도 남는다 (camelCase)
  css: { modules: { localsConvention: "camelCase" } },
  server: {
    // 개발 중에는 API·관리자 화면을 FastAPI(8000)로 넘긴다
    proxy: {
      "/api": "http://localhost:8000",
      "/ws": { target: "ws://localhost:8000", ws: true },
      "/admin": "http://localhost:8000",
      "/media": "http://localhost:8000", // 공개 사진 (uploads.md 3장, main.py 의 /media)
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    // e2e/ 는 Playwright (npm run e2e) — Vitest 가 집지 않게
    exclude: ["node_modules", "dist", "e2e"],
    css: true,
    // 화면 테스트는 jsdom 이 느려 PC·CI 부하에 따라 5초를 넘기곤 했다 (여러 묶음에서 들쭉날쭉 실패).
    // 시간을 넉넉히 주고, 동시에 도는 파일 수를 줄인다 (채은님 제안: --maxWorkers=2 --minWorkers=1).
    testTimeout: 20_000,
    maxWorkers: 2,
    minWorkers: 1,
  },
});
