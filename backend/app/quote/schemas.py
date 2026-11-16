"""견적서 요청·응답 모양 (api-contract.md 3.3)."""
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

# quote_versions.amount_* 칸이 INT UNSIGNED라서 그 최댓값까지 받는다 (data-model.md)
MAX_AMOUNT = 4_294_967_295


class QuoteAmounts(BaseModel):
    """AC-F2-17: 견적서 항목별 금액. 원 단위 정수(부가세 포함), 0 이상."""

    model_config = ConfigDict(from_attributes=True, populate_by_name=True, alias_generator=to_camel, strict=True)

    items: int = Field(ge=0, le=MAX_AMOUNT)
    transport: int = Field(ge=0, le=MAX_AMOUNT)
    install: int = Field(ge=0, le=MAX_AMOUNT)
    labor: int = Field(ge=0, le=MAX_AMOUNT)
    etc: int = Field(ge=0, le=MAX_AMOUNT)
