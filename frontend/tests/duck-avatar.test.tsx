/** 오리 프로필 그림 (11/26): 같은 값이면 같은 그림, 역할별로 고를 수 있는 조합, 사진·오리·글자 순서 */
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { duckPicks, duckSvg } from "../src/shared/ui/duck";
import { ProfileAvatar } from "../src/shared/ui/ProfileAvatar";
import { Author } from "../src/features/community/Author";

const range = (n: number) => Array.from({ length: n }, (_, i) => i);
const grid = (wear: number, hold: number, skip: string[] = []) =>
  range(wear).flatMap((w) => range(hold).map((h) => `${w}-${h}`)).filter((p) => !skip.includes(p));

describe("duck", () => {
  it("고를 수 있는 조합은 서버 backend/app/profile/calc.py DUCK_PICKS 와 같은 표다", () => {
    expect(duckPicks("USER")).toEqual(grid(6, 4));
    expect(duckPicks("VENUE")).toEqual(grid(3, 3, ["2-2"]));
    expect(duckPicks("EQUIPMENT")).toEqual(grid(3, 3));
    expect(duckPicks("INSTALL")).toEqual(grid(3, 4, ["1-3"]));
    expect(duckPicks("ENGINEER")).toEqual(grid(3, 3, ["2-0", "2-1"]));
    expect(duckPicks("ADMIN")).toEqual(duckPicks("USER")); // 모르는 역할은 뮤지션 오리
  });

  it("고른 조합이면 그 입는 것·드는 것으로 그리고, 없는 조합이면 seed 로 정한다", () => {
    for (const role of ["USER", "VENUE", "EQUIPMENT", "INSTALL", "ENGINEER"]) {
      for (const pick of duckPicks(role)) {
        const [w, h] = pick.split("-");
        expect(duckSvg({ seed: "s", role, pick })).toContain(`data-wear="${w}" data-hold="${h}"`);
      }
    }
    expect(duckSvg({ seed: "s", role: "VENUE", pick: "2-2" })).toBe(duckSvg({ seed: "s", role: "VENUE" }));
    expect(duckSvg({ seed: "s", role: "VENUE", pick: "<b>" })).toBe(duckSvg({ seed: "s", role: "VENUE" }));
  });

  it("같은 값이면 언제나 같은 그림이고, seed 의 글자는 그림에 들어가지 않는다", () => {
    const seed = '"><script>alert(1)</script>';
    expect(duckSvg({ seed, role: "USER" })).toBe(duckSvg({ seed, role: "USER" }));
    expect(duckSvg({ seed, role: "USER" })).not.toContain("script");
    expect(duckSvg({ seed: "a", role: "USER", size: 9999 })).toContain('width="512"');
    expect(duckSvg({ seed: "a", role: "USER", size: 1 })).toContain('width="16"');
  });
});

describe("ProfileAvatar", () => {
  const duck = { role: "INSTALL", seed: "abc", pick: null };

  it("사진이 있으면 사진, 없으면 오리, 오리도 없으면 첫 글자", () => {
    const photo = render(<ProfileAvatar name="업체 D" src="/media/d_t.webp" duck={duck} />).container;
    expect((photo.querySelector(".avatar") as HTMLElement).style.backgroundImage).toContain("/media/d_t.webp");
    expect(photo.querySelector("img")).toBeNull();

    const drawn = render(<ProfileAvatar name="업체 D" duck={duck} />).container;
    expect(drawn.querySelector(".avatar--duck img")?.getAttribute("src")).toMatch(/^data:image\/svg\+xml/);

    expect(render(<ProfileAvatar name="업체 D" />).container.querySelector(".avatar")).toHaveTextContent("D");
  });
});

describe("커뮤니티 작성자 (11/26)", () => {
  it("글·댓글 작성자 이름 옆에 사진, 없으면 오리, 둘 다 없으면 첫 글자", () => {
    const duck = { role: "VENUE", seed: "abc", pick: null };
    const drawn = render(<Author author={{ name: "업체 C", kind: "SUPPLIER", duck }} />).container;
    expect(drawn).toHaveTextContent("업체 C · 업체");
    expect(drawn.querySelector(".avatar--duck img")?.getAttribute("src")).toMatch(/^data:image\/svg\+xml/);

    const photo = render(<Author author={{ name: "광주밴드", kind: "USER", avatarUrl: "/media/u_t.webp", duck }} big />).container;
    expect((photo.querySelector(".avatar") as HTMLElement).style.backgroundImage).toContain("/media/u_t.webp");

    expect(render(<Author author={{ name: "광주밴드", kind: "USER" }} />).container.querySelector(".avatar")).toHaveTextContent("광");
  });
});
