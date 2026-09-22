const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('./auth');
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

app.use('/api/auth', require('./routes/auth'));
app.use('/api/inventory', require('./routes/inventory'));
app.use('/api/recipes', require('./routes/recipes'));
app.use('/api/menu', require('./routes/menu'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/invoicing', require('./routes/invoicing'));
app.use('/api/accounting', require('./routes/accounting'));
app.use('/api/payroll', require('./routes/payroll'));
app.use('/api/delivery', require('./routes/delivery'));
app.use('/api/billing', require('./routes/billing'));

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
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({ error: err.publicMessage || 'Error interno del servidor' });
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
