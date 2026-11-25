/** 11/25 프로필 사진이 보이는 모든 화면: 공용 아바타는 사진이 있으면 사진, 없으면 첫 글자 */
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Avatar } from "../src/shared/chat/parts";

describe("Avatar", () => {
  it("사진 주소가 있으면 사진(--img)을 깔고 글자는 안 보인다", () => {
    const { container } = render(<Avatar name="무등아트홀" src="/media/supplier_image/a_t.webp" />);
    const el = container.querySelector(".avatar") as HTMLElement;
    expect(el.style.getPropertyValue("--img")).toContain("/media/supplier_image/a_t.webp");
    expect(el).toHaveTextContent("");
  });

  it("사진이 없으면 이름 첫 글자", () => {
    const { container } = render(<Avatar name="무등아트홀" src={null} />);
    expect(container.querySelector(".avatar")).toHaveTextContent("무");
  });
});
