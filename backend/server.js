// server.js

require('dotenv').config(); // 🔹 Carga variables del archivo .env

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const path = require('path');
const multer = require('multer');

// Rutas
const pacientesRoutes = require('./routes/pacienteroutes');
const modulosRoutes = require('./routes/modulosroutes');
const areasRoutes = require('./routes/areasroutes');
const usuariosRoutes = require('./routes/usuariosRoutes');
const documentosRoutes = require('./routes/documentosroutes');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// 🔹 Archivos estáticos frontend
app.use(express.static(path.join(__dirname, '../frontend')));

// 🔹 Archivos subidos (para documentos, imágenes, etc.)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Rutas API
app.use('/api/pacientes', pacientesRoutes);
app.use('/api/documentos', documentosRoutes);
app.use('/api/modulos', modulosRoutes);
app.use('/api/areas', areasRoutes);
app.use('/api', usuariosRoutes);

// Conexión a MongoDB Atlas
mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('✅ Conectado a MongoDB Atlas');
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
    });
  })
  .catch(err => {
    console.error('❌ Error al conectar a MongoDB:', err.message);
  });

