#!/usr/bin/env bash
# GitHub 라벨 생성 (gh CLI 로그인 필요). 저장소 폴더에서 실행: bash scripts/setup-labels.sh
set -e
label() { gh label create "$1" --color "$2" --description "$3" --force; }

# 담당 영역
label "area:1-회원·업체·게시판" "2ca02c" "묶음 1: 가입·입점·공간·PR 게시판·오퍼·프로필"
label "area:2-요청·배정"       "1f77b4" "묶음 2: 요청서·공고·순차 배정·반려 카운트"
label "area:3-견적·채팅"       "ff7f0e" "묶음 3: 견적서·채팅·컨펌·알림"
label "area:4-검사·결제·운영"  "9467bd" "묶음 4: 자동 검사·결제·취소·신고·관리자·시드"
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
