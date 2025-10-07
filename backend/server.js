// server.js
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const path = require('path');

if (!process.env.MONGODB_URI) {
  console.error('❌ Falta MONGODB_URI en .env');
  process.exit(1);
}

const app = express();

const allowedOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const corsOptions = {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error('CORS bloqueado para ' + origin));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  credentials: true,
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json({ limit: '10mb' }));

// ====== ESTÁTICOS FRONT ======
const FRONT_ROOT = path.join(__dirname, '../frontend');
const FRONT_HTML = path.join(FRONT_ROOT, 'html');

// /  -> sirve frontend/html con index.html por defecto
app.use('/', express.static(FRONT_HTML, { index: 'index.html' }));
// assets referenciados como /frontend/... o /Frontend/...
app.use('/frontend', express.static(FRONT_ROOT));
app.use('/Frontend', express.static(FRONT_ROOT));

// ====== SUBIDAS ======
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ====== API ======
const pacientesRoutes  = require('./routes/pacienteroutes');
const modulosRoutes    = require('./routes/modulosroutes');
const areasRoutes      = require('./routes/areasroutes');
const usuariosRoutes   = require('./routes/usuariosRoutes');
const documentosRoutes = require('./routes/documentosroutes');

app.use('/api/pacientes',   pacientesRoutes);
app.use('/api/documentos',  documentosRoutes);
app.use('/api/modulos',     modulosRoutes);
app.use('/api/areas',       areasRoutes);
app.use('/api',             usuariosRoutes);

// ====== HEALTH ======
app.get('/health', (_req, res) => res.status(200).send('ok'));
app.get('/salud',  (_req, res) => res.status(200).send('ok'));

// ====== 404 ======
app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

// ====== ARRANQUE ======
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

console.log('🚀 Iniciando servidor...');
app.listen(PORT, HOST, () => {
  console.log(`✅ API escuchando en http://${HOST}:${PORT}`);
});

// ====== MONGO ======
mongoose.connect(process.env.MONGODB_URI, {
  serverSelectionTimeoutMS: 5000,
}).then(() => {
  console.log('✅ Conectado a MongoDB Atlas');
}).catch((err) => {
  console.error('❌ Error al conectar a MongoDB:', err.message);
});

process.on('SIGINT', async () => {
  console.log('🛑 Cerrando servidor...');
  await mongoose.connection.close().catch(() => {});
  process.exit(0);
});


