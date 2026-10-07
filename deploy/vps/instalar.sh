#!/usr/bin/env bash
# Instala Living POS en un VPS Ubuntu/Debian (Hostinger u otro).
# Uso (como root, dentro de la carpeta del proyecto):
#   bash deploy/vps/instalar.sh                 # pregunta el dominio
#   DOMAIN=app.midominio.com bash deploy/vps/instalar.sh
# Vuelve a ejecutarlo cuando quieras: no borra datos ni cambia las claves ya creadas.
set -euo pipefail

cd "$(dirname "$0")/../.."
ROOT="$(pwd)"

if [ "$(id -u)" -ne 0 ]; then
  echo "Ejecuta este script como root (o con sudo)." >&2
  exit 1
fi

echo "==> 1/5 Verificando Docker"
if ! command -v docker >/dev/null 2>&1; then
  echo "Instalando Docker (script oficial de get.docker.com)..."
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker >/dev/null 2>&1 || true
docker compose version >/dev/null

echo "==> 2/5 Configuración"
if [ ! -f .env ]; then
  if [ -z "${DOMAIN:-}" ]; then
    echo "Escribe tu dominio o subdominio (ej. app.midominio.com) ya apuntado a la IP de este VPS."
    read -r -p "Déjalo vacío para usar solo la IP, sin HTTPS: " DOMAIN || true
  fi
  if [ -n "${DOMAIN:-}" ]; then
    SITE_ADDRESS="$DOMAIN"
    APP_URL="https://$DOMAIN"
  else
    IP="$(curl -fsS --max-time 5 https://api.ipify.org || hostname -I | awk '{print $1}')"
    SITE_ADDRESS=":80"
    APP_URL="http://$IP"
  fi
  umask 077
  cat > .env <<ENV
# Generado por deploy/vps/instalar.sh el $(date -u +%Y-%m-%d). No lo compartas ni lo subas a GitHub.
SITE_ADDRESS=$SITE_ADDRESS
APP_URL=$APP_URL
POSTGRES_DB=living_pos
POSTGRES_USER=living_pos
POSTGRES_PASSWORD=$(openssl rand -hex 24)
JWT_SECRET=$(openssl rand -hex 48)
TRIAL_DAYS=28
ENFORCE_BILLING=false
# Cobro de suscripciones (opcional)
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_ID_STARTER=
STRIPE_PRICE_ID_PRO=
ENV
  echo "Archivo .env creado con claves aleatorias."
else
  echo ".env ya existe: se conservan las claves y la configuración."
fi
mkdir -p deploy/vps/backups

echo "==> 3/5 Abriendo puertos 80 y 443 (si el firewall ufw está activo)"
if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  ufw allow OpenSSH >/dev/null; ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null
fi

echo "==> 4/5 Construyendo e iniciando (la primera vez tarda unos minutos)"
docker compose up -d --build

echo "==> 5/5 Esperando a que la app responda"
for i in $(seq 1 60); do
  if docker compose exec -T app node -e "fetch('http://localhost:4000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; then
    APP_URL_SHOWN="$(grep '^APP_URL=' .env | cut -d= -f2-)"
    echo ""
    echo "Living POS está en línea: $APP_URL_SHOWN"
    echo "Abre esa dirección y usa 'Registrar restaurante' para crear tu cuenta."
    echo "Respaldos diarios en: $ROOT/deploy/vps/backups"
    exit 0
  fi
  sleep 3
done
echo "La app no respondió a tiempo. Revisa los registros con: docker compose logs app" >&2
exit 1
