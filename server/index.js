const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { JWT_SECRET, moduleGuard } = require('./auth');
const db = require('./db');

const app = express();
app.use(cors());
// El webhook de Stripe necesita el body crudo (raw) para verificar la firma,
// así que se monta antes que express.json() (ver routes/billing.js).
app.use('/api/billing/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
app.set('io', io);

// Autenticación de sockets: cada cliente se une a la "sala" de su restaurante (tenant)
// Esto es lo que hace posible la sincronización en tiempo real entre mesero/cocina/caja
io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('No autenticado'));
    const payload = jwt.verify(token, JWT_SECRET);
    socket.user = payload;
    next();
  } catch (e) {
    next(new Error('Token inválido'));
  }
});

io.on('connection', (socket) => {
  socket.join(socket.user.restaurant_id);
  socket.on('disconnect', () => {});
});

// moduleGuard asocia cada router a un módulo de la matriz de accesos
// (permissions.js), para que cada departamento entre solo a lo suyo.
app.use('/api/auth', require('./routes/auth'));
app.use('/api/compliance', require('./routes/compliance'));
app.use('/api/inventory', moduleGuard('inventario'), require('./routes/inventory'));
app.use('/api/recipes', moduleGuard('recetas'), require('./routes/recipes'));
app.use('/api/menu', moduleGuard('menu'), require('./routes/menu'));
app.use('/api/orders', moduleGuard('pedidos'), require('./routes/orders'));
app.use('/api/reports', moduleGuard('reportes'), require('./routes/reports'));
app.use('/api/invoicing', moduleGuard('facturacion'), require('./routes/invoicing'));
app.use('/api/accounting', moduleGuard('contabilidad'), require('./routes/accounting'));
app.use('/api/payroll', moduleGuard('nomina'), require('./routes/payroll'));
app.use('/api/delivery', moduleGuard('delivery'), require('./routes/delivery'));
app.use('/api/billing', moduleGuard('suscripcion'), require('./routes/billing'));

app.get('/api/health', (req, res) => res.json({ ok: true, db: db.kind }));

// Servir el frontend (React) compilado, para que backend + frontend
// sean un solo servicio desplegable (una sola URL, sin instalación local)
const clientDist = path.join(__dirname, '../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  // Cualquier ruta que no sea /api/* devuelve index.html para que
  // React Router maneje la navegación del lado del cliente
  app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// Middleware de errores: captura lo que rechacen los handlers async (ver utils/asyncHandler.js)
// Los errores con `status` explícito (4xx/501, ej. "falta configurar Stripe")
// se consideran seguros de mostrar tal cual; los demás (500) muestran un
// mensaje genérico para no filtrar detalles internos.
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  const status = err.status || 500;
  const message = err.status ? (err.publicMessage || err.message) : (err.publicMessage || 'Error interno del servidor');
  res.status(status).json({ error: message });
});

const PORT = process.env.PORT || 4000;
db.ready
  .then(() => {
    server.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT} (base de datos: ${db.kind})`));
  })
  .catch((err) => {
    console.error('No se pudo inicializar la base de datos:', err);
    process.exit(1);
  });
