import "@testing-library/jest-dom/vitest";
import { configure } from "@testing-library/react";

// findBy·waitFor 기본 1초 → 5초. 느린 PC·CI 에서 화면이 늦게 그려져 못 찾던 실패를 막는다 (vite.config testTimeout 과 함께)
configure({ asyncUtilTimeout: 5000 });

// jsdom 에 없는 window.scrollTo — 쪽 이동 화면이 부를 때 "Not implemented" 오류 로그가 쌓이지 않게
window.scrollTo = (() => {}) as typeof window.scrollTo;
