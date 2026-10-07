# Instalar Living POS en un VPS de Hostinger

Sirve para cualquier VPS con Ubuntu o Debian (Hostinger, DigitalOcean, Contabo, etc.). La instalación deja corriendo:

- **La app** (backend Node.js + frontend React).
- **PostgreSQL** con los datos de todos los restaurantes, en un volumen que no se borra al actualizar.
- **Caddy**, que publica la app en los puertos 80/443 y saca y renueva el **certificado HTTPS** solo.
- **Respaldo diario** de la base de datos en `deploy/vps/backups/`, que guarda los últimos 14 días.

## Requisitos

| | Recomendado |
|---|---|
| Plan VPS | Mínimo 1 vCPU y 2 GB de RAM; 4 GB si vas a tener varios restaurantes con mucho movimiento. |
| Sistema | Plantilla **Ubuntu 24.04** (vale también la plantilla "Ubuntu con Docker"). |
| Dominio | Opcional, pero necesario para HTTPS (por ejemplo `app.tudominio.com`). Sin dominio la app abre por la IP, solo con HTTP. |

## Paso 1 — Preparar el VPS en hPanel
1. En **hPanel → VPS**, elige el sistema operativo **Ubuntu 24.04** y define la contraseña de root.
2. Anota la **IP** del VPS.
3. Si activaste el **Firewall** del VPS en hPanel, agrega reglas que permitan los puertos **22, 80 y 443** (TCP).

## Paso 2 — Apuntar tu dominio (para HTTPS)
En **hPanel → Dominios → DNS / Nameservers**, crea un registro:

| Tipo | Nombre | Apunta a | TTL |
|---|---|---|---|
| A | `app` | la IP del VPS | 300 |

Así `app.tudominio.com` apunta al VPS. El cambio puede tardar unos minutos. Si tu dominio está en otro proveedor, crea el mismo registro allá.

## Paso 3 — Entrar al VPS
Usa el **Terminal del navegador** de hPanel (botón *Terminal* o *Browser terminal*) o, desde tu computador:

```bash
ssh root@IP_DEL_VPS
```

## Paso 4 — Descargar el proyecto e instalar
Copia y pega, cambiando `app.tudominio.com` por tu dominio:

```bash
apt update && apt install -y git
git clone -b claude/living-restaurant-system-jxwjgr https://github.com/Urielvel2023/nuevoproyecto2026.git /opt/living-pos
cd /opt/living-pos
DOMAIN=app.tudominio.com bash deploy/vps/instalar.sh
```

- **Si el repositorio es privado**, `git clone` te pide usuario y contraseña. Escribe tu usuario de GitHub y, como contraseña, un *token* creado en GitHub → Settings → Developer settings → Personal access tokens, con permiso de lectura del repositorio.
- **Sin dominio**: ejecuta `bash deploy/vps/instalar.sh` y deja vacía la pregunta del dominio. La app quedará en `http://IP_DEL_VPS`.

El script instala Docker si falta y crea el archivo `.env` con claves aleatorias seguras. La primera vez construye la app (unos 5 minutos) y al final muestra la dirección. Abre esa dirección y usa **Registrar restaurante**.

## Uso diario

| Tarea | Comando (dentro de `/opt/living-pos`) |
|---|---|
| Ver si todo está corriendo | `docker compose ps` |
| Ver errores de la app | `docker compose logs -f app` |
| Actualizar a la última versión del código | `bash deploy/vps/actualizar.sh` |
| Respaldo inmediato | `bash deploy/vps/respaldar.sh` |
| Restaurar un respaldo (borra los datos actuales) | `bash deploy/vps/restaurar.sh deploy/vps/backups/ARCHIVO.sql.gz` |
| Reiniciar | `docker compose restart` |
| Cambiar días de prueba, Stripe, etc. | edita `.env` y luego `docker compose up -d` |

Si el VPS se reinicia, todo vuelve a arrancar solo.

## Seguridad (importante)
- **Copia los respaldos fuera del VPS**, por ejemplo una vez por semana a tu computador:
  `scp root@IP_DEL_VPS:/opt/living-pos/deploy/vps/backups/*.sql.gz .`
  Activa también las *Snapshots/Backups* del VPS en hPanel. Si el VPS se daña, los respaldos guardados dentro de él se pierden con él.
- **Guarda una copia del archivo `.env`** en un lugar seguro. Sin la clave de la base de datos no podrás restaurar los datos en otro servidor.
- **Nunca subas `.env` a GitHub** (ya está excluido en `.gitignore`).
- Recomendado: en hPanel agrega tu llave SSH y desactiva el acceso por contraseña.

## Problemas frecuentes

| Síntoma | Solución |
|---|---|
| El navegador dice que el sitio no es seguro, o no hay HTTPS | El dominio todavía no apunta a la IP (revisa el registro A) o los puertos 80/443 están cerrados en el firewall de hPanel. Corrígelo y ejecuta `docker compose restart caddy`. |
| `docker compose logs app` dice "JWT_SECRET es obligatorio" | Falta el `.env`. Ejecuta de nuevo `bash deploy/vps/instalar.sh`. |
| La app no abre por la IP | Revisa que el puerto 80 esté permitido en el firewall del VPS. |
| Quiero cambiar de "solo IP" a dominio | En `.env` cambia `SITE_ADDRESS=app.tudominio.com` y `APP_URL=https://app.tudominio.com`, y luego ejecuta `docker compose up -d`. |
