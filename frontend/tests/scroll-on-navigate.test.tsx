/** 11/24 화면을 옮기면 맨 위·#구역 첫머리에서 연다 (ScrollOnNavigate) */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScrollOnNavigate } from "../src/shared/layout/ScrollOnNavigate";

function Home() {
  const navigate = useNavigate();
  return (
    <>
      <Link to="/faq">자주 묻는 질문</Link>
      <Link to="/guide#fees">이용료 안내</Link>
      <button type="button" onClick={() => navigate("?chat=3")}>채팅 열기</button>
    </>
  );
}

function renderApp() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <ScrollOnNavigate />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/faq" element={<h1>자주 묻는 질문</h1>} />
        <Route path="/guide" element={<section id="fees">이용료</section>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("화면 이동 스크롤", () => {
  const scrollTo = vi.fn();
  const intoView = vi.fn();
  beforeEach(() => {
    vi.stubGlobal("scrollTo", scrollTo);
    Element.prototype.scrollIntoView = intoView;
  });
  afterEach(() => {
    scrollTo.mockClear();
    intoView.mockClear();
  });

  it("다른 화면으로 가면 맨 위에서 연다", async () => {
    renderApp();
    scrollTo.mockClear();
    await userEvent.click(screen.getByRole("link", { name: "자주 묻는 질문" }));
    expect(await screen.findByRole("heading", { name: "자주 묻는 질문" })).toBeInTheDocument();
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: "instant" });
  });

  it("#구역이 있으면 그 구역 첫머리로 간다", async () => {
    renderApp();
    await userEvent.click(screen.getByRole("link", { name: "이용료 안내" }));
    expect(await screen.findByText("이용료")).toBeInTheDocument();
    expect(intoView).toHaveBeenCalledWith({ block: "start", behavior: "instant" });
  });

  it("?chat= 처럼 주소 뒤 조건만 바뀌면 움직이지 않는다", async () => {
    renderApp();
    scrollTo.mockClear();
    await userEvent.click(screen.getByRole("button", { name: "채팅 열기" }));
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
