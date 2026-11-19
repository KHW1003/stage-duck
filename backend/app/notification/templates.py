"""알림 문구 틀 (specs/notifications.md 3장과 같게). 화면 문구는 "견적 요청" (11/19 팀 결정, 명세의 '오퍼').

type → (분류, 제목 틀, 보조 줄 틀). 틀은 str.format 으로 params 를 채운다. 보조 줄이 없으면 None.
"""

TEMPLATES: dict[str, tuple[str, str, str | None]] = {
    # 3.1 입점·공고 (업체)
    "SUPPLIER_APPROVED": ("ADMIN", "입점이 승인됐어요", "서비스를 등록하면 공고를 볼 수 있어요"),
    "SUPPLIER_REJECTED": ("ADMIN", "입점 신청이 반려됐어요", "사유: {reason}"),
    "POSTING_OPENED": ("POSTING", "새 공고가 열렸어요", "{title} · {date} · {stage}"),
    "POSTING_UPDATED": ("POSTING", "공고 내용이 바뀌었어요 (v{version})", "{title}"),
    "POSTING_CLOSED": ("POSTING", "사용자가 공고를 내렸어요", "{title}"),
    "NOT_SELECTED": ("POSTING", "사용자가 다른 업체와 진행하기로 했어요", "{title} · 견적서 마감"),
    # 3.2 견적·채팅
    "QUOTE_RECEIVED": ("QUOTE_CHAT", "{company}가 견적서를 보냈어요", "{stage} · {amount}원"),
    "QUOTE_UPDATED": ("QUOTE_CHAT", "{company}가 견적서를 고쳤어요 (v{version})", "{stage} · {amount}원"),
    "CHAT_STARTED": ("QUOTE_CHAT", "{nickname}님이 채팅을 시작했어요", "{title} · {stage}"),
    "CONFIRM_REQUESTED": ("QUOTE_CHAT", "{company}가 최종 견적을 보냈어요", "{stage} · 견적서 v{version} · {amount}원 · 48시간 안에 확정해 주세요"),
    "CONFIRM_EXPIRING": ("QUOTE_CHAT", "최종 견적 기한이 6시간 남았어요", "{company} · {stage}"),
    "CONFIRMED": ("QUOTE_CHAT", "견적서가 확정됐어요", "{title} · {amount}원"),
    "CONFIRM_EXPIRED": ("QUOTE_CHAT", "최종 견적 기한이 지났어요", "{title} · 필요하면 다시 보내 주세요"),
    # 3.3 견적 요청 (명세의 오퍼)
    "OFFER_RECEIVED": ("OFFER", "견적 요청을 받았어요", "{title} · {date} · 48시간 안에 답해 주세요"),
    "OFFER_DECLINED": ("OFFER", "{company}가 견적 요청을 거절했어요", "사유: {reason}"),
    "OFFER_EXPIRED": ("OFFER", "{company}가 답하지 않아 견적 요청이 끝났어요", "다른 업체에 견적을 요청할 수 있어요"),
    # 3.4 결제·취소
    "INVOICE_READY": ("PAYMENT", "통합 청구서가 나왔어요", "합계 {amount}원 · 결제하면 섭외가 확정돼요"),
    "PAID": ("PAYMENT", "결제가 끝나 섭외가 확정됐어요", "{title} · 최종 담당표를 확인해 주세요"),
    "CANCELLED_BY_USER": ("PAYMENT", "사용자가 공연을 취소했어요", "{title} · {penalty}"),
    "CANCELLED_BY_SUPPLIER": ("PAYMENT", "{company} 사정으로 {stage} 단계가 취소됐어요", "전액 환불 예정 · 그 단계만 다시 모집할 수 있어요"),
    "SETTLEMENT_SCHEDULED": ("PAYMENT", "공연이 끝나 정산 예정이에요", "{title} · {amount}원"),
    # 3.5 운영
    "WARNING_ISSUED": ("ADMIN", "경고를 받았어요 ({count}/3)", "사유: {reason} · 3회가 되면 이용이 정지돼요"),
    "ACCOUNT_SUSPENDED": ("ADMIN", "이용이 정지됐어요", "경고 3회 · 궁금한 점은 1:1 문의로 알려 주세요"),
    "ACCOUNT_UNSUSPENDED": ("ADMIN", "이용 정지가 풀렸어요", "다시 모든 기능을 쓸 수 있어요"),
    "POST_BLINDED": ("ADMIN", "관리자가 글을 가렸어요", "{board} · 사유: {reason} · 경고 1회"),
    "INQUIRY_ANSWERED": ("ADMIN", "1:1 문의에 답변이 왔어요", "{title}"),
    # 3.6 커뮤니티
    "COMMUNITY_COMMENT": ("COMMUNITY", "내 글에 댓글이 달렸어요", "{title} · \"{snippet}\""),
    "COMMUNITY_REPLY": ("COMMUNITY", "내 댓글에 답글이 달렸어요", "{title} · \"{snippet}\""),
}

STAGE_LABEL = {"VENUE": "공연장", "EQUIPMENT": "장비", "ENGINEER": "엔지니어"}
