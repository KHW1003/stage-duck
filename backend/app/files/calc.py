"""파일 업로드 규칙 — DB·디스크를 모르는 순수 함수 (uploads.md 2·3·4장, CLAUDE.md 6.1)."""
from dataclasses import dataclass
from datetime import datetime

MB = 1024 * 1024
MAX_SIDE = 1600  # 본 사진 긴 변
THUMB_SIDE = 480  # 썸네일 긴 변
MAX_PIXEL_SUM = 20_000  # 가로 + 세로가 이보다 크면 거부 (크기 폭탄)
RATE_LIMIT_COUNT = 30  # 한 사람이 1분에 올릴 수 있는 개수
RATE_LIMIT_SECONDS = 60
TEMP_TTL_HOURS = 24  # 붙지 않은 TEMP 파일 보관 시간

FORMAT_LABEL = {"jpg": "jpg", "png": "png", "webp": "webp", "pdf": "PDF"}
MIME = {"jpg": "image/jpeg", "png": "image/png", "webp": "image/webp", "pdf": "application/pdf"}


@dataclass(frozen=True)
class Rule:
    formats: tuple[str, ...]
    max_mb: int
    max_count: int
    public: bool

    @property
    def max_bytes(self) -> int:
        return self.max_mb * MB


# uploads.md 2장 표 그대로
RULES: dict[str, Rule] = {
    "PROFILE": Rule(("jpg", "png", "webp"), 5, 1, True),
    "SUPPLIER_IMAGE": Rule(("jpg", "png", "webp"), 10, 1, True),
    "VENUE": Rule(("jpg", "png", "webp"), 10, 10, True),
    "PR_POST": Rule(("jpg", "png", "webp"), 10, 10, True),
    "COMMUNITY": Rule(("jpg", "png", "webp"), 10, 5, True),
    "INQUIRY": Rule(("jpg", "png"), 5, 3, False),
    "CHAT": Rule(("jpg", "png", "webp", "pdf"), 10, 1, False),
    "BUSINESS_DOC": Rule(("jpg", "png", "pdf"), 10, 1, False),
}


def sniff(head: bytes) -> str | None:
    """확장자·Content-Type 을 믿지 않고 파일 앞부분(매직 넘버)으로 형식을 본다. 모르는 형식은 None."""
    if head.startswith(b"\xff\xd8\xff"):
        return "jpg"
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "webp"
    if head.startswith(b"%PDF-"):
        return "pdf"
    return None


def format_message(rule: Rule) -> str:
    return f"{'·'.join(FORMAT_LABEL[f] for f in rule.formats)} 파일만 올릴 수 있어요."


def size_message(rule: Rule) -> str:
    return f"{rule.max_mb}MB 이하 파일만 올릴 수 있어요."


def fit_within(width: int, height: int, max_side: int) -> tuple[int, int]:
    """긴 변이 max_side 를 넘으면 비율을 지켜 줄인 크기. 이미 작으면 그대로 (키우지 않는다)."""
    longest = max(width, height)
    if longest <= max_side:
        return width, height
    scale = max_side / longest
    return max(1, round(width * scale)), max(1, round(height * scale))


def is_pixel_bomb(width: int, height: int) -> bool:
    return width + height > MAX_PIXEL_SUM


def saved_ext(rule: Rule, sniffed: str) -> str:
    """저장 형식: PDF 는 그대로, 공개 사진은 webp, 비공개 사진은 jpg (uploads.md 4장)."""
    if sniffed == "pdf":
        return "pdf"
    return "webp" if rule.public else "jpg"


def storage_keys(purpose: str, public: bool, name: str, ext: str, now: datetime, with_thumb: bool) -> tuple[str, str | None]:
    """UPLOAD_DIR 아래 상대 경로. 파일 이름은 서버가 만든 name(UUID)만 쓴다 (uploads.md 3장)."""
    folder = purpose.lower()
    if public:
        base = f"public/{folder}/{now:%Y}/{now:%m}/{name}"
    else:
        base = f"private/{folder}/{name}"
    return f"{base}.{ext}", (f"{base}_t.{ext}" if with_thumb else None)


def public_url(key: str) -> str:
    """public/venue/2026/11/abc.webp → /media/venue/2026/11/abc.webp"""
    return "/media/" + key.removeprefix("public/")
