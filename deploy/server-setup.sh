#!/usr/bin/env bash
# 새 EC2(Ubuntu 24.04)에 한 번만 실행한다: Docker 설치, 스왑 2GB, 저장소 받기, 백업 예약.
# 사용: ssh ubuntu@서버 'bash -s' < deploy/server-setup.sh   (자세한 순서: specs/deploy.md 4장)
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/KHW1003/stage-duck.git}"

echo "== 1. 패키지 업데이트, Docker 설치"
sudo apt-get update -y
sudo apt-get install -y ca-certificates curl git
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update -y
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker "$USER"

echo "== 2. 스왑 2GB (t3.small 2GB 메모리에서 프론트 빌드가 멈추지 않게)"
if ! swapon --show | grep -q /swapfile; then
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab > /dev/null
fi

echo "== 3. 시간대"
sudo timedatectl set-timezone Asia/Seoul

echo "== 4. 저장소 받기"
if [ ! -d ~/stage-duck ]; then
  git clone --branch main "$REPO_URL" ~/stage-duck
fi
if [ ! -f ~/stage-duck/deploy/.env ]; then
  cp ~/stage-duck/deploy/env.prod.example ~/stage-duck/deploy/.env
  chmod 600 ~/stage-duck/deploy/.env
  echo "!! ~/stage-duck/deploy/.env 를 열어 비밀 값을 채운 뒤 첫 배포를 하세요."
fi

echo "== 5. DB 백업 매일 04:00 (7일치 보관)"
mkdir -p ~/backups
( crontab -l 2>/dev/null | grep -v stage-duck/deploy/backup.sh ; echo "0 4 * * * bash ~/stage-duck/deploy/backup.sh >> ~/backups/backup.log 2>&1" ) | crontab -

echo "끝. 한 번 로그아웃했다가 다시 접속해야 docker 명령을 sudo 없이 쓸 수 있어요."
