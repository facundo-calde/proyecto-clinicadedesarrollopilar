const mongoose = require('mongoose');

const moduloSchema = new mongoose.Schema({
  numero: {
    type: Number,
    required: true  // ✅ Campo obligatorio
  },

  // Valores por área
  areasExternas: {
    paciente: Number,
    porcentaje: Number,
    profesional: Number,
  },
  habilidadesSociales: {
    paciente: Number,
    porcentaje: Number,
    profesional: Number,
  },

  // Valores fonoudiología / psicología
  valoresModulo: {
    paciente: Number,
    direccion: Number,
  },

  // Fijos coordinadores
  coordinadores: {
    horas: Number,
    tema: Number,
  },

  // Fijos profesionales
  profesionales: {
    senior: Number,
    junior: Number,
  }
});

module.exports = mongoose.model('Modulo', moduloSchema);

