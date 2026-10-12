# GitHub: pruebas y despliegue automático al VPS

Con esta configuración, cada cambio que llega a la rama `main` sigue este camino:

1. **Se prueba solo** (flujo `CI`): compila la app y corre la prueba completa de la API (mesas, cobros, permisos, cumplimiento) contra SQLite y PostgreSQL, además de construir la imagen Docker.
2. **Si todo pasa, se publica solo en tu VPS** (flujo `Desplegar al VPS`): GitHub entra por SSH a tu servidor, hace un respaldo de la base de datos, descarga la versión nueva y reinicia la app. Los datos no se tocan.

Si una prueba falla, no se despliega nada y GitHub te avisa por correo.

## Paso 1 — Fusionar los cambios en `main`
El trabajo está en el pull request **#2** (`claude/living-restaurant-system-jxwjgr` → `main`).
1. Abre el PR en GitHub y espera a que las pruebas (`CI`) salgan en verde ✅.
2. Pulsa **Merge pull request** y luego **Confirm merge**.

## Paso 2 — Instalar la app en el VPS (solo la primera vez)
Sigue `docs/DESPLIEGUE_VPS_HOSTINGER.md`. Si ya la instalaste desde la otra rama, no pasa nada: el despliegue automático cambia el VPS a `main` sin tocar los datos.

## Paso 3 — Crear una llave SSH para GitHub (en el VPS)
En la terminal del VPS, como root:

```bash
ssh-keygen -t ed25519 -C "github-actions-living-pos" -f ~/.ssh/github_actions -N ""
cat ~/.ssh/github_actions.pub >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
cat ~/.ssh/github_actions
```

El último comando muestra la **llave privada**, que empieza por `-----BEGIN OPENSSH PRIVATE KEY-----` y termina por `-----END OPENSSH PRIVATE KEY-----`. Cópiala completa, incluidas esas dos líneas. Solo debe ir en el secret de GitHub del paso 4: no la pegues en ningún otro lugar.

## Paso 4 — Guardar los datos del VPS en GitHub
En GitHub: **Settings → Secrets and variables → Actions → New repository secret**. Crea estos secrets:

| Nombre | Valor |
|---|---|
| `VPS_HOST` | La IP de tu VPS (en hPanel) |
| `VPS_USER` | `root` |
| `VPS_SSH_KEY` | La llave privada que copiaste en el paso 3 |
| `VPS_PORT` | Opcional. Solo si cambiaste el puerto SSH (por defecto es 22) |
| `VPS_PATH` | Opcional. Solo si instalaste en otra carpeta (por defecto `/opt/living-pos`) |

GitHub guarda los secrets cifrados: nadie los puede ver, ni siquiera tú después de guardarlos.

## Paso 5 — Probar el despliegue
En GitHub: **Actions → Desplegar al VPS → Run workflow → Run workflow**. En unos minutos debe quedar en verde. Al abrir el último paso verás `Desplegado: <commit>`.

Desde ese momento, cada vez que fusiones algo en `main`, se prueba y se publica solo.

## Recomendado
- **Aprobación manual antes de publicar.** En **Settings → Environments → produccion**, activa *Required reviewers* y ponte a ti mismo. GitHub esperará tu clic antes de cada despliegue.
- **Proteger `main`.** En **Settings → Branches → Add branch ruleset** (o *Add rule*) para `main`, activa *Require a pull request before merging* y *Require status checks to pass*, y selecciona las pruebas `Pruebas (sqlite)`, `Pruebas (postgres)` e `Imagen Docker`. Así nada sin probar llega a producción.
- **Visibilidad del repositorio.** Hoy el repositorio es **público**: cualquiera puede ver el código, aunque no tus claves, que viven en `.env` dentro del VPS y en los secrets de GitHub. Si lo vas a vender, considera hacerlo privado (**Settings → General → Danger Zone → Change visibility**). En ese caso, el VPS necesita permiso para descargarlo:
  ```bash
  ssh-keygen -t ed25519 -C "vps-living-pos" -f ~/.ssh/deploy_key -N ""
  cat ~/.ssh/deploy_key.pub
  ```
  Pega esa llave **pública** en GitHub → **Settings → Deploy keys → Add deploy key** (solo lectura). Luego, en el VPS:
  ```bash
  cd /opt/living-pos
  git config core.sshCommand "ssh -i ~/.ssh/deploy_key -o IdentitiesOnly=yes"
  git remote set-url origin git@github.com:Urielvel2023/nuevoproyecto2026.git
  ```

## Si algo falla

| Síntoma en GitHub Actions | Qué hacer |
|---|---|
| `CI` en rojo | Abre el flujo y luego el paso en rojo; el registro del servidor aparece al final. No se desplegó nada. |
| `Desplegar al VPS` dice "se omite el despliegue" | Falta el secret `VPS_HOST` (paso 4). |
| `ssh: handshake failed` o `unable to authenticate` | La llave en `VPS_SSH_KEY` está incompleta, o la pública no está en `~/.ssh/authorized_keys` del VPS. Repite el paso 3. |
| `No existe .env` | La app no está instalada en el VPS: corre `deploy/vps/instalar.sh` (paso 2). |
| `La app no respondió después del despliegue` | En el VPS: `cd /opt/living-pos && docker compose logs app`. Si necesitas volver atrás, restaura el respaldo que el despliegue creó justo antes (`bash deploy/vps/restaurar.sh deploy/vps/backups/living-pos-manual-...`). |
