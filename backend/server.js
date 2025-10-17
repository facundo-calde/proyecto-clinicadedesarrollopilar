// backend/server.js
require('dotenv').config();

const express  = require('express');
const cors     = require('cors');
const mongoose = require('mongoose');
const path     = require('path');
const fs       = require('fs');

if (!process.env.MONGODB_URI) {
  console.error('❌ Falta MONGODB_URI en .env');
  process.exit(1);
}

const app = express();

/* ============ CORS ============ */
const allowedOrigins = (process.env.CORS_ORIGIN || '')
  .split(',').map(s => s.trim()).filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error('CORS bloqueado para ' + origin));
  },
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  credentials: true,
}));
app.options('*', cors());

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true })); // <- agregado

/* ============ RUTAS API ============ */
const pacientesRoutes  = require('./routes/pacienteroutes');
const modulosRoutes    = require('./routes/modulosroutes');
const areasRoutes      = require('./routes/areasroutes');
const usuariosRoutes   = require('./routes/usuariosRoutes');
const documentosRoutes = require('./routes/documentosroutes');

app.use('/api/pacientes',  pacientesRoutes);
app.use('/api/documentos', documentosRoutes);
app.use('/api/modulos',    modulosRoutes);
app.use('/api/areas',      areasRoutes);
app.use('/api',            usuariosRoutes);

/* ============ STATIC ============ */
const FRONT_DIR_CANDIDATES = [
  path.join(__dirname, '../frontend'),
  path.join(__dirname, '../Frontend'),
];
const FRONT_DIR = FRONT_DIR_CANDIDATES.find(p => fs.existsSync(p)) || FRONT_DIR_CANDIDATES[0];
const INDEX_HTML = path.join(FRONT_DIR, 'html/index.html');

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(FRONT_DIR));

/* ============ Health ============ */
app.get('/health', (_req, res) => res.status(200).send('ok'));
app.get('/salud',  (_req, res) => res.status(200).send('ok'));

/* ============ Home & Fallback (no-API) ============ */
app.get('/', (_req, res) => res.sendFile(INDEX_HTML));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next();
  res.sendFile(INDEX_HTML);
});

/* ============ 404 API ============ */
app.use((req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Ruta no encontrada' });
  res.status(404).send('Not found');
});

/* ============ Start ============ */
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

(async () => {
  try {
    console.log('🔌 Conectando a MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
    console.log('✅ Conectado a MongoDB');
    app.listen(PORT, HOST, () => {
      console.log(`✅ Server escuchando en http://${HOST}:${PORT}`);
      console.log('📂 FRONT_DIR:', FRONT_DIR);
      console.log('🧭 INDEX:', INDEX_HTML);
    });
  } catch (err) {
    console.error('❌ Error al conectar a MongoDB:', err.message);
    process.exit(1);
  }
})();

/* ============ Señales ============ */
process.on('SIGINT', async () => {
  console.log('🛑 Cerrando servidor...');
  try { await mongoose.connection.close(); } catch {}
  process.exit(0);
});
