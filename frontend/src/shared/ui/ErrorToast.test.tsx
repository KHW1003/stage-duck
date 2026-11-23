import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ApiError } from "../api/client";
import { ErrorToast, showErrorToast } from "./ErrorToast";

describe("ErrorToast", () => {
  it("서버 문구를 그대로 보이고, 연결 오류는 연결 안내를, [닫기]로 닫는다", () => {
    render(<ErrorToast />);
    act(() => showErrorToast(new TypeError("Failed to fetch")));
    expect(screen.getByRole("alert").textContent).toContain("서버와 연결되지 않았어요");
    act(() => showErrorToast(new ApiError(409, { code: "X", message: "이미 저장한 업체예요.", fieldErrors: [] })));
    expect(screen.getByRole("alert").textContent).toContain("이미 저장한 업체예요.");
    fireEvent.click(screen.getByRole("button", { name: "알림 닫기" }));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
