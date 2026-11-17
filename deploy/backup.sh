#!/usr/bin/env bash
# 시연 서버 DB 백업 (cron 매일 04:00, server-setup.sh가 등록). 7일 지난 백업은 지운다.
# 되살리기: gunzip -c ~/backups/stageduck-날짜.sql.gz | docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env exec -T db sh -c 'mariadb -uroot -p"$MARIADB_ROOT_PASSWORD" "$MARIADB_DATABASE"'
set -euo pipefail
cd ~/stage-duck
STAMP=$(date +%Y%m%d-%H%M)
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env exec -T db \
  sh -c 'mariadb-dump -uroot -p"$MARIADB_ROOT_PASSWORD" --single-transaction --routines "$MARIADB_DATABASE"' \
  | gzip > ~/backups/stageduck-"$STAMP".sql.gz
find ~/backups -name 'stageduck-*.sql.gz' -mtime +7 -delete
echo "$(date '+%F %T') backup ok: stageduck-$STAMP.sql.gz"
