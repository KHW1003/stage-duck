"""알림 문구 틀 (specs/notifications.md 3장). 화면 문구는 "견적 요청" (11/19 팀 결정, 명세의 '오퍼').
사용자에게 보내는 글이라 합니다체로 쓴다 (11/19 팀 결정, DESIGN.md 7장).

type → (분류, 제목 틀, 보조 줄 틀). 틀은 str.format 으로 params 를 채운다. 보조 줄이 없으면 None.
"""

TEMPLATES: dict[str, tuple[str, str, str | None]] = {
    # 3.1 입점·공고 (업체)
    "SUPPLIER_APPROVED": ("ADMIN", "입점이 승인되었습니다", "서비스를 등록하시면 공고를 보실 수 있습니다"),
    "SUPPLIER_REJECTED": ("ADMIN", "입점 신청이 반려되었습니다", "사유: {reason}"),
    "POSTING_OPENED": ("POSTING", "새 공고가 열렸습니다", "{title} · {date} · {stage}"),
    "POSTING_UPDATED": ("POSTING", "공고 내용이 변경되었습니다 (v{version})", "{title}"),
    "POSTING_CLOSED": ("POSTING", "사용자가 공고를 내렸습니다", "{title}"),
    "NOT_SELECTED": ("POSTING", "사용자가 다른 업체와 진행하기로 했습니다", "{title} · 견적서 마감"),
    # 3.2 견적·채팅
    "QUOTE_RECEIVED": ("QUOTE_CHAT", "{company}에서 견적서를 보냈습니다", "{stage} · {amount}원"),
    "QUOTE_UPDATED": ("QUOTE_CHAT", "{company}에서 견적서를 수정했습니다 (v{version})", "{stage} · {amount}원"),
    "CHAT_STARTED": ("QUOTE_CHAT", "{nickname}님이 채팅을 시작했습니다", "{title} · {stage}"),
    "CONFIRM_REQUESTED": ("QUOTE_CHAT", "{company}에서 최종 견적을 보냈습니다", "{stage} · 견적서 v{version} · {amount}원 · 48시간 안에 확정해 주십시오"),
    "CONFIRM_EXPIRING": ("QUOTE_CHAT", "최종 견적 기한이 6시간 남았습니다", "{company} · {stage}"),
    "CONFIRMED": ("QUOTE_CHAT", "견적서가 확정되었습니다", "{title} · {amount}원"),
    "CONFIRM_EXPIRED": ("QUOTE_CHAT", "최종 견적 기한이 지났습니다", "{title} · 필요하시면 다시 보내 주십시오"),
    # 3.3 견적 요청 (명세의 오퍼)
    "OFFER_RECEIVED": ("OFFER", "견적 요청을 받았습니다", "{title} · {date} · 48시간 안에 답변해 주십시오"),
    "OFFER_DECLINED": ("OFFER", "{company}에서 견적 요청을 거절했습니다", "사유: {reason}"),
    "OFFER_EXPIRED": ("OFFER", "{company}의 답변이 없어 견적 요청이 종료되었습니다", "다른 업체에 견적을 요청하실 수 있습니다"),
    # 3.4 결제·취소
    "INVOICE_READY": ("PAYMENT", "통합 청구서가 발행되었습니다", "합계 {amount}원 · 결제하시면 섭외가 확정됩니다"),
    "PAID": ("PAYMENT", "결제가 완료되어 섭외가 확정되었습니다", "{title} · 최종 담당표를 확인해 주십시오"),
    "CANCELLED_BY_USER": ("PAYMENT", "사용자가 공연을 취소했습니다", "{title} · {penalty}"),
    "CANCELLED_BY_SUPPLIER": ("PAYMENT", "{company} 사정으로 {stage} 단계가 취소되었습니다", "전액 환불 예정 · 해당 단계만 다시 모집하실 수 있습니다"),
    "SETTLEMENT_SCHEDULED": ("PAYMENT", "공연이 종료되어 정산 예정입니다", "{title} · {amount}원"),
    # 3.5 운영
    "WARNING_ISSUED": ("ADMIN", "경고가 부과되었습니다 ({count}/3)", "사유: {reason} · 3회가 되면 이용이 정지됩니다"),
    "ACCOUNT_SUSPENDED": ("ADMIN", "이용이 정지되었습니다", "경고 3회 · 문의 사항은 1:1 문의로 남겨 주십시오"),
    "ACCOUNT_UNSUSPENDED": ("ADMIN", "이용 정지가 해제되었습니다", "다시 모든 기능을 이용하실 수 있습니다"),
    "POST_BLINDED": ("ADMIN", "관리자가 게시글을 숨김 처리했습니다", "{board} · 사유: {reason} · 경고 1회"),
    "INQUIRY_ANSWERED": ("ADMIN", "1:1 문의에 답변이 등록되었습니다", "{title}"),
    # 3.6 커뮤니티
    "COMMUNITY_COMMENT": ("COMMUNITY", "내 글에 댓글이 달렸습니다", "{title} · \"{snippet}\""),
    "COMMUNITY_REPLY": ("COMMUNITY", "내 댓글에 답글이 달렸습니다", "{title} · \"{snippet}\""),
}

STAGE_LABEL = {"VENUE": "공연장", "EQUIPMENT": "장비", "ENGINEER": "엔지니어"}
