"""검색·공유 노출 (T2-11 #123, specs/seo.md 9장, D-50, NFR-UX-07)."""
from datetime import datetime

import pytest

from app.core.config import Settings
from app.models.community import FreePost
from app.seo import service as seo
from tests.conftest import make_supplier, make_user

INDEX = """<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <!--app-head--><title>STAGE DUCK</title><!--/app-head-->
  </head>
  <body><div id="root"></div></body>
</html>"""


@pytest.fixture
def site(tmp_path, monkeypatch):
    """빌드된 화면(dist/index.html)과 SEO 설정을 테스트용으로 바꾼다."""
    (tmp_path / "index.html").write_text(INDEX, encoding="utf-8")
    state = {"indexing": False}

    def settings():
        return Settings(frontend_dist=str(tmp_path), public_base_url="https://stageduck.test", seo_indexing=state["indexing"])

    monkeypatch.setattr(seo, "get_settings", settings)
    return state


def _free_post(db, *, title="리허설은 몇 시간 전에?", body="입실 15시, 공연 19시예요.\n\n조언   부탁드려요.", status="ACTIVE", author=None):
    author = author or make_user(db, nickname="광주밴드")
    post = FreePost(author_user_id=author.id, category="QUESTION", title=title, body=body, photos=[], status=status,
                    created_at=datetime(2026, 11, 18, 14), updated_at=datetime(2026, 11, 18, 14))
    db.add(post)
    db.commit()
    return post


def _html(client, path):
    return client.get(path, headers={"Accept": "text/html"})


def test_community_post_head_filled(client, db, site):
    post = _free_post(db)

    res = _html(client, f"/community/{post.id}")

    assert res.status_code == 200
    html = res.text
    assert "<title>[질문] 리허설은 몇 시간 전에? · STAGE DUCK 커뮤니티</title>" in html
    assert f'<meta property="og:url" content="https://stageduck.test/community/{post.id}">' in html
    assert f'<link rel="canonical" href="https://stageduck.test/community/{post.id}">' in html
    assert '<meta name="description" content="입실 15시, 공연 19시예요. 조언 부탁드려요.">' in html  # 줄바꿈·공백 정리
    assert "광주밴드" not in html  # 닉네임은 넣지 않는다
    assert '<div id="root"></div>' in html


def test_missing_post_is_404_noindex(client, db, site):
    res = _html(client, "/community/999999")

    assert res.status_code == 404
    assert '<meta name="robots" content="noindex">' in res.text


def test_blinded_post_and_suspended_author_are_404(client, db, site):
    blinded = _free_post(db, status="BLINDED")
    bad = make_user(db)
    hidden = _free_post(db, author=bad)
    bad.status = "SUSPENDED"
    db.commit()

    assert _html(client, f"/community/{blinded.id}").status_code == 404
    assert _html(client, f"/community/{hidden.id}").status_code == 404


def test_private_page_default_head_noindex_without_db(client, db, site, monkeypatch):
    monkeypatch.setattr(seo, "_community_meta", lambda *a, **k: pytest.fail("로그인 뒤 화면은 DB를 읽지 않는다"))

    res = _html(client, "/me/performances")

    assert res.status_code == 200
    assert "<title>STAGE DUCK</title>" in res.text
    assert '<meta name="robots" content="noindex">' in res.text


def test_script_in_title_is_escaped(client, db, site):
    post = _free_post(db, title='<script>alert("x")</script>')

    html = _html(client, f"/community/{post.id}").text

    assert "<script>alert" not in html
    assert "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;" in html


def test_static_public_pages(client, db, site):
    site["indexing"] = True
    html = _html(client, "/community").text

    assert "<title>커뮤니티 · STAGE DUCK</title>" in html
    assert "noindex" not in html
    assert '<link rel="canonical" href="https://stageduck.test/community">' in html


def test_query_dropped_from_canonical(client, db, site):
    html = _html(client, "/community?category=QUESTION&page=2").text

    assert '<link rel="canonical" href="https://stageduck.test/community">' in html


def test_input_pages_noindex_even_when_indexing(client, db, site):
    site["indexing"] = True
    for path in ("/login", "/signup/supplier", "/community/write"):
        assert '<meta name="robots" content="noindex">' in _html(client, path).text, path


def test_board_post_head_has_company(client, db, site):
    from app.models.board import PrPost

    supplier = make_supplier(db, review_status="APPROVED", categories=("EQUIPMENT",), company_name="업체 D")
    post = PrPost(supplier_id=supplier.id, category="EQUIPMENT", title="밴드 음향 풀세트", body="보컬 마이크 4, 모니터 2",
                  photos=[], sido="광주광역시", status="ACTIVE", bumped_at=datetime(2026, 11, 18, 14))
    db.add(post)
    db.commit()

    html = _html(client, f"/board/{post.id}").text

    assert "<title>[장비] 밴드 음향 풀세트 · 업체 D · STAGE DUCK</title>" in html


def test_robots_when_indexing_off(client, site):
    res = client.get("/robots.txt")

    assert res.status_code == 200
    assert res.text.strip() == "User-agent: *\nDisallow: /"


def test_robots_and_sitemap_when_indexing_on(client, db, site):
    site["indexing"] = True
    visible = _free_post(db)
    blinded = _free_post(db, status="BLINDED", author=make_user(db))

    robots = client.get("/robots.txt").text
    sitemap = client.get("/sitemap.xml")

    assert "Disallow: /api/" in robots and "Disallow: /me" in robots
    assert "Sitemap: https://stageduck.test/sitemap.xml" in robots
    assert sitemap.status_code == 200 and sitemap.headers["content-type"].startswith("application/xml")
    assert f"https://stageduck.test/community/{visible.id}" in sitemap.text
    assert f"/community/{blinded.id}<" not in sitemap.text
    assert "<loc>https://stageduck.test/</loc>" in sitemap.text


def test_no_personal_data_in_head(client, db, site):
    post = _free_post(db, body="연락은 010-1234-5678, a@stageduck.test 로 주세요")

    head = _html(client, f"/community/{post.id}").text.split("</head>")[0]

    assert "010-1234-5678" not in head and "@stageduck.test" not in head


def test_api_and_admin_not_shadowed(client, site):
    assert client.get("/api/v1/health").json()["status"] == "ok"
    assert client.get("/api/v1/nope").status_code == 404
    assert client.get("/admin/login").status_code == 200
    assert client.get("/api/v1/auth/logout").status_code == 405  # POST 전용 API 에 GET → 405 그대로


def test_admin_without_slash_goes_to_admin_screen(client):
    """끝에 / 가 없는 /admin 은 React 404 가 아니라 관리자 화면(SQLAdmin)으로 간다."""
    res = client.get("/admin", follow_redirects=False)
    assert (res.status_code, res.headers.get("location")) == (307, "/admin/")
