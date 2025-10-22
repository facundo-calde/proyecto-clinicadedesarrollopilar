// backend/server.js
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

// Forzar preferencia IPv4 (evita líos DNS/TLS con IPv6)
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const express  = require('express');
const cors     = require('cors');
const mongoose = require('mongoose');
const fs       = require('fs');

/* ====== MONGO URI ====== */
const RAW_MONGO_URI = (process.env.MONGODB_URI || process.env.MONGODB || '').trim();
if (!RAW_MONGO_URI) {
  console.error('❌ Falta MONGODB_URI en .env (o MONGODB como fallback)');
  process.exit(1);
}

const app = express();

/* ====== CORS (allow por origin exacto o por host) ====== */
const rawOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

// sumar APP_URL y APP_PUBLIC_URL automáticamente
if (process.env.APP_URL)        rawOrigins.push(process.env.APP_URL.trim());
if (process.env.APP_PUBLIC_URL) rawOrigins.push(process.env.APP_PUBLIC_URL.trim());

// normalizar (sin duplicados)
const allowedOrigins = [...new Set(rawOrigins)];

// hosts permitidos (si cambia http/https o trae puerto)
const allowedHosts = new Set(
  allowedOrigins.map(o => {
    try { return new URL(o).host; } catch { return null; }
  }).filter(Boolean)
);

const originAllowed = (incoming) => {
  try {
    const inc = new URL(incoming);
    // 1) match exacto de origin
    if (allowedOrigins.some(o => {
      try { return new URL(o).origin === inc.origin; } catch { return o === incoming; }
    })) return true;
    // 2) match por host (ignora protocolo y puerto por defecto)
    return allowedHosts.has(inc.host);
  } catch {
    return false;
  }
};

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);                     // same-origin/curl
    if (allowedOrigins.length === 0) return cb(null, true); // sin restricciones
    return originAllowed(origin)
      ? cb(null, true)
      : cb(new Error('CORS bloqueado para ' + origin));
  },
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  credentials: true,
}));
app.options('*', cors());

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

/* ====== RUTAS API ====== */
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

/* ====== STATIC ====== */
const FRONT_DIR_CANDIDATES = [
  path.join(__dirname, '../frontend'),
  path.join(__dirname, '../Frontend'),
];
const FRONT_DIR = FRONT_DIR_CANDIDATES.find(p => fs.existsSync(p)) || FRONT_DIR_CANDIDATES[0];
const INDEX_HTML = path.join(FRONT_DIR, 'html/index.html');

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(FRONT_DIR));

/* ====== Health ====== */
app.get('/health', (_req, res) => res.status(200).send('ok'));
app.get('/salud',  (_req, res) => res.status(200).send('ok'));

/* ====== Home & Fallback (solo GET no-API) ====== */
app.get('/', (_req, res) => res.sendFile(INDEX_HTML));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next();
  res.sendFile(INDEX_HTML);
});

/* ====== 404 API ====== */
app.use((req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Ruta no encontrada' });
  res.status(404).send('Not found');
});

/* ====== Start ====== */
const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';

(async () => {
  try {
    console.log('🔌 Conectando a MongoDB...');
    await mongoose.connect(RAW_MONGO_URI, { serverSelectionTimeoutMS: 8000 });
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

/* ====== Señales ====== */
const shutdown = async (signal) => {
  console.log(`🛑 Señal ${signal}: cerrando...`);
  try { await mongoose.connection.close(); } catch {}
  process.exit(0);
};
process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

/* ====== Errores no capturados ====== */
process.on('unhandledRejection', (r) => console.error('UnhandledRejection:', r));
process.on('uncaughtException',  (e) => { console.error('UncaughtException:', e); process.exit(1); });
