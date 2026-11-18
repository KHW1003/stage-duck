import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./shared/styles/base.css";
import "./shared/styles/kit.css";
import "./shared/styles/kit-mobile.css";
// 공통 CSS 를 먼저 불러야 화면 CSS 가 같은 우선순위에서 뒤에 와 덮어쓴다 (목업 app.css → 페이지 <style> 순서)
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
