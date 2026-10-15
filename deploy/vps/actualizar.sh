#!/usr/bin/env bash
# Descarga la última versión del código y reinicia la app sin perder datos.
# Uso: bash deploy/vps/actualizar.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
git pull --ff-only
docker compose up -d --build
docker image prune -f >/dev/null
echo "Actualizado. Las migraciones de base de datos se aplican solas al arrancar."
