#!/usr/bin/env bash
# Pone en el VPS la última versión de la rama `main` y reinicia la app sin
# perder datos (la base de datos y los respaldos viven fuera del código).
# Lo ejecuta GitHub Actions por SSH; también se puede correr a mano:
#   bash deploy/vps/desplegar.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
BRANCH="${DEPLOY_BRANCH:-main}"

if [ ! -f .env ]; then
  echo "No existe .env: instala primero con deploy/vps/instalar.sh" >&2
  exit 1
fi

echo "==> Respaldo previo"
bash deploy/vps/respaldar.sh || echo "Aviso: no se pudo crear el respaldo previo"

echo "==> Descargando $BRANCH"
git fetch --prune origin "$BRANCH"
git checkout -B "$BRANCH" "origin/$BRANCH"

echo "==> Construyendo y reiniciando"
docker compose up -d --build --remove-orphans
docker image prune -f >/dev/null

echo "==> Verificando"
for i in $(seq 1 40); do
  if docker compose exec -T app node -e "fetch('http://localhost:4000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; then
    echo "Desplegado: $(git log -1 --format='%h %s')"
    exit 0
  fi
  sleep 3
done
echo "La app no respondió después del despliegue. Revisa: docker compose logs app" >&2
exit 1
