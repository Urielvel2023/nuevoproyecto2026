# Restaurant SaaS

Sistema web multi-restaurante para bares y restaurantes en Latinoamérica: inventario, recetas con costeo, menú, mesas/pedidos, comanda de cocina en tiempo real, domicilios, reportes, facturación electrónica, contabilidad básica, nómina/asistencia y cobro de suscripción SaaS.

## 🌐 Publicarlo en internet (recomendado — sin instalar nada)

Si quieres una URL pública que puedas usar desde cualquier computador o celular sin instalar nada, salta directo a la sección **[Desplegar en Render](#desplegar-en-render)** más abajo. El resto de este documento (correr en tu computador) es solo para desarrollo local.

## Módulos incluidos

1. **Multi-tenant**: cada restaurante que se registra tiene su propio espacio aislado (inventario, menú, mesas, usuarios, contabilidad, etc.).
2. **Inventario/Almacén**: productos con stock, unidad, costo unitario, proveedor, alertas de stock mínimo, historial de movimientos (entradas/salidas/ajustes).
3. **Recetas / fichas técnicas**: cada plato o bebida se arma con ingredientes del inventario; el costo se calcula automáticamente según el costo actual de cada insumo.
4. **Menú**: categorías, platos/bebidas, precio de venta, margen (precio − costo), disponible/agotado.
5. **Mesas y pedidos**: el mesero abre una mesa, agrega ítems del menú, la cuenta se va sumando, se puede cerrar/cobrar.
6. **Comanda de cocina/barra**: pantalla separada en tiempo real con los pedidos pendientes; se pueden marcar como "listo" y "entregado".
7. **Descuento automático de inventario**: al vender un plato, se descuentan del almacén los insumos según su receta (y se repone si se cancela el ítem).
8. **Sincronización en tiempo real**: todos los cambios (precios, disponibilidad, nuevos pedidos, estados de cocina, domicilios) se reflejan al instante en todas las pantallas conectadas del mismo restaurante, vía WebSockets (Socket.io).
9. **Multi-país**: cada restaurante define su moneda, símbolo, nombre del impuesto y tasa al registrarse.
10. **Reportes**: ventas totales, ticket promedio, ventas por mesero, por plato/bebida, por categoría, y tendencia diaria — con gráficas.
11. **Facturación electrónica (DIAN / SAT / SUNAT)**: emite el documento fiscal de cada cuenta cerrada a través de un proveedor tecnológico certificado (Alegra para Colombia, Facturama para México, Nubefact para Perú), con numeración consecutiva, PDF descargable y CUFE/folio fiscal. Ver [Facturación electrónica](#facturación-electrónica) para lo que necesitas configurar.
12. **Contabilidad básica**: cuentas bancarias/caja, categorías de gasto, registro de gastos e ingresos manuales, registro automático del ingreso al cerrar una cuenta, y un resumen tipo estado de resultados (P&L) con saldos por cuenta.
13. **Nómina y asistencia**: cada empleado marca su entrada/salida desde el menú lateral; el admin define salario (mensual o por hora) y genera períodos de nómina que calculan el pago bruto/neto con deducciones de salud y pensión configurables.
14. **Domicilios / apps de delivery**: página pública de pedido directo (sin comisión de terceros), webhook por restaurante para recibir pedidos empujados desde apps de domicilios, y un flujo de estados (recibido → preparando → en camino → entregado).
15. **Suscripción SaaS**: cada restaurante nace con una prueba gratuita de 14 días; se puede cobrar la suscripción mensual con Stripe Checkout y gestionar el método de pago desde el portal de Stripe.
16. **Base de datos lista para producción**: usa SQLite en desarrollo local (cero instalación) y PostgreSQL en producción (ver [Base de datos](#base-de-datos)).

## Estructura del proyecto

```
restaurant-saas/
├── server/                    Backend: Node.js + Express + Socket.io
│   ├── db/
│   │   ├── schema.sql              Esquema para SQLite (desarrollo local)
│   │   ├── schema.pg.sql           Esquema equivalente para PostgreSQL (producción)
│   │   └── index.js                Adaptador de base de datos (elige motor según DATABASE_URL)
│   ├── routes/
│   │   ├── auth.js                 Registro de restaurante, login, crear personal
│   │   ├── inventory.js            CRUD de inventario + movimientos
│   │   ├── recipes.js              CRUD de recetas + costeo
│   │   ├── menu.js                 Categorías y platos del menú
│   │   ├── orders.js               Mesas, pedidos, comanda, descuento de stock
│   │   ├── reports.js              Endpoints de estadísticas
│   │   ├── invoicing.js            Facturación electrónica (DIAN/SAT/SUNAT)
│   │   ├── accounting.js           Bancos, gastos/ingresos, resumen P&L
│   │   ├── payroll.js              Asistencia y nómina
│   │   ├── delivery.js             Domicilios, pedido público, webhook de apps externas
│   │   └── billing.js              Suscripción SaaS (Stripe)
│   ├── services/                   Lógica de negocio compartida entre rutas
│   ├── utils/asyncHandler.js       Envoltorio de errores para rutas async
│   ├── auth.js                     JWT y middlewares de roles
│   └── index.js                    Servidor Express + Socket.io
└── client/                    Frontend: React + Vite
    └── src/
        ├── pages/
        │   ├── Login.jsx
        │   ├── PublicOrder.jsx         Pedido público de domicilio/recoger (sin login)
        │   ├── Delivery.jsx             Domicilios (mesero/admin)
        │   ├── Admin/                   Inventario, Recetas, Menú, Reportes, Personal,
        │   │                            Facturación, Contabilidad, Nómina, Suscripción
        │   ├── Waiter/                   Mesas y Pedido
        │   └── Kitchen/                  Comanda
        └── context/                      Auth y Socket (tiempo real)
```

## Cómo correrlo localmente

### 1. Backend

```bash
cd server
npm install
npm start
```

El servidor corre en `http://localhost:4000`. Sin `DATABASE_URL` configurada, usa SQLite y crea automáticamente `server/db/restaurant.db` la primera vez que arranca — no necesitas instalar ninguna base de datos para desarrollar.

### 2. Frontend

En otra terminal:

```bash
cd client
npm install
npm run dev
```

Abre `http://localhost:5173` en el navegador. El frontend ya está configurado para hablar con el backend en el puerto 4000 (ver `vite.config.js`).

### 3. Primer uso

1. Entra a `http://localhost:5173`, pestaña "Registrar restaurante".
2. Completa el nombre del restaurante, país (define moneda e impuesto automáticamente) y tus datos como administrador.
3. Ya dentro, como admin:
   - Ve a **Almacén** y agrega tus insumos (con su costo unitario).
   - Ve a **Recetas** y arma las fichas técnicas de tus platos/bebidas usando esos insumos.
   - Ve a **Menú**, crea categorías y agrega los platos enlazando su receta (el costo y margen se calculan solos).
   - Ve a **Personal** y crea cuentas para tus meseros y personal de cocina, y en **Nómina** define su salario.
   - Ve a **Facturación** y configura tus datos fiscales (opcional, ver más abajo).
   - Ve a **Contabilidad** y crea tu(s) cuenta(s) bancaria/caja.
4. Los meseros inician sesión y van a **Mesas** para abrir cuentas y tomar pedidos, o a **Domicilios** para pedidos a domicilio/recoger.
5. El personal de cocina inicia sesión y ve la **Comanda** en tiempo real.
6. Como admin, revisa **Reportes** para ver ventas por mesero, por plato y tendencias, y **Contabilidad** para tu estado de resultados.

## Notas técnicas

- La sincronización en tiempo real usa **Socket.io**: cada usuario se conecta a una "sala" privada de su restaurante, así que un cambio de precio, un pedido nuevo o un plato marcado como listo se reflejan al instante en las demás pantallas del mismo restaurante, sin necesidad de recargar.
- Las contraseñas se guardan con hash (bcrypt) y la sesión usa JWT.

## Base de datos

En desarrollo, sin configurar nada, el sistema usa **SQLite** (`server/db/restaurant.db`).

En producción se recomienda **PostgreSQL**: basta con definir la variable de entorno `DATABASE_URL` (ej. `postgres://usuario:clave@host:5432/basededatos`) y el servidor la usa automáticamente, creando las tablas necesarias en el primer arranque (`server/db/schema.pg.sql`). No hay que tocar código ni ejecutar migraciones a mano.

```
DATABASE_URL=postgres://usuario:clave@host:5432/basededatos
```

Si tu proveedor de Postgres requiere una conexión sin verificación estricta de certificado (común en muchos planes gratuitos/gestionados), eso ya viene configurado por defecto; para desactivarlo usa `DATABASE_SSL=false`.

## Facturación electrónica

El módulo de Facturación (Admin → Facturación) genera el documento (número consecutivo, PDF, subtotal/impuesto/total) para cada cuenta cerrada. Para que ese documento tenga **validez fiscal real** ante la DIAN (Colombia), el SAT (México) o la SUNAT (Perú), necesitas conectar tu propia cuenta con un proveedor tecnológico certificado — la ley exige que sea un proveedor autorizado quien firme y transmita el documento, ningún software por sí solo puede hacerlo sin ese registro:

- **Colombia (DIAN)** → [Alegra](https://www.alegra.com) (u otro proveedor con API similar).
- **México (SAT/CFDI)** → [Facturama](https://www.facturama.mx).
- **Perú (SUNAT)** → [Nubefact](https://www.nubefact.com).

Pasos: crea una cuenta con el proveedor que corresponda a tu país, habilita facturación electrónica ahí, y pega las credenciales que te den en Admin → Facturación → Configuración. Si no conectas ningún proveedor, el sistema sigue generando el documento y el PDF, pero claramente marcado como **borrador interno sin validez fiscal** — útil como cuenta de cobro mientras defines tu proveedor.

Si ya facturas por fuera del sistema (por ejemplo con el portal gratuito de la DIAN), usa el modo **Manual**: solo registra el CUFE/folio fiscal para tener el historial completo en un solo lugar.

## Suscripción SaaS (cobrar a otros restaurantes)

Cada restaurante que se registra recibe automáticamente 14 días de prueba. Para cobrar la suscripción hay dos pasarelas disponibles — puedes activar una o ambas:

### Opción A — Wompi (recomendada para Colombia)

Stripe no permite recibir pagos directamente como negocio colombiano; [Wompi](https://wompi.co) (de Bancolombia) sí.

1. Crea una cuenta en [comercios.wompi.co](https://comercios.wompi.co) (puedes empezar en modo sandbox/pruebas mientras completas el registro del negocio con NIT/RUT).
2. En **Configuración → Llaves de API**, copia la **Llave pública**, el **Secreto de integridad** y el **Secreto de eventos**.
3. Configura estas variables de entorno en el servidor:

```
WOMPI_PUBLIC_KEY=pub_...
WOMPI_INTEGRITY_SECRET=...
WOMPI_EVENTS_SECRET=...
APP_URL=https://tu-dominio.com
# Opcional: precio mensual en pesos colombianos (por defecto Starter=49000, Pro=99000)
WOMPI_PRICE_STARTER=49000
WOMPI_PRICE_PRO=99000
```

4. En el panel de Wompi, configura la URL de eventos (webhook) apuntando a `https://tu-dominio.com/api/billing/wompi/webhook`.

**Importante:** Wompi no ofrece cobro recurrente automático accesible a cualquier comercio — cada pago aprobado activa la suscripción por 30 días, y para el siguiente período el restaurante debe volver a la pestaña Suscripción y pagar de nuevo (el botón dice "Renovar con Wompi"). No es cobro automático mes a mes como Stripe.

### Opción B — Stripe (para negocios que sí pueden recibir pagos internacionales)

1. Crea una cuenta en [Stripe](https://stripe.com) y crea dos productos recurrentes (Starter y Pro, o los que definas).
2. Configura estas variables de entorno en el servidor:

```
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID_STARTER=price_...
STRIPE_PRICE_ID_PRO=price_...
APP_URL=https://tu-dominio.com
```

3. En el panel de Stripe, configura un webhook apuntando a `https://tu-dominio.com/api/billing/webhook` escuchando los eventos `checkout.session.completed`, `customer.subscription.updated` y `customer.subscription.deleted`. Esta sí es una suscripción con cobro automático recurrente.

### Enforcement (opcional, para ambas)

Define `ENFORCE_BILLING=true` para que, una vez vencida la prueba, el sistema bloquee el uso (código 402) hasta que el restaurante pague. **Por defecto está apagado**, así que instalar esto no afecta a nadie hasta que decidas activarlo.

Sin ninguna de estas variables, el sistema funciona exactamente igual (la pestaña Suscripción solo indica que el cobro no está configurado todavía).

## Próximos pasos sugeridos

- Nota crédito / anulación fiscal reversible ante el proveedor certificado (hoy la anulación es solo interna).
- Exportación de reportes y estado de resultados a Excel/PDF.
- Soporte multi-sucursal por restaurante.
- Traducción a portugués para el mercado brasileño.
- Reconciliación bancaria automática (conciliar extractos bancarios importados contra los movimientos registrados).

---

## Desplegar en Render

Esto publica tu sistema en una URL pública como `https://tu-restaurante.onrender.com`, accesible desde cualquier navegador, sin que nadie tenga que instalar nada. El backend ya está preparado para servir el frontend compilado como un solo sitio web.

### Paso 1 — Sube el código a GitHub

1. Entra a [github.com](https://github.com) e inicia sesión.
2. Arriba a la derecha, clic en el **+** → **New repository**.
3. Ponle un nombre, por ejemplo `restaurant-saas`. Déjalo en **Public** o **Private** (cualquiera sirve). No marques ninguna casilla de inicialización. Clic en **Create repository**.
4. En la página del repo recién creado, busca el enlace **"uploading an existing file"** (o el botón **Add file → Upload files**).
5. Arrastra ahí **todas las carpetas y archivos** de este proyecto (`server/`, `client/`, `README.md`, `.gitignore`) — **excepto** las carpetas `node_modules` si las llegaste a crear localmente (no deberían subirse).
6. Baja hasta el final de la página y clic en **Commit changes**.

### Paso 2 — Crea una base de datos PostgreSQL en Render

1. En el panel de Render, clic en **New +** → **PostgreSQL**.
2. Dale un nombre y elige el plan (hay uno gratuito, con límite de retención de datos — para un negocio real conviene el plan pagado más económico).
3. Cuando esté lista, copia el **Internal Database URL** (lo necesitas en el paso siguiente).

### Paso 3 — Crea cuenta en Render y conecta el repo

1. Ve a [render.com](https://render.com) y crea una cuenta gratis (puedes usar "Sign up with GitHub" para conectarlo de una vez).
2. En el panel, clic en **New +** → **Web Service**.
3. Elige **Build and deploy from a Git repository** y selecciona el repositorio `restaurant-saas` que acabas de subir (autoriza el acceso si te lo pide).
4. Completa la configuración así:
   - **Name**: el nombre que quieras (será parte de tu URL).
   - **Region**: la más cercana a Latinoamérica disponible (ej. Ohio), la misma región que tu base de datos.
   - **Branch**: `main`.
   - **Root Directory**: déjalo vacío.
   - **Runtime**: `Node`.
   - **Build Command**:
     ```
     npm install --prefix client && npm run build --prefix client && npm install --prefix server
     ```
   - **Start Command**:
     ```
     npm start --prefix server
     ```
   - **Instance Type**: la que prefieras (el plan `Free` funciona para probar).
5. En **Environment Variables**, agrega al menos:
   - **JWT_SECRET**: cualquier texto largo y aleatorio (protege las sesiones de tus usuarios). Ejemplo: `mi-restaurante-clave-secreta-2026-xyz`.
   - **DATABASE_URL**: pega aquí el Internal Database URL de tu base de datos Postgres del paso 2.
   - Si vas a cobrar suscripción, agrega también las variables de Stripe (ver [Suscripción SaaS](#suscripción-saas-cobrar-a-otros-restaurantes)), con `APP_URL` = la URL pública que te dé Render.
6. Clic en **Create Web Service**.

Render va a instalar todo y arrancar el sitio — toma unos 3-5 minutos la primera vez. Al arrancar, el servidor crea automáticamente las tablas en tu base de datos Postgres. Cuando termine, te da una URL pública (algo como `https://restaurant-saas.onrender.com`) que puedes abrir desde cualquier computador o celular, y compartir con tus meseros y cocina.

### Importante sobre el plan gratuito de Render

- El servicio web gratuito "se duerme" tras ~15 minutos sin uso, y tarda unos 30-50 segundos en despertar la próxima vez que alguien entra. Para un restaurante en operación activa esto puede ser molesto; el plan pagado más económico de Render (desde ~$7/mes) elimina ese problema.
- Con la base de datos PostgreSQL de Render (en vez de SQLite dentro del mismo servicio como antes), **tus datos ya no se pierden si el servicio web se reinicia o redespliega** — viven en la base de datos administrada, separada del servicio web. El plan gratuito de Postgres de Render sí tiene un límite de tiempo de retención (revisa las condiciones vigentes); para un negocio real en producción se recomienda el plan pagado.

### Actualizaciones futuras

Cada vez que quieras subir un cambio: edita los archivos en GitHub (o sube nuevas versiones con "Upload files"), y Render vuelve a desplegar automáticamente en unos minutos.
