// server.js

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const path = require('path');

// --- Validación mínima de env ---
if (!process.env.MONGODB_URI) {
  console.error('❌ Falta MONGODB_URI en .env');
  process.exit(1);
}

const app = express();

// --- CORS (desde .env) ---
/**
 * CORS_ORIGIN puede ser:
 * - una sola URL, ej: https://app.clinicadedesarrollopilar.com.ar
 * - varias URLs separadas por coma
 * Si no está, permite todo (útil para pruebas; en prod conviene setearlo).
 */
const allowedOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const corsOptions = {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // Postman/cURL
    if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return cb(null, true);
    }
    return cb(new Error('CORS bloqueado para ' + origin));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  credentials: true,
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // preflight
app.use(express.json({ limit: '10mb' }));

// --- Archivos estáticos frontend ---
// En tu repo la carpeta es "Frontend" (mayúscula)
app.use(express.static(path.join(__dirname, '../frontend')));

// Archivos subidos (documentos, imágenes, etc.)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// --- Rutas API ---
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

// --- Healthcheck ---
app.get('/health', (_req, res) => res.status(200).send('ok'));
app.get('/salud',  (_req, res) => res.status(200).send('ok'));

// --- Fallback para SPA (opcional):
// si tu Frontend es una SPA y querés que cualquier ruta no-API
// devuelva index.html, descomentá esto:
// app.get('*', (req, res, next) => {
//   if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next();
//   res.sendFile(path.join(__dirname, '../Frontend/index.html'));
// });

// --- Arranque del servidor ---
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

console.log('🚀 Iniciando servidor...');
app.listen(PORT, HOST, () => {
  console.log(`✅ API escuchando en http://${HOST}:${PORT}`);
});

// --- Conexión a MongoDB (no bloqueante) ---
mongoose.connect(process.env.MONGODB_URI, {
  serverSelectionTimeoutMS: 5000,
}).then(() => {
  console.log('✅ Conectado a MongoDB Atlas');
}).catch((err) => {
  console.error('❌ Error al conectar a MongoDB:', err.message);
  console.error('ℹ️  Revisá whitelist de IP en Atlas y la URI.');
});

// --- 404 ---
app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

// --- Apagado limpio ---
process.on('SIGINT', async () => {
  console.log('🛑 Cerrando servidor...');
  await mongoose.connection.close().catch(() => {});
  process.exit(0);
});

