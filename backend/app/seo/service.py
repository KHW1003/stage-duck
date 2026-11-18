"""SEO 서비스: 주소에 맞는 head 를 고르고 index.html 을 채운다 (specs/seo.md 1·3·5장).

다른 묶음은 공개 상태 조회 함수만 부른다 (community.get_public_post·public_post_stamps, board.get_post·public_post_stamps).
"""
from pathlib import Path

from sqlalchemy.orm import Session

from app.board import service as board
from app.community import service as community
from app.core.config import get_settings
from app.core.errors import AppError
from app.files import service as files
from app.models.file import StoredFile
from app.seo import calc
from app.seo.calc import PageMeta

FALLBACK_INDEX = (
    '<!doctype html>\n<html lang="ko">\n  <head>\n    <meta charset="UTF-8" />\n'
    '    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n'
    f"    {calc.HEAD_START}<title>{calc.SITE}</title>{calc.HEAD_END}\n"
    '  </head>\n  <body><div id="root"></div></body>\n</html>\n'
)


def _template() -> str:
    index = Path(get_settings().frontend_dist) / "index.html"
    return index.read_text(encoding="utf-8") if index.is_file() else FALLBACK_INDEX


def _community_meta(db: Session, post_id: int) -> PageMeta | None:
    post = community.get_public_post(db, post_id)
    if post is None:
        return None
    image = None
    if post.photos:
        cover = db.get(StoredFile, post.photos[0])
        if cover is not None and cover.status == "ATTACHED" and cover.visibility == "PUBLIC":
            image = files.file_url(cover)
    return calc.community_meta(post.id, post.category, post.title, post.body, image)


def _board_meta(db: Session, post_id: int) -> PageMeta | None:
    try:
        post = board.get_post(db, post_id)
    except AppError:
        return None
    image = post.photos[0].url if post.photos and not post.photos[0].url.startswith("/api/") else None
    return calc.board_meta(post.id, post.category, post.title, post.company_name, post.body, image)


def resolve(db: Session, raw_path: str) -> tuple[PageMeta, int]:
    """(head 내용, 상태 코드). 로그인 뒤 화면은 DB 를 읽지 않는다."""
    path = calc.normalize(raw_path)
    found = calc.detail(path)
    if found:
        kind, post_id = found
        meta = (_community_meta if kind == "community" else _board_meta)(db, post_id)
        return (meta, 200) if meta else (PageMeta(), 404)
    return calc.static_meta(path) or PageMeta(), 200


def render(db: Session, raw_path: str) -> tuple[str, int]:
    settings = get_settings()
    meta, status = resolve(db, raw_path)
    head = calc.render_head(
        meta,
        base_url=settings.public_base_url,
        indexing=settings.seo_indexing,
        verification={
            "naver-site-verification": settings.site_verification_naver,
            "google-site-verification": settings.site_verification_google,
        },
    )
    return calc.fill(_template(), head), status


def robots() -> str:
    s = get_settings()
    return calc.robots_txt(base_url=s.public_base_url, indexing=s.seo_indexing)


def sitemap(db: Session) -> str:
    entries = [(p, None) for p in calc.STATIC_PAGES]
    entries += [(f"/community/{i}", t) for i, t in community.public_post_stamps(db)]
    entries += [(f"/board/{i}", t) for i, t in board.public_post_stamps(db)]
    return calc.sitemap_xml(get_settings().public_base_url, entries)


def static_file(raw_path: str) -> Path | None:
    """dist 맨 위 파일(favicon, og-default.png 등). dist 밖은 돌려주지 않는다."""
    if "." not in raw_path.rsplit("/", 1)[-1]:
        return None
    dist = Path(get_settings().frontend_dist).resolve()
    target = (dist / raw_path.lstrip("/")).resolve()
    return target if target.is_file() and dist in target.parents else None
