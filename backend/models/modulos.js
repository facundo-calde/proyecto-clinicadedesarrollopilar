// backend/models/modulos.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const moduloSchema = new Schema({
  // Número del módulo (único y obligatorio)
  numero: {
    type: Number,
    required: true,
    unique: true,
    index: true,
  },

  // Valor que pagan los padres (valor del módulo)
  valorPadres: {
    type: Number,
    default: 0,
  },

  // Listas de personas vinculadas al módulo
  profesionales: [{
    type: Schema.Types.ObjectId,
    ref: 'Usuario',
  }],

  coordinadores: [{
    type: Schema.Types.ObjectId,
    ref: 'Usuario',
  }],

  // Campos que ya tenías y mantenemos
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
}, { timestamps: true });

// Limpieza de salida JSON
moduloSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: (_, ret) => {
    ret.id = ret._id;
    delete ret._id;
  }
});

module.exports = mongoose.model('Modulo', moduloSchema);
