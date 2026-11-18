"""견적서·견적서 버전 모델의 DB 제약 (T3-01 #41, data-model.md "quotes · quote_versions").

API·서비스 검사는 견적서 API PR에서 테스트한다. 여기서는 DB가 막아야 하는 것만 본다.
"""
import os

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.quote import Quote, QuoteVersion
from app.models.request import Stage
from tests.conftest import make_supplier
from tests.f2.test_performance_model import _perf

# api-contract.md 3.3 예시 값
AMOUNTS = dict(amount_items=600000, amount_transport=150000, amount_install=200000, amount_labor=300000,
               amount_etc=0)


def _quote(db: Session) -> Quote:
    perf = _perf(db)
    stage = Stage(performance_id=perf.id, stage_type="EQUIPMENT", seq=2, status="OPEN")
    db.add(stage)
    db.flush()
    supplier = make_supplier(db, review_status="APPROVED")
    quote = Quote(stage_id=stage.id, supplier_id=supplier.id, label="기본형", current_version=1, status="SENT")
    db.add(quote)
    db.commit()
    return quote


def _version(quote: Quote, **kw) -> QuoteVersion:
    values = dict(quote_id=quote.id, version=1, based_on_perf_version=1, staff=[], items=[], **AMOUNTS,
                  discount_amount=0, total_amount=1250000)
    values.update(kw)
    return QuoteVersion(**values)


@pytest.mark.parametrize("discount, total", [(0, 1250000), (50000, 1200000), (1240000, 10000)])
def test_ac_f2_17_total_equals_sum_minus_discount_saved(db, discount, total):
    quote = _quote(db)
    db.add(_version(quote, discount_amount=discount, total_amount=total))
    db.commit()
    assert [v.total_amount for v in quote.versions] == [total]
    assert quote.is_full_spec is False and quote.offer_id is None


@pytest.mark.parametrize(
    "discount, total",
    [
        (0, 1250001),  # 항목 합과 다르다
        (50000, 1250000),  # 할인을 빼지 않았다
        (1240001, 9999),  # 할인 후 1만원 미만
    ],
)
def test_ac_f2_17_total_check_rejected(db, discount, total):
    quote = _quote(db)
    db.add(_version(quote, discount_amount=discount, total_amount=total))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def test_ac_f2_20_quote_version_unique_per_quote(db):
    quote = _quote(db)
    db.add(_version(quote))
    db.commit()
    db.add(_version(quote))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def test_quote_status_check(db):
    quote = _quote(db)
    quote.status = "DONE"
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def test_stage_confirmed_quote_version_fk_declared():
    """stages.confirmed_quote_version_id 는 quote_versions.id 를 가리킨다."""
    fks = Stage.__table__.c.confirmed_quote_version_id.foreign_keys
    assert [fk.target_fullname for fk in fks] == ["quote_versions.id"]


@pytest.mark.skipif(not os.environ.get("TEST_DATABASE_URL"), reason="MariaDB에서만 (SQLite 테스트 DB는 FK 검사 꺼짐)")
def test_stage_confirmed_quote_version_fk(db):
    """stages.confirmed_quote_version_id 는 실제 견적서 버전만 가리킨다."""
    quote = _quote(db)
    version = _version(quote)
    db.add(version)
    db.commit()
    stage = db.get(Stage, quote.stage_id)
    stage.confirmed_quote_version_id = version.id
    db.commit()
    stage.confirmed_quote_version_id = version.id + 999
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()
