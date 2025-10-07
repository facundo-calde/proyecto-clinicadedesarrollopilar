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
    if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return cb(null, true);
    }
    return cb(new Error('CORS bloqueado para ' + origin));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  credentials: true,
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json({ limit: '10mb' }));

// Estáticos (soportar /frontend y /Frontend)
const FRONT_DIR = path.join(__dirname, '../frontend');
app.use('/frontend', express.static(FRONT_DIR));
app.use('/Frontend', express.static(FRONT_DIR));

// Subidas
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Rutas API
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

// Health
app.get('/health', (_req, res) => res.status(200).send('ok'));
app.get('/salud',  (_req, res) => res.status(200).send('ok'));

// Home -> index.html del front
const INDEX_HTML = path.join(FRONT_DIR, 'html/index.html');
app.get('/', (req, res) => res.sendFile(INDEX_HTML));

// Fallback para rutas no-API
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next();
  res.sendFile(INDEX_HTML);
});

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

console.log('🚀 Iniciando servidor...');
app.listen(PORT, HOST, () => {
  console.log(`✅ API escuchando en http://${HOST}:${PORT}`);
});

mongoose.connect(process.env.MONGODB_URI, {
  serverSelectionTimeoutMS: 5000,
}).then(() => {
  console.log('✅ Conectado a MongoDB Atlas');
}).catch((err) => {
  console.error('❌ Error al conectar a MongoDB:', err.message);
});

app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

process.on('SIGINT', async () => {
  console.log('🛑 Cerrando servidor...');
  await mongoose.connection.close().catch(() => {});
  process.exit(0);
});

