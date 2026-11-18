"""공연 요청서·버전·단계 모델의 DB 제약 (T2-02 #36, data-model.md 4장).

API·서비스 검사(AC-F2-06·08·10)는 요청서 API PR에서 테스트한다. 여기서는 DB가 막아야 하는 것만 본다.
"""
from datetime import date, time

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.request import Performance, PerformanceVersion, Stage
from tests.conftest import make_user

# 대표 시연 요청 (AC-F2-07): 토요일 19~21시, 80명, 리허설 17시, 광주
NEEDS = {
    "venue": {"needed": True, "proposalWanted": False, "types": ["CULTURE_SPACE"], "capacity": 80,
              "budget": 600000, "checkinWish": "15:00", "checkoutWish": "22:00",
              "mustHave": ["BAND_ALLOWED"], "note": ""},
    "equipment": {"needed": True, "proposalWanted": True, "items": [{"name": "보컬 마이크", "qty": 4}],
                  "services": ["TRANSPORT", "INSTALL"], "budget": 1500000, "owned": [], "note": ""},
    "engineer": {"needed": True, "tasks": ["FOH"], "conditions": [], "etc": "", "note": ""},
    "ownedVenue": None,
}


def _perf(db: Session, **kw) -> Performance:
    if "user_id" not in kw:
        kw["user_id"] = make_user(db).id
    values = dict(
        status="DRAFT", title="가을 밴드 공연", form="BAND", show_date=date(2026, 11, 28),
        rehearsal_start=time(17, 0), show_start=time(19, 0), show_end=time(21, 0),
        audience=80, sido="광주광역시", sigungu="동구", needs=NEEDS,
    )
    values.update(kw)
    perf = Performance(**values)
    db.add(perf)
    db.flush()
    return perf


def _rejected(db: Session, **kw) -> None:
    user_id = make_user(db).id
    db.commit()
    with pytest.raises(IntegrityError):
        _perf(db, user_id=user_id, **kw)
    db.rollback()


@pytest.mark.parametrize("audience", [0, 501])
def test_ac_f2_04_audience_0_and_501_rejected(db, audience):
    _rejected(db, audience=audience)


@pytest.mark.parametrize("audience", [1, 500])
def test_ac_f2_04_audience_boundary_saved(db, audience):
    assert _perf(db, audience=audience).id


@pytest.mark.parametrize(
    "rehearsal, start, end",
    [
        (time(19, 30), time(19, 0), time(21, 0)),  # 리허설이 공연 시작보다 늦다
        (time(19, 0), time(19, 0), time(21, 0)),  # 리허설 = 공연 시작
        (time(17, 0), time(21, 0), time(19, 0)),  # 공연 종료가 시작보다 이르다
    ],
)
def test_ac_f2_05_rehearsal_after_show_start_rejected(db, rehearsal, start, end):
    _rejected(db, rehearsal_start=rehearsal, show_start=start, show_end=end)


def test_ac_f2_07_representative_request_saved(db):
    perf = _perf(db)
    db.add(PerformanceVersion(performance_id=perf.id, version=1, snapshot={"title": perf.title, "needs": NEEDS},
                              changed_fields=[]))
    db.commit()

    saved = db.get(Performance, perf.id)
    assert (saved.status, saved.current_version, saved.audience, saved.sido) == ("DRAFT", 1, 80, "광주광역시")
    assert (saved.rehearsal_start, saved.show_start, saved.show_end) == (time(17), time(19), time(21))
    assert saved.needs["equipment"]["items"] == [{"name": "보컬 마이크", "qty": 4}]
    assert saved.contact_phone is None and saved.published_at is None
    assert [v.version for v in saved.versions] == [1]


@pytest.mark.parametrize("field, value", [("status", "OPEN"), ("form", "CONCERT")])
def test_performance_status_and_form_check(db, field, value):
    _rejected(db, **{field: value})


def test_performance_version_unique_per_performance(db):
    perf = _perf(db)
    db.add(PerformanceVersion(performance_id=perf.id, version=1, snapshot={}, changed_fields=[]))
    db.commit()
    db.add(PerformanceVersion(performance_id=perf.id, version=1, snapshot={}, changed_fields=[]))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def test_stage_type_unique_per_performance(db):
    perf = _perf(db)
    db.add(Stage(performance_id=perf.id, stage_type="VENUE", seq=1, status="WAITING"))
    db.commit()
    db.add(Stage(performance_id=perf.id, stage_type="VENUE", seq=1, status="WAITING"))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


@pytest.mark.parametrize("field, value", [("stage_type", "LIGHTING"), ("status", "DONE")])
def test_stage_type_and_status_check(db, field, value):
    perf = _perf(db)
    db.commit()
    kw = {"stage_type": "VENUE", "status": "WAITING", field: value}
    db.add(Stage(performance_id=perf.id, seq=1, **kw))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def test_open_guard_only_one_open_stage_per_performance(db):
    """AC-F3-01의 DB 안전장치: 공연당 OPEN·NEGOTIATING 단계는 하나뿐 (생성 컬럼 + UNIQUE)."""
    perf = _perf(db)
    other = _perf(db)
    db.add_all([
        Stage(performance_id=perf.id, stage_type="VENUE", seq=1, status="NEGOTIATING"),
        Stage(performance_id=perf.id, stage_type="ENGINEER", seq=3, status="WAITING"),
        Stage(performance_id=other.id, stage_type="VENUE", seq=1, status="OPEN"),
    ])
    db.commit()

    db.add(Stage(performance_id=perf.id, stage_type="EQUIPMENT", seq=2, status="OPEN"))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()
