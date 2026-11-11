#!/usr/bin/env bash
# GitHub 라벨 생성 (gh CLI 로그인 필요). 저장소 폴더에서 실행: bash scripts/setup-labels.sh
set -e
label() { gh label create "$1" --color "$2" --description "$3" --force; }

# 담당 영역
label "area:request"  "1f77b4" "1. 공연 요청·공간 선택"
label "area:supplier" "2ca02c" "2. 공급자 등록·전문가 견적"
label "area:compare"  "ff7f0e" "3. 견적 비교·구성 확인"
label "area:payment"  "9467bd" "4. 업체 수락·결제·확정"
label "area:common"   "7f7f7f" "공통 (계정·레이아웃·규칙)"

# 종류
label "type:feature"  "a2eeef" "새 기능"
label "type:bug"      "d73a4a" "버그"
label "type:task"     "fef2c0" "조사·문서·설정"
label "type:refactor" "c5def5" "리팩터링"

# 우선순위·상태
label "priority:high" "b60205" "MVP 필수 / 급함"
label "priority:low"  "c2e0c6" "나중에"
label "blocked"       "000000" "다른 작업 대기 중"
label "needs-advice"  "f9d0c4" "현장 자문 필요 (목산님)"
label "needs-discussion" "d4c5f9" "팀 합의 필요"
