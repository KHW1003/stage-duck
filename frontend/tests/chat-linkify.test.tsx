/** 11/24 채팅 메시지 속 링크를 눌러 연다 (Linkified) */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Linkified } from "../src/shared/chat/ChatRoom";

describe("채팅 링크", () => {
  it("http·https·www. 주소를 새 창 링크로 만들고, 끝의 마침표·괄호는 링크에서 뺀다", () => {
    const { container } = render(
      <p>
        <Linkified text={"지도 https://map.example.com/place?id=3. 그리고 (www.stageduck.test/venues) 확인해 주세요"} />
      </p>,
    );
    const links = screen.getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["https://map.example.com/place?id=3", "https://www.stageduck.test/venues"]);
    for (const a of links) {
      expect(a).toHaveAttribute("target", "_blank");
      expect(a).toHaveAttribute("rel", "noopener noreferrer");
    }
    expect(container.textContent).toBe("지도 https://map.example.com/place?id=3. 그리고 (www.stageduck.test/venues) 확인해 주세요");
  });

  it("javascript: 같은 다른 형식은 링크로 만들지 않는다", () => {
    render(<p><Linkified text="javascript:alert(1) 눌러 보세요" /></p>);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
