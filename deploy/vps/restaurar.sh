#!/usr/bin/env bash
# Restaura un respaldo. ATENCIÓN: reemplaza todos los datos actuales.
# Uso: bash deploy/vps/restaurar.sh deploy/vps/backups/living-pos-AAAAMMDD-HHMM.sql.gz
set -euo pipefail
cd "$(dirname "$0")/../.."
file="${1:?Indica el archivo de respaldo .sql.gz}"
read -r -p "Esto BORRA los datos actuales y carga $file. Escribe RESTAURAR para continuar: " ok
[ "$ok" = "RESTAURAR" ] || { echo "Cancelado."; exit 1; }
docker compose stop app
docker compose exec -T db sh -c 'dropdb -U "$POSTGRES_USER" --if-exists "$POSTGRES_DB" && createdb -U "$POSTGRES_USER" "$POSTGRES_DB"'
gunzip -c "$file" | docker compose exec -T db sh -c 'psql -q -U "$POSTGRES_USER" "$POSTGRES_DB"'
docker compose start app
echo "Restauración completa."
