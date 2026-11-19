"""SEO 순수 함수: 주소 분류, 요약, head·robots·sitemap 글자 만들기 (specs/seo.md)."""
import html
import re
from dataclasses import dataclass
from datetime import datetime

SITE = "STAGE DUCK"
SUMMARY_MAX = 80
HEAD_START, HEAD_END = "<!--app-head-->", "<!--/app-head-->"

FREE_CATEGORY = {"FREE": "자유", "QUESTION": "질문", "INFO": "정보", "NEWS": "공연 소식"}
PR_CATEGORY = {"VENUE": "공연장", "EQUIPMENT": "장비", "ENGINEER": "엔지니어"}


@dataclass(frozen=True)
class PageMeta:
    title: str = SITE
    og_title: str | None = None
    description: str | None = None
    image: str | None = None  # 절대 주소 또는 / 로 시작하는 경로
    path: str | None = None  # canonical·og:url 경로. None 이면 넣지 않는다
    type: str = "website"
    index: bool = False  # False = noindex


# 3장 표: 고정 공개 화면 (title, description)
STATIC_PAGES: dict[str, tuple[str, str]] = {
    "/": ("STAGE DUCK · 공연장부터 엔지니어까지 차례로", "요청서를 쓰면 공연장, 장비, 엔지니어 업체의 견적서를 차례로 받아 비교하고 컨펌해요."),
    "/venues": ("공연 공간 찾기 · STAGE DUCK", "지역·관객 수·공간 조건으로 공연할 곳을 찾아보세요."),
    "/board": ("업체 PR 게시판 · STAGE DUCK", "공연장·장비·엔지니어 업체가 직접 올린 소개 글을 둘러보세요."),
    "/community": ("커뮤니티 · STAGE DUCK", "공연 준비하면서 궁금한 것, 알게 된 것을 나눠요."),
    "/notices": ("공지사항 · STAGE DUCK", "STAGE DUCK 공지사항이에요."),
    "/faq": ("자주 묻는 질문 · STAGE DUCK", "요청서·견적·결제·취소, 업체 입점·정산에 대해 자주 묻는 질문이에요."),
    "/guide/supplier": ("업체 이용 가이드 · STAGE DUCK", "입점부터 견적서, 컨펌, 정산까지 업체가 하는 일을 순서대로 정리했어요."),
    "/terms/service": ("이용약관 · STAGE DUCK", "시연용 요약본이에요."),
    "/terms/supplier": ("업체 이용약관 · STAGE DUCK", "시연용 요약본이에요."),
    "/terms/privacy": ("개인정보 처리방침 · STAGE DUCK", "시연용 요약본이에요."),
}

# 입력 화면: 공개 주소여도 noindex
INPUT_PAGES: dict[str, str] = {
    "/login": "로그인",
    "/signup": "회원가입",
    "/signup/user": "회원가입",
    "/signup/supplier": "업체 회원가입",
    "/community/write": "글쓰기",
    "/community/new": "글쓰기",
    "/board/new": "소개 글 쓰기",
}

ROBOTS_DISALLOW = ("/api/", "/admin", "/me", "/performances", "/chats", "/supplier", "/login", "/signup", "/dev")

_PHONE = re.compile(r"\+?\d{2,4}[-.\s]?\d{3,4}[-.\s]?\d{4}")
_EMAIL = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
_MONEY = re.compile(r"\d[\d,]*\s*(?:만\s*)?원")
_SPACE = re.compile(r"\s+")
_DETAIL = re.compile(r"^/(community|board|notices)/(\d+)$")


def normalize(path: str) -> str:
    """쿼리를 빼고 끝 / 를 없앤다 (루트 제외)."""
    path = path.split("?", 1)[0] or "/"
    return path.rstrip("/") or "/"


def detail(path: str) -> tuple[str, int] | None:
    """`/community/12` → ("community", 12). 글 화면이 아니면 None."""
    m = _DETAIL.match(path)
    return (m.group(1), int(m.group(2))) if m else None


def summarize(text: str, limit: int = SUMMARY_MAX) -> str:
    """연락처·이메일·금액을 빼고 공백을 하나로 줄여 limit 자에서 자른다."""
    for pattern in (_EMAIL, _PHONE, _MONEY):
        text = pattern.sub("", text)
    text = _SPACE.sub(" ", text).strip()
    return text if len(text) <= limit else text[:limit].rstrip() + "…"


def community_meta(post_id: int, category: str, title: str, body: str, image: str | None) -> PageMeta:
    og = f"[{FREE_CATEGORY.get(category, category)}] {title}"
    return PageMeta(title=f"{og} · {SITE} 커뮤니티", og_title=og, description=summarize(body), image=image,
                    path=f"/community/{post_id}", type="article", index=True)


def board_meta(post_id: int, category: str, title: str, company: str, body: str, image: str | None) -> PageMeta:
    og = f"[{PR_CATEGORY.get(category, category)}] {title} · {company}"
    return PageMeta(title=f"{og} · {SITE}", og_title=og, description=summarize(body), image=image,
                    path=f"/board/{post_id}", type="article", index=True)


def notice_meta(notice_id: int, title: str, body: str) -> PageMeta:
    """seo.md 3장: {제목} · STAGE DUCK 공지 / 본문 앞 80자."""
    return PageMeta(title=f"{title} · {SITE} 공지", og_title=title, description=summarize(body),
                    path=f"/notices/{notice_id}", type="article", index=True)


def static_meta(path: str) -> PageMeta | None:
    if path in STATIC_PAGES:
        title, desc = STATIC_PAGES[path]
        return PageMeta(title=title, description=desc, path=path, index=True)
    if path in INPUT_PAGES:
        return PageMeta(title=f"{INPUT_PAGES[path]} · {SITE}", path=path)
    return None


def absolute(base: str, url: str) -> str:
    return url if url.startswith(("http://", "https://")) else base.rstrip("/") + "/" + url.lstrip("/")


def render_head(meta: PageMeta, *, base_url: str, indexing: bool, verification: dict[str, str] | None = None) -> str:
    """head 안에 넣을 태그들. 글자는 모두 이스케이프 (NFR-SEC-09)."""
    def e(s: str) -> str:
        return html.escape(s, quote=True)

    lines = [f"<title>{e(meta.title)}</title>"]
    if not (indexing and meta.index):
        lines.append('<meta name="robots" content="noindex">')
    if meta.description:
        lines.append(f'<meta name="description" content="{e(meta.description)}">')
    if meta.path:
        url = e(absolute(base_url, meta.path))
        lines.append(f'<link rel="canonical" href="{url}">')
        lines.append(f'<meta property="og:type" content="{meta.type}">')
        lines.append(f'<meta property="og:site_name" content="{SITE}">')
        lines.append(f'<meta property="og:title" content="{e(meta.og_title or meta.title)}">')
        if meta.description:
            lines.append(f'<meta property="og:description" content="{e(meta.description)}">')
        lines.append(f'<meta property="og:image" content="{e(absolute(base_url, meta.image or "/og-default.png"))}">')
        lines.append(f'<meta property="og:url" content="{url}">')
        lines.append('<meta name="twitter:card" content="summary_large_image">')
    for name, value in (verification or {}).items():
        if value:
            lines.append(f'<meta name="{name}" content="{e(value)}">')
    return "\n    ".join(lines)


def fill(template: str, head: str) -> str:
    """index.html 의 자리표시를 바꾼다. 자리표시가 없으면 </head> 앞에 넣는다."""
    start, end = template.find(HEAD_START), template.find(HEAD_END)
    if start != -1 and end > start:
        return template[:start] + head + template[end + len(HEAD_END):]
    return template.replace("</head>", f"  {head}\n  </head>", 1)


def robots_txt(*, base_url: str, indexing: bool) -> str:
    if not indexing:
        return "User-agent: *\nDisallow: /\n"
    lines = ["User-agent: *", *(f"Disallow: {p}" for p in ROBOTS_DISALLOW), f"Sitemap: {absolute(base_url, '/sitemap.xml')}"]
    return "\n".join(lines) + "\n"


def sitemap_xml(base_url: str, entries: list[tuple[str, datetime | None]]) -> str:
    rows = []
    for path, lastmod in entries:
        mod = f"<lastmod>{lastmod.date().isoformat()}</lastmod>" if lastmod else ""
        rows.append(f"  <url><loc>{html.escape(absolute(base_url, path))}</loc>{mod}</url>")
    head = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    return head + "\n".join(rows) + "\n</urlset>\n"
