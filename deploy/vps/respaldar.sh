#!/usr/bin/env bash
# Respaldo inmediato (además del automático diario). Uso: bash deploy/vps/respaldar.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
f="deploy/vps/backups/living-pos-manual-$(date +%Y%m%d-%H%M).sql.gz"
docker compose exec -T db sh -c 'pg_dump --no-owner -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip > "$f"
echo "Respaldo creado: $f"
