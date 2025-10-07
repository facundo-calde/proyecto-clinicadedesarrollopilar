const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') }); // carga .env del backend

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
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

// Archivos estáticos
app.use(express.static(path.join(__dirname, '../frontend')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Rutas API
app.use('/api/pacientes', pacientesRoutes);
app.use('/api/documentos', documentosRoutes);
app.use('/api/modulos', modulosRoutes);
app.use('/api/areas', areasRoutes);
app.use('/api', usuariosRoutes);

// Healthcheck opcional
app.get('/health', (_req, res) => res.json({ ok: true }));

// Conexión a MongoDB Atlas
const MONGODB_URI = process.env.MONGODB_URI;
const PORT = process.env.PORT || 3000;

if (!MONGODB_URI) {
  console.error('❌ Falta MONGODB_URI en .env');
  process.exit(1);
}

mongoose
  .connect(MONGODB_URI, { 
    useNewUrlParser: true, 
    useUnifiedTopology: true 
  })
  .then(() => {
    console.log('✅ Conectado a MongoDB Atlas');
    app.listen(PORT, () => {
      console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('❌ Error al conectar a MongoDB:', err);
    process.exit(1);
  });

// Cierre ordenado
process.on('SIGINT', async () => {
  await mongoose.connection.close();
  process.exit(0);
});
