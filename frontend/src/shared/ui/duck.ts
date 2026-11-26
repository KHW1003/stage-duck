/**
 * 오리 프로필 그림 (11/26 해원 승인). 사진이 없을 때 쓰는 계정 그림 — 시안: 흰 오리 + 역할별 입는 것·드는 것.
 * - 같은 seed·역할·pick 이면 언제나 같은 그림 (Math.random·날짜를 쓰지 않는다)
 * - 입력 글자는 그림에 넣지 않는다 (역할은 허용 목록, seed 는 해시에만 쓴다) → <img src="data:..."> 로 넣는다
 * - pick 은 "입는 것-드는 것". 서버 backend/app/profile/calc.py DUCK_PICKS 와 같은 표 (duckPicks)
 */
export type DuckRole = "USER" | "VENUE" | "EQUIPMENT" | "INSTALL" | "ENGINEER";
export interface Duck {
  role: string;
  seed: string;
  pick: string | null;
}
interface Wear {
  stage?: string;
  back?: string;
  head?: string;
  chest?: string;
}
interface Hold {
  art: string;
  grip: string;
  side: "left" | "right" | "both";
}

const ROLES: DuckRole[] = ["USER", "VENUE", "EQUIPMENT", "INSTALL", "ENGINEER"];
/** [입는 것 수, 드는 것 수, 가슴에 다는 것, 배 앞에 드는 것] — 가슴 + 배 앞은 겹쳐서 고를 수 없다 */
const META: Record<DuckRole, [number, number, number[], number[]]> = {
  USER: [6, 4, [], []],
  VENUE: [3, 3, [2], [2]],
  EQUIPMENT: [3, 3, [], []],
  INSTALL: [3, 4, [1], [3]],
  ENGINEER: [3, 3, [2], [0, 1]],
};

export const duckRole = (role: string): DuckRole =>
  (ROLES as string[]).includes(role) ? (role as DuckRole) : "USER";

/** 그 역할에서 고를 수 있는 조합 ("입는 것-드는 것") */
export function duckPicks(role: string): string[] {
  const [wear, hold, chest, belly] = META[duckRole(role)];
  const out: string[] = [];
  for (let w = 0; w < wear; w++)
    for (let h = 0; h < hold; h++)
      if (!(chest.includes(w) && belly.includes(h))) out.push(`${w}-${h}`);
  return out;
}

export function duckSvg({
  seed,
  role,
  pick = null,
  size = 96,
}: {
  seed: string;
  role: string;
  pick?: string | null;
  size?: number;
}): string {
  const kind = duckRole(role);
  const pixels = Number.isFinite(size)
    ? Math.max(16, Math.min(512, Math.round(size)))
    : 96;
  const key = String(seed);
  // FNV-1a + 섞기. 부분마다 다른 소금을 넣는다
  const choose = (salt: string, count: number): number => {
    let h = 2166136261;
    const value = key + "\u0000" + salt;
    for (let i = 0; i < value.length; i++)
      h = Math.imul(h ^ value.charCodeAt(i), 16777619);
    h ^= h >>> 16;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    return (h >>> 0) % count;
  };
  const ink = "#3b444d",
    orange = "#ffb163",
    lower = "#f8a36b";
  const feather = "#ffffff",
    shade = "#ffffff",
    background = "#eef0f3";
  const eyes = choose("eyes", 6),
    bill = choose("bill", 5),
    blush = choose("blush", 3),
    tuft = choose("tuft", 4);
  const propColor = choose(kind + ":prop-color", 4);
  const accessory = ["#f6bc81", "#dc9b99", "#98a9be", "#fade9c"][propColor];
  const small = pixels < 48;
  const accessoryLight = ["#fad4af", "#edb8b3", "#bbc8d9", "#fceac0"][
    propColor
  ];
  const path = (d: string, fill = "none", extra = ""): string =>
    `<path d="${d}" fill="${fill}" ${extra}/>`;
  const ellipse = (
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    fill: string,
    extra = "",
  ): string =>
    `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}" ${extra}/>`;
  const rect = (
    x: number,
    y: number,
    w: number,
    h: number,
    fill: string,
    rx = 3,
  ): string =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}"/>`;
  const dot = (x: number, y: number, r: number, fill: string): string =>
    `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" stroke="none"/>`;
  const star = (x: number, y: number): string =>
    path(
      `M${x} ${y - 7} l2.2 4.5 5 .8 -3.6 3.5 .9 5 -4.5 -2.4 -4.5 2.4 .9 -5 -3.6 -3.5 5 -.8 Z`,
      "#fcecc4",
    );
  const detail = (art: string): string =>
    small ? "" : `<g data-detail="fine">${art}</g>`;
  const grow = (art: string, factor: number, x = 64, y = 64): string =>
    art
      ? `<g transform="translate(${x} ${y}) scale(${factor}) translate(${-x} ${-y})" stroke-width="${2.8 / factor}">${art}</g>`
      : "";
  // 입는 것(wear)과 손에 드는 것(hold)을 따로 뽑는다 — 누구나 자기 일의 물건을 하나 든다
  const at = (x: number, y: number, r: number, art: string): string =>
    `<g transform="translate(${x} ${y}) rotate(${r})">${art}</g>`;
  const wingL = path(
      "M40 100 Q30 97 20 104 Q16 111 23 115 Q31 116 43 110",
      shade,
    ),
    wingR = path(
      "M88 100 Q98 97 108 104 Q112 111 105 115 Q97 116 85 110",
      shade,
    );
  const left = (art: string): Hold => ({ art, grip: wingL, side: "left" }),
    right = (art: string): Hold => ({ art, grip: wingR, side: "right" });
  const belly = (art: string, l = 40, r = 88): Hold => ({
    art,
    grip: ellipse(l, 111, 5.5, 4.5, shade) + ellipse(r, 111, 5.5, 4.5, shade),
    side: "both",
  });
  const phones: Wear = {
    back: path("M22 57 C18 7 109 7 106 57", "#f5f8fb"),
    head:
      rect(17, 47, 12, 24, accessory, 6) + rect(99, 47, 12, 24, accessory, 6),
  };
  const beanie: Wear = {
    head:
      path("M30 38 Q30 14 63 14 Q95 14 98 38 Z", accessory) +
      rect(28, 32, 72, 13, accessoryLight, 6) +
      detail(path("M49 22 V29 M64 21 V28 M79 22 V29")),
  };
  const cap: Wear = {
    head:
      path("M31 39 Q31 14 64 14 Q97 14 97 39 Q64 31 31 39 Z", accessory) +
      path(
        "M30 39 Q64 30 98 39 Q112 41 113 47 Q98 43 64 43 Q44 43 30 45 Z",
        accessoryLight,
      ) +
      dot(64, 15, 3, ink),
  };
  const clipboard = at(
    24,
    104,
    -12,
    rect(-13, -28, 26, 34, "#d9b390", 3) +
      rect(-9.5, -23, 19, 26, "#ffffff", 1.5) +
      rect(-5, -31, 10, 7, "#b4bfca", 2) +
      path(
        small ? "M-5 -13 H5 M-5 -6 H5" : "M-5 -16 H5 M-5 -10 H5 M-5 -4 H1",
        "none",
        'stroke-width="2"',
      ),
  );
  const hammer = at(
    25,
    104,
    -16,
    rect(-3.2, -24, 6.4, 44, "#e9c9a0", 3) +
      path("M-14 -35 H8 Q16 -35 17 -26 Q10 -28 8 -23 H-14 Z", "#aab6c4"),
  );
  const spot = at(
    25,
    104,
    -22,
    rect(-3, -10, 6, 28, "#8d99a6", 3) +
      path("M-13 -34 H13 L8 -9 H-8 Z", "#7d8a96") +
      ellipse(0, -34, 13, 5, "#ffe9ab"),
  );
  const doorKey = at(
    25,
    106,
    -16,
    path("M-2.6 -20 H2.6 V16 H11 V10 H2.6", "#f3cf87") +
      rect(-2.6, -18, 5.2, 36, "#f3cf87", 2) +
      ellipse(0, -27, 10.5, 10.5, "#f3cf87") +
      ellipse(0, -27, 4, 4, background),
  );
  const drill = at(
    26,
    104,
    -8,
    rect(-3, -16, 10, 32, "#e2a873", 4) +
      rect(-13, -31, 25, 16, "#efbb83", 5) +
      path("M-13 -27 H-18 V-19 H-13 M-18 -23 H-25"),
  );
  const speaker =
    rect(13, 82, 27, 35, "#9aa9bd") +
    ellipse(26.5, 105, 8, 8, "#eef2f6") +
    ellipse(26.5, 90.5, 3.6, 3.6, "#eef2f6");
  const toolbox =
    path("M56 106 V101 H72 V106") +
    rect(40, 105, 48, 19, "#dd9c98", 4) +
    path("M40 112 H58 M70 112 H88") +
    rect(58, 108, 12, 8, "#f3d9a5", 2);
  const keyboard =
    rect(33, 103, 62, 17, "#ffffff", 4) +
    detail(
      path(
        "M43 112 V120 M53.5 112 V120 M64 112 V120 M74.5 112 V120 M85 112 V120",
        "none",
        'stroke-width="2"',
      ),
    ) +
    path(
      small
        ? "M50 104 V111 M64 104 V111 M78 104 V111"
        : "M43 104 V111 M53.5 104 V111 M74.5 104 V111 M85 104 V111",
      "none",
      'stroke-width="4.5" stroke-linecap="butt"',
    );
  const stick = (r: number): string =>
    at(
      27,
      108,
      r,
      rect(-2.6, -38, 5.2, 52, "#f9d9a8", 2.6) +
        ellipse(0, -39, 4.2, 5.2, "#f9d9a8"),
    );
  const goggles: Wear = {
    head:
      path("M33 36 L27 42 M95 36 L101 42") +
      rect(34, 30, 60, 18, "#b7c3cf", 9) +
      rect(39, 34, 50, 10, "#dcedf6", 5),
  };
  const jobs: Record<DuckRole, { wear: Wear[]; hold: Hold[] }> = {
    USER: {
      wear: [
        phones,
        beanie,
        {
          head:
            path(
              "M29 34 C23 20 44 17 62 14 C88 9 104 27 95 36 Q63 30 29 40 Z",
              accessory,
            ) + path("M65 15 Q64 10 70 10"),
        },
        {
          head:
            path("M36 39 L29 43 M92 39 L99 43 M60 39 Q64 36 68 39") +
            path(
              "M36 38 Q47 33 60 37 Q61 50 48 50 Q37 49 36 38 Z M92 38 Q81 33 68 37 Q67 50 80 50 Q91 49 92 38 Z",
              "#7d8a96",
            ) +
            detail(
              path(
                "M42 40 L47 39 M74 40 L79 39",
                "none",
                'stroke="#ffffff" stroke-width="2"',
              ),
            ),
        },
        {
          head:
            path("M85 44 V30 L99 27 V40") +
            path("M85 30 L99 27 V32 L85 35 Z", ink) +
            ellipse(81, 45, 5, 4, orange) +
            ellipse(95, 41, 5, 4, orange),
        },
        {},
      ],
      hold: [
        left(
          `<g transform="translate(25 100) rotate(-24)">${path("M-6 -10 H6 L4 20 Q0 24 -4 20 Z", "#808c9a")}${ellipse(0, -21, 12, 12.5, "#a6b7cf")}${detail(path("M-8 -27 Q0 -23 8 -27 M-10 -20 Q0 -16 10 -20"))}${rect(-8.5, -12, 17, 6, "#f5c98f", 3)}</g>`,
        ),
        left(stick(-30) + stick(-6)),
        {
          art:
            path("M66 104 L34 98 L33 103 L64 110 Z", "#f0d2b1") +
            path("M35 95 L24 94 Q21 96 22 99 L24 103 L34 105 Z", "#fbdfb3") +
            path(
              "M64 102 Q72 96 78 101 Q88 96 96 103 Q101 112 93 119 Q84 124 77 118 Q69 120 65 114 Q61 107 64 102 Z",
              "#ddae88",
            ) +
            dot(79, 109.5, 4, ink) +
            detail(path("M90 106 V115")),
          grip:
            ellipse(43, 104, 5.5, 4.5, shade) +
            ellipse(88, 112, 5.5, 4.5, shade),
          side: "both",
        },
        belly(keyboard, 34, 94),
      ],
    },
    VENUE: {
      wear: [
        {
          stage:
            path("M-4 10 H30 Q28 42 10 66 Q15 92 11 132 H-4 Z", "#e1a6a6") +
            path(
              "M132 10 H98 Q100 42 118 66 Q113 92 117 132 H132 Z",
              "#e1a6a6",
            ) +
            detail(
              path(
                "M19 18 Q16 40 5 58 M109 18 Q112 40 123 58 M5 76 Q8 92 6 106 M123 76 Q120 92 122 106",
                "none",
                'stroke="#c2898c"',
              ),
            ) +
            path(
              "M0 66 H11 M117 66 H128",
              "none",
              'stroke="#fef4d8" stroke-width="4"',
            ) +
            path("M-4 -4 H132 V14 H-4 Z", "#e1a6a6") +
            path("M20 9 H108", "none", 'stroke="#fef4d8" stroke-width="2"'),
        },
        {
          head:
            path("M30 40 Q64 21 98 40 M41 34 L38 23 M87 34 L90 23") +
            star(37, 19) +
            star(91, 19),
        },
        {
          chest:
            path(
              "M63 105 Q51 97 49 102 V115 Q51 119 63 111 Q77 119 79 115 V102 Q77 97 65 105 Z",
              accessory,
            ) + ellipse(64, 108, 4, 4, accessoryLight),
        },
      ],
      hold: [
        left(spot),
        left(doorKey),
        belly(
          path(
            "M42 101 H87 V108 Q80 111 87 115 V123 H42 V115 Q49 111 42 108 Z",
            "#f9cc94",
          ) + path("M74 106 V118 M54 111 H65", "none", 'stroke="#a68968"'),
          41,
          88,
        ),
      ],
    },
    EQUIPMENT: {
      wear: [cap, beanie, {}],
      hold: [
        {
          art: speaker,
          grip: path(
            "M46 101 Q36 99 33 105 Q32 111 38 112 Q43 112 48 108",
            shade,
          ),
          side: "left",
        },
        {
          art:
            ellipse(101, 105, 12, 13, "#98a9be") +
            ellipse(101, 105, 6, 7, "#ffffff") +
            detail(
              path("M90 109 Q82 117 89 121 H99") +
                rect(98, 118, 8, 5, "#f3cf9a", 2),
            ),
          grip: path(
            "M84 101 Q92 99 95 105 Q96 111 90 112 Q85 112 80 108",
            shade,
          ),
          side: "right",
        },
        belly(
          `<g>${rect(40, 101, 48, 22, "#8d9cae")}${path(small ? "M54 106 V118 M74 106 V118" : "M52 106 V118 M64 106 V118 M76 106 V118", "none", 'stroke="#d8e3ee"')}${path(small ? "M50 111 H58 M70 115 H78" : "M49 110 H55 M61 115 H67 M73 108 H79")}</g>`,
        ),
      ],
    },
    INSTALL: {
      wear: [
        {
          head:
            path(
              "M30 38 Q31 15 56 16 V12 H72 V16 Q97 16 98 38 Z",
              accessoryLight,
            ) +
            detail(path("M56 17 V32 M72 17 V32")) +
            rect(26, 34, 76, 10, accessory, 5),
        },
        {
          head:
            path(
              "M30 38 Q31 15 56 16 V12 H72 V16 Q97 16 98 38 Z",
              accessoryLight,
            ) +
            detail(path("M56 17 V32 M72 17 V32")) +
            rect(26, 34, 76, 10, accessory, 5),
          chest:
            path(
              "M44 100 L54 102 L64 113 L74 102 L84 100 L90 117 Q64 122 38 117 Z",
              "#eef1ab",
            ) +
            path("M47 105 L45 119 M81 105 L83 119", "none", 'stroke="#ffffff"'),
        },
        goggles,
      ],
      hold: [
        right(
          path(
            "M93 121 L87 116 L108 85 Q100 77 108 67 L111 78 L119 81 L123 71 Q130 88 116 92 Z",
            "#a5b4c6",
          ),
        ),
        left(hammer),
        left(drill),
        belly(toolbox, 40, 88),
      ],
    },
    ENGINEER: {
      wear: [
        {
          back: phones.back,
          head:
            (phones.head ?? "") +
            path("M107 70 V80 Q106 85 98 85") +
            ellipse(95, 85, 4, 2.8, accessory),
        },
        {
          head:
            ellipse(45, 65, 13, 10, "none") +
            ellipse(83, 65, 13, 10, "none") +
            path("M58 65 Q64 61 70 65 M32 62 L27 59 M96 62 L101 59"),
        },
        {
          chest:
            path("M50 99 L64 112 L78 99") +
            rect(55, 109, 18, 15, "#f8fafb") +
            path(
              small ? "M60 116 H68" : "M60 115 H68 M60 119 H64",
              "none",
              'stroke="#eec4c1"',
            ),
        },
      ],
      hold: [
        belly(
          rect(41, 102, 46, 21, "#727d87") +
            path(
              small
                ? "M47 114 H55 L60 108 L66 118 L72 114 H81"
                : "M47 114 H52 L56 108 L61 118 L67 107 L72 114 H81",
              "none",
              'stroke="#d4eeda"',
            ),
          41,
          87,
        ),
        belly(
          `<g>${rect(40, 101, 48, 22, "#8d9cae")}${path(small ? "M54 106 V118 M74 106 V118" : "M52 106 V118 M64 106 V118 M76 106 V118", "none", 'stroke="#d8e3ee"')}${path(small ? "M50 111 H58 M70 115 H78" : "M49 110 H55 M61 115 H67 M73 108 H79")}</g>`,
        ),
        left(clipboard),
      ],
    },
  };
  const job = jobs[kind];
  const chosen =
    pick && duckPicks(kind).includes(pick) ? pick.split("-").map(Number) : null;
  const wearIndex = chosen
    ? chosen[0]
    : choose(kind + ":wear", job.wear.length);
  const wear = job.wear[wearIndex];
  // 가슴에 단 것(넥타이·조끼·목걸이)이 있으면 배 앞을 가리지 않게 옆에 드는 것만
  const holds = wear.chest
    ? job.hold.filter((h) => h.side !== "both")
    : job.hold;
  const held = chosen
    ? job.hold[chosen[1]]
    : holds[choose(kind + ":hold", holds.length)];
  const holdIndex = job.hold.indexOf(held);
  const stage = wear.stage ?? "",
    back = wear.back ?? "",
    headwear = wear.head ?? "",
    front = (wear.chest ?? "") + held.art,
    grip = held.grip,
    holding = held.side;
  const tufts = [
    "M54 30 Q45 16 55 18 Q63 18 65 27 Q64 11 73 16 Q79 20 73 29",
    "M54 29 Q47 20 53 17 Q62 16 64 28 Q74 12 78 20 Q78 27 72 30",
    "M53 29 Q51 20 59 22 Q57 10 65 14 Q71 17 68 27 Q82 18 79 26 L74 31",
    "M54 30 Q48 17 57 19 Q60 7 67 15 Q66 22 67 27 Q74 18 78 23 Q81 29 73 32",
  ];
  let eyeArt = "";
  const openEye = (x: number, y: number, rx = 4.1, ry = 5.6): string =>
    ellipse(
      x,
      y,
      small ? Math.max(rx, 4.8) : rx,
      small ? Math.max(ry, 6) : ry,
      ink,
      'stroke="none"',
    ) +
    dot(x - 1.3, y - 2.1, small ? 1.9 : 1.6, "#ffffff") +
    (small ? "" : dot(x + 1.5, y + 2, 0.8, "#ffffff"));
  if (eyes === 0) eyeArt = openEye(46, 65) + openEye(82, 65);
  if (eyes === 1) eyeArt = path("M40 66 Q46 57 52 66 M76 66 Q82 57 88 66");
  if (eyes === 2) eyeArt = openEye(46, 65) + path("M77 61 L86 65 L77 68");
  if (eyes === 3)
    eyeArt = openEye(46, 66, 5.1, 6.5) + openEye(82, 66, 5.1, 6.5);
  if (eyes === 4) eyeArt = path("M40 64 Q46 70 52 64 M76 64 Q82 70 88 64");
  if (eyes === 5)
    eyeArt =
      openEye(46, 66, 3.7, 4.6) +
      openEye(82, 66, 3.7, 4.6) +
      detail(path("M41 55 L49 54 M79 54 L87 55"));
  const cheek = (x: number): string =>
    ellipse(x, 77, 7.5, 4.6, "#f3c4be", 'stroke="none" opacity=".85"');
  const blushArt =
    cheek(33) +
    cheek(95) +
    (small || blush === 0
      ? ""
      : blush === 1
        ? path(
            "M30 79 L32 75 M34 79 L36 75 M92 79 L94 75 M96 79 L98 75",
            "none",
            'stroke="#e8ada8" stroke-width="1.8"',
          )
        : dot(31, 76, 1.4, "#ffffff") + dot(97, 76, 1.4, "#ffffff"));
  let billArt = "";
  if (bill === 0)
    billArt =
      path("M46 78 Q64 72 82 78 Q81 89 64 90 Q47 89 46 78 Z", lower) +
      path(
        "M44 77 Q44 72 55 72 Q64 68 73 72 Q84 72 84 77 Q82 83 64 83 Q46 83 44 77 Z",
        orange,
      );
  if (bill === 1)
    billArt =
      path("M47 79 Q64 73 81 79 Q79 94 64 94 Q49 94 47 79 Z", lower) +
      path("M51 82 Q64 85 77 82 Q75 90 64 90 Q53 90 51 82 Z", ink) +
      path(
        "M44 77 Q46 71 56 72 Q64 68 72 72 Q82 71 84 77 Q81 84 64 83 Q47 84 44 77 Z",
        orange,
      );
  if (bill === 2)
    billArt =
      path("M49 79 Q64 74 79 79 Q77 89 64 90 Q51 89 49 79 Z", lower) +
      path(
        "M46 76 Q51 72 60 73 Q64 69 69 73 Q80 72 82 77 Q78 84 64 82 Q52 85 46 80 Z",
        orange,
      );
  if (bill === 3)
    billArt =
      path("M47 78 Q64 70 81 78 Q80 94 64 95 Q48 94 47 78 Z", lower) +
      path(
        "M44 77 Q47 71 56 72 Q64 68 72 72 Q81 71 84 77 Q80 83 64 83 Q48 83 44 77 Z",
        orange,
      ) +
      ellipse(64, 85, 5, 6, ink);
  if (bill === 4)
    billArt =
      path("M47 78 Q64 71 81 78 Q79 92 64 93 Q49 92 47 78 Z", lower) +
      path(
        "M44 77 Q47 71 56 72 Q64 68 72 72 Q81 71 84 77 Q80 83 64 83 Q48 83 44 77 Z",
        orange,
      ) +
      path("M62 84 H74 V88 Q68 96 62 88 Z", "#f0b2b8");
  const face =
    path(tufts[tuft], shade, 'data-part="tuft"') +
    path(
      "M64 27 C40 25 26 39 24 58 C17 68 22 87 35 94 C48 102 80 102 93 94 C106 87 111 68 104 58 C102 39 88 25 64 27 Z",
      feather,
      'data-part="face"',
    ) +
    blushArt +
    eyeArt +
    `<g data-part="bill">${billArt}</g>`;
  const wings =
    (holding === "left"
      ? ""
      : path(
          "M38 100 Q25 101 29 113 Q36 116 43 107",
          shade,
          'data-part="wing"',
        )) +
    (holding === "right"
      ? ""
      : path(
          "M90 100 Q103 101 99 113 Q92 116 85 107",
          shade,
          'data-part="wing"',
        ));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${pixels}" height="${pixels}" viewBox="0 0 128 128" aria-hidden="true" focusable="false" style="border-radius:50%;overflow:hidden" data-role="${kind}" data-wear="${wearIndex}" data-hold="${holdIndex}"><circle cx="64" cy="64" r="63" fill="${background}" data-part="background"/><g stroke="${ink}" stroke-width="${small ? 3.6 : 3.1}" stroke-linecap="round" stroke-linejoin="round">${stage}<g transform="translate(64 64.5) scale(${small ? 0.88 : 0.81}) translate(-64 -${small ? 68 : 69})">${back}${path("M39 94 Q64 86 89 94 Q100 102 95 118 Q64 126 33 118 Q28 102 39 94 Z", feather, 'data-part="body"')}${wings}${small ? grow(face, 1.025, 64, 65) : face}${small ? grow(headwear, 1.04) : headwear}${front}${grip ? `<g data-grip="${holding}">${grip}</g>` : ""}</g></g></svg>`;
}

/** <img src> 에 넣을 주소 */
export const duckDataUrl = (d: {
  seed: string;
  role: string;
  pick?: string | null;
  size?: number;
}): string =>
  "data:image/svg+xml;charset=utf-8," + encodeURIComponent(duckSvg(d));
