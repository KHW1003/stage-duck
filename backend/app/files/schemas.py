"""파일 업로드 응답 (uploads.md 6장)."""
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class FileOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    id: int
    url: str
    thumb_url: str
    width: int | None
    height: int | None
