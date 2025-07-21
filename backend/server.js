// backend/server.js

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const pacientesRoutes = require('./routes/pacienteroutes');
const modulosRoutes = require('./routes/modulosroutes');

const app = express();
const documentosRoutes = require('./routes/documentosroutes');


// Middleware
app.use(cors());
app.use(express.json());


// Rutas
app.use('/api/pacientes', pacientesRoutes);
app.use('/api/documentos', documentosRoutes);
app.use('/api/modulos', modulosRoutes);

// Conexión a la base de datos MongoDB
mongoose.connect('mongodb://127.0.0.1:27017/clinica')
  .then(() => {
    console.log('✅ Conectado a la base de datos "clinica"');
    // Arrancar el servidor solo si se conecta bien
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log(`Servidor corriendo en puerto ${PORT}`);
    });
  })
  .catch(err => {
    console.error('❌ Error al conectar a MongoDB:', err);
  });
