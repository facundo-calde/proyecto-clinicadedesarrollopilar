// server.js

// 🔹 Cargar variables de entorno (.env debe estar en /backend)
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const path = require('path');

// 🔹 Validación mínima de env
if (!process.env.MONGODB_URI) {
  console.error('❌ Falta MONGODB_URI en .env');
  process.exit(1);
}

const app = express();

// ===== Middleware base =====
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ===== Archivos estáticos =====
// OJO: en tu árbol la carpeta es "Frontend" (mayúscula)
app.use(express.static(path.join(__dirname, '../Frontend')));

// Archivos subidos (para documentos, imágenes, etc.)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ===== Rutas API =====
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

// ===== Healthcheck =====
app.get('/health', (_req, res) => res.status(200).send('ok'));
app.get('/salud',  (_req, res) => res.status(200).send('ok')); // alias en español

// ===== Arranque del servidor =====
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0'; // necesario para acceder desde fuera del VPS

console.log('🚀 Iniciando servidor...');
app.listen(PORT, HOST, () => {
  console.log(`✅ API escuchando en http://${HOST}:${PORT}`);
});

// ===== Conexión a MongoDB (no bloqueante) =====
// Evita cuelgues si Atlas no whitelistea la IP
mongoose.connect(process.env.MONGODB_URI, {
  serverSelectionTimeoutMS: 5000, // 5s y loguea error si no conecta
})
.then(() => {
  console.log('✅ Conectado a MongoDB Atlas');
})
.catch((err) => {
  console.error('❌ Error al conectar a MongoDB:', err.message);
  console.error('ℹ️  Verificá el whitelist de IP en Atlas y las credenciales de la URI.');
});

// ===== Manejo básico de 404 =====
app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

// ===== Apagado limpio =====
process.on('SIGINT', async () => {
  console.log('🛑 Cerrando servidor...');
  await mongoose.connection.close().catch(() => {});
  process.exit(0);
});
