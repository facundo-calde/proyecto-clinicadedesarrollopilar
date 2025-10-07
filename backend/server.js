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

const corsOptions = {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error('CORS bloqueado para ' + origin));
  },
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  credentials: true,
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json({ limit: '10mb' }));

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

/* ============ STATIC: uploads ============ */
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

/* ============ STATIC: Frontend (elige la carpeta que SÍ tiene html/index.html) ============ */
const baseCandidates = [
  path.join(__dirname, '../frontend'),
  path.join(__dirname, '../Frontend'),
];

let FRONT_DIR = null;
let INDEX_HTML = null;

for (const base of baseCandidates) {
  const idx = path.join(base, 'html/index.html');
  if (fs.existsSync(idx)) {
    FRONT_DIR = base;
    INDEX_HTML = idx;
    break;
  }
}
// fallback: por si movés el index a la raíz
if (!INDEX_HTML) {
  for (const base of baseCandidates) {
    const idx = path.join(base, 'index.html');
    if (fs.existsSync(idx)) {
      FRONT_DIR = base;
      INDEX_HTML = idx;
      break;
    }
  }
}

if (!INDEX_HTML) {
  console.error('❌ No se encontró index.html ni en frontend/html/ ni en Frontend/html/. Verificá la ruta.');
  // igual monto la primera carpeta para poder ver estáticos si existen
  FRONT_DIR = baseCandidates.find(fs.existsSync) || baseCandidates[0];
} else {
  console.log('📂 Sirviendo frontend desde:', FRONT_DIR);
  console.log('🧭 Index:', INDEX_HTML);
}

app.use(express.static(FRONT_DIR));

/* ============ Healthchecks ============ */
app.get('/health', (_req, res) => res.status(200).send('ok'));
app.get('/salud',  (_req, res) => res.status(200).send('ok'));

/* ============ Home y fallback (solo no-API) ============ */
app.get('/', (_req, res) => {
  if (!INDEX_HTML) return res.status(500).send('index.html no encontrado');
  res.sendFile(INDEX_HTML);
});
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next();
  if (!INDEX_HTML) return res.status(500).send('index.html no encontrado');
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
