/**
 * 요청서 선택지: 화면 이름 ↔ 코드. 공연 형태·공간 유형은 data-model.md, 나머지 코드는 이 화면에서 정했다
 * (data-model.md 의 예시 FOH·BAND_ALLOWED 와 같은 모양). api-contract.md 에 옮겨 적어야 한다.
 */
import type { PerformanceForm, StageType } from "../../shared/api/types";

export interface Option<T extends string = string> {
  value: T;
  label: string;
}

export const FORMS: Option<PerformanceForm>[] = [
  { value: "BAND", label: "밴드" },
  { value: "THEATER", label: "연극·뮤지컬" },
  { value: "TALK_EVENT", label: "강연·행사" },
  { value: "RELIGIOUS", label: "종교 행사" },
  { value: "ETC", label: "기타" },
];

export const VENUE_TYPES: Option[] = [
  { value: "CONCERT_HALL", label: "전문 공연장" },
  { value: "CULTURE_SPACE", label: "복합문화공간" },
  { value: "ROOFTOP", label: "루프탑" },
  { value: "GARDEN", label: "정원" },
  { value: "WAREHOUSE", label: "창고" },
  { value: "ETC", label: "기타" },
];

/** 공연장 꼭 필요한 조건 — 공간 조건(VenueSnapshot.conditions) 키와 같은 이름이어야 CHK-03 이 비교한다 (#65) */
export const MUST_HAVE: Option[] = [
  { value: "BAND_ALLOWED", label: "밴드 공연 가능" },
  { value: "EXTERNAL_EQUIPMENT_ALLOWED", label: "외부 음향 장비 반입" },
  { value: "EXTERNAL_ENGINEER_ALLOWED", label: "외부 엔지니어 허용" },
  { value: "HAS_WAITING_ROOM", label: "대기실" },
  { value: "HAS_STAGE_PLATFORM", label: "무대 단상" },
  { value: "HAS_PARKING", label: "주차" },
];

export const SERVICES: Option[] = [
  { value: "TRANSPORT", label: "운반" },
  { value: "INSTALL", label: "설치 및 철수" },
];

/** 엔지니어 작업 (Q-24, D-17) */
export const TASKS: Option[] = [
  { value: "FOH", label: "메인 음향 (FOH 믹싱)" },
  { value: "INSTALL_ASSIST", label: "설치 및 철수 보조" },
  { value: "SOUNDCHECK", label: "사운드체크·리허설 진행 (동행 시)" },
  { value: "MONITOR", label: "모니터 믹싱 (무대 위 연주자용 소리)" },
  { value: "WIRELESS", label: "무선 마이크 채널 관리" },
  { value: "RECORDING", label: "녹음 / 라이브 스트리밍 음향 송출 (추가금이 붙어요)" },
  { value: "TROUBLESHOOT", label: "공연 중 장비 문제 대응" },
];

export const CONDITIONS: Option[] = [
  { value: "BAND_EXPERIENCE", label: "밴드 공연 경험" },
  { value: "REHEARSAL", label: "리허설 참여 가능" },
  { value: "TEARDOWN", label: "철수까지 함께" },
];

export const SIDO: string[] = [
  "서울특별시", "부산광역시", "대구광역시", "인천광역시", "광주광역시", "대전광역시", "울산광역시", "세종특별자치시",
  "경기도", "강원특별자치도", "충청북도", "충청남도", "전북특별자치도", "전라남도", "경상북도", "경상남도",
  "제주특별자치도",
];

export const STAGE_LABEL: Record<StageType, string> = { VENUE: "공연장", EQUIPMENT: "장비", ENGINEER: "엔지니어" };
