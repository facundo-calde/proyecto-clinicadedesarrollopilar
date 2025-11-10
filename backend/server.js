// backend/server.js
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const express  = require('express');
const cors     = require('cors');
const mongoose = require('mongoose');
const fs       = require('fs');

const RAW_MONGO_URI = (process.env.MONGODB_URI || process.env.MONGODB || '').trim();
if (!RAW_MONGO_URI) {
  console.error('❌ Falta MONGODB_URI en .env (o MONGODB como fallback)');
  process.exit(1);
}

const app = express();

/* ====== CORS ====== */
app.use(cors({
  origin: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  credentials: true,
}));
app.options('*', cors());

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

/* ====== RUTAS API ====== */
app.use('/api/pacientes',  require('./routes/pacienteroutes'));
app.use('/api/documentos', require('./routes/documentosroutes'));
app.use('/api/modulos',    require('./routes/modulosroutes'));
app.use('/api/areas',      require('./routes/areasroutes'));
app.use('/api',            require('./routes/usuariosRoutes'));
app.use("/api/estado-de-cuenta", require("./routes/estadocuentaroutes"));

/* ====== STATIC ====== */
const FRONT_DIR_CANDIDATES = [
  path.join(__dirname, '../frontend'),
  path.join(__dirname, '../Frontend'),
];
const FRONT_DIR = FRONT_DIR_CANDIDATES.find(p => fs.existsSync(p)) || FRONT_DIR_CANDIDATES[0];
const INDEX_HTML = path.join(FRONT_DIR, 'html/index.html');

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(FRONT_DIR));

app.get('/health', (_req, res) => res.status(200).send('ok'));
app.get('/salud',  (_req, res) => res.status(200).send('ok'));

app.get('/', (_req, res) => res.sendFile(INDEX_HTML));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next();
  res.sendFile(INDEX_HTML);
});

app.use((req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Ruta no encontrada' });
  res.status(404).send('Not found');
});

/* ====== START ====== */
const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';

(async () => {
  try {
    console.log('🔌 Conectando a MongoDB...');
    await mongoose.connect(RAW_MONGO_URI, { serverSelectionTimeoutMS: 8000 });
    console.log('✅ Conectado a MongoDB');

    /** ✅ MOVEMOS EL CRON ACÁ — LUEGO de conectar MongoDB */
    try {
      const { schedule } = require("./jobs/generarCargos");
      if (process.env.ENABLE_CRON !== "false") {
        schedule();
        console.log("⏰ Cron de cargos habilitado");
      } else {
        console.log("⏸️ Cron deshabilitado por config");
      }
    } catch (err) {
      console.warn("⚠️ Error cargando cron:", err.message);
    }

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

process.on('unhandledRejection', (r) => console.error('UnhandledRejection:', r));
process.on('uncaughtException',  (e) => { console.error('UncaughtException:', e); process.exit(1); });
