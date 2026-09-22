# Restaurant SaaS — MVP

Sistema web multi-restaurante para bares y restaurantes en Latinoamérica: inventario, recetas con costeo, menú, mesas/pedidos, comanda de cocina en tiempo real y reportes de ventas.

## 🌐 Publicarlo en internet (recomendado — sin instalar nada)

Si quieres una URL pública que puedas usar desde cualquier computador o celular sin instalar nada, salta directo a la sección **[Desplegar en Render (gratis)](#desplegar-en-render-gratis)** más abajo. El resto de este documento (correr en tu computador) es solo para desarrollo local.

## Módulos incluidos

1. **Multi-tenant**: cada restaurante que se registra tiene su propio espacio aislado (inventario, menú, mesas, usuarios).
2. **Inventario/Almacén**: productos con stock, unidad, costo unitario, proveedor, alertas de stock mínimo, historial de movimientos (entradas/salidas/ajustes).
3. **Recetas / fichas técnicas**: cada plato o bebida se arma con ingredientes del inventario; el costo se calcula automáticamente según el costo actual de cada insumo.
4. **Menú**: categorías, platos/bebidas, precio de venta, margen (precio − costo), disponible/agotado.
5. **Mesas y pedidos**: el mesero abre una mesa, agrega ítems del menú, la cuenta se va sumando, se puede cerrar/cobrar (no es factura fiscal, es una cuenta interna).
6. **Comanda de cocina/barra**: pantalla separada en tiempo real con los pedidos pendientes; se pueden marcar como "listo" y "entregado".
7. **Descuento automático de inventario**: al vender un plato, se descuentan del almacén los insumos según su receta (y se repone si se cancela el ítem).
8. **Sincronización en tiempo real**: todos los cambios (precios, disponibilidad, nuevos pedidos, estados de cocina) se reflejan al instante en todas las pantallas conectadas del mismo restaurante, vía WebSockets (Socket.io).
9. **Multi-país**: cada restaurante define su moneda, símbolo, nombre del impuesto y tasa al registrarse (no incluye facturación electrónica).
10. **Reportes**: ventas totales, ticket promedio, ventas por mesero, por plato/bebida, por categoría, y tendencia diaria — con gráficas.

## Estructura del proyecto

```
restaurant-saas/
├── server/          Backend: Node.js + Express + SQLite + Socket.io
│   ├── db/
│   │   ├── schema.sql       Esquema completo de la base de datos
│   │   └── index.js         Conexión a SQLite
│   ├── routes/
│   │   ├── auth.js          Registro de restaurante, login, crear personal
│   │   ├── inventory.js     CRUD de inventario + movimientos
│   │   ├── recipes.js       CRUD de recetas + costeo
│   │   ├── menu.js          Categorías y platos del menú
│   │   ├── orders.js        Mesas, pedidos, comanda, descuento de stock
│   │   └── reports.js       Endpoints de estadísticas
│   ├── auth.js       JWT y middlewares de roles
│   └── index.js      Servidor Express + Socket.io
└── client/           Frontend: React + Vite
    └── src/
        ├── pages/
        │   ├── Login.jsx
        │   ├── Admin/       Inventario, Recetas, Menú, Reportes, Personal
        │   ├── Waiter/      Mesas y Pedido
        │   └── Kitchen/     Comanda
        └── context/         Auth y Socket (tiempo real)
```

## Cómo correrlo

### 1. Backend

```bash
cd server
npm install
npm start
```

El servidor corre en `http://localhost:4000`. La base de datos SQLite se crea automáticamente en `server/db/restaurant.db` la primera vez que arranca.

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
   - Ve a **Personal** y crea cuentas para tus meseros y personal de cocina.
4. Los meseros inician sesión y van a **Mesas** para abrir cuentas y tomar pedidos.
5. El personal de cocina inicia sesión y ve la **Comanda** en tiempo real.
6. Como admin, revisa **Reportes** para ver ventas por mesero, por plato y tendencias.

## Notas técnicas

- La sincronización en tiempo real usa **Socket.io**: cada usuario se conecta a una "sala" privada de su restaurante, así que un cambio de precio, un pedido nuevo o un plato marcado como listo se reflejan al instante en las demás pantallas del mismo restaurante, sin necesidad de recargar.
- No incluye facturación electrónica (DIAN, SAT, SUNAT, etc.) — la "cuenta" que cierra el mesero es un documento interno, no un comprobante fiscal.
- La base de datos es SQLite para que puedas probarlo fácilmente sin instalar nada más. Para producción real con muchos restaurantes, se recomienda migrar a PostgreSQL (la estructura de las consultas es muy similar).
- Las contraseñas se guardan con hash (bcrypt) y la sesión usa JWT.

## Próximos pasos sugeridos

- Migrar de SQLite a PostgreSQL para mayor solidez en producción.
- Agregar pasarela de pagos si vas a cobrar suscripción a otros restaurantes.
- Agregar exportación de reportes a Excel/PDF.
- Soporte multi-sucursal por restaurante.
- Traducción a portugués para el mercado brasileño.

---

## Desplegar en Render (gratis)

Esto publica tu sistema en una URL pública como `https://tu-restaurante.onrender.com`, accesible desde cualquier navegador, sin que nadie tenga que instalar nada. El backend ya está preparado para servir el frontend compilado como un solo sitio web.

### Paso 1 — Sube el código a GitHub

1. Entra a [github.com](https://github.com) e inicia sesión.
2. Arriba a la derecha, clic en el **+** → **New repository**.
3. Ponle un nombre, por ejemplo `restaurant-saas`. Déjalo en **Public** o **Private** (cualquiera sirve). No marques ninguna casilla de inicialización. Clic en **Create repository**.
4. En la página del repo recién creado, busca el enlace **"uploading an existing file"** (o el botón **Add file → Upload files**).
5. Arrastra ahí **todas las carpetas y archivos** de este proyecto (`server/`, `client/`, `README.md`, `.gitignore`) — **excepto** las carpetas `node_modules` si las llegaste a crear localmente (no deberían subirse).
6. Baja hasta el final de la página y clic en **Commit changes**.

### Paso 2 — Crea cuenta en Render y conecta el repo

1. Ve a [render.com](https://render.com) y crea una cuenta gratis (puedes usar "Sign up with GitHub" para conectarlo de una vez).
2. En el panel, clic en **New +** → **Web Service**.
3. Elige **Build and deploy from a Git repository** y selecciona el repositorio `restaurant-saas` que acabas de subir (autoriza el acceso si te lo pide).
4. Completa la configuración así:
   - **Name**: el nombre que quieras (será parte de tu URL).
   - **Region**: la más cercana a Latinoamérica disponible (ej. Ohio).
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
   - **Instance Type**: `Free`.
5. En **Environment Variables**, agrega una variable:
   - **Key**: `JWT_SECRET`
   - **Value**: cualquier texto largo y aleatorio (esto protege las sesiones de tus usuarios). Ejemplo: `mi-restaurante-clave-secreta-2026-xyz`.
6. Clic en **Create Web Service**.

Render va a instalar todo y arrancar el sitio — toma unos 3-5 minutos la primera vez. Cuando termine, te da una URL pública (algo como `https://restaurant-saas.onrender.com`) que puedes abrir desde cualquier computador o celular, y compartir con tus meseros y cocina.

### Importante sobre el plan gratuito de Render

- El servicio gratuito "se duerme" tras ~15 minutos sin uso, y tarda unos 30-50 segundos en despertar la próxima vez que alguien entra. Para un restaurante en operación activa esto puede ser molesto; el plan pagado más económico de Render (desde ~$7/mes) elimina ese problema.
- La base de datos SQLite vive dentro del mismo servicio. En el plan gratuito, **los datos se pueden perder si Render reinicia o redepliega el servicio**. Para uso real de negocio (no solo pruebas), lo recomendable es agregar un disco persistente de Render (plan pagado) o migrar a una base de datos administrada como PostgreSQL. Puedo ayudarte con ese paso cuando quieras pasar a producción real.

### Actualizaciones futuras

Cada vez que quieras subir un cambio: edita los archivos en GitHub (o sube nuevas versiones con "Upload files"), y Render vuelve a desplegar automáticamente en unos minutos.
