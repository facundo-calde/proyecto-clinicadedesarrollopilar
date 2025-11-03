// models/moduloEventoEspecial.js
const mongoose = require('mongoose');

const NOMBRE_RE = /^[\p{L}\p{N}\s._\-#]+$/u; // igual al front
const MontoMin = 0;

const CoordinadorExternoSchema = new mongoose.Schema({
  usuario: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Usuario',
    required: [true, 'Falta el ID de usuario']
  },
  monto: {
    type: Number,
    min: [MontoMin, 'El monto no puede ser negativo'],
    default: 0
  }
}, { _id: false });

const ModuloEventoEspecialSchema = new mongoose.Schema({
  nombre: {
    type: String,
    required: [true, 'El nombre es obligatorio'],
    trim: true,
    maxlength: [120, 'Máximo 120 caracteres para el nombre'],
    validate: {
      validator: v => NOMBRE_RE.test(v),
      message: 'El nombre solo admite letras, números, espacios y _.-#'
    }
  },
  // Valor que pagan los padres (puede ser 0)
  valorPadres: {
    type: Number,
    min: [0, 'El valor de padres no puede ser negativo'],
    default: 0
  },

  // Solo coordinadores/directoras EXTERNOS
  coordinadoresExternos: {
    type: [CoordinadorExternoSchema],
    default: []
  },

  // Por si querés manejar baja lógica
  activo: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// --- Índice único case-insensitive por nombre ---
ModuloEventoEspecialSchema.index(
  { nombre: 1 },
  { unique: true, collation: { locale: 'es', strength: 1 } }
);

// --- Virtual: total asignado a coordinadores externos ---
ModuloEventoEspecialSchema.virtual('totalCoordinadoresExternos').get(function () {
  return (this.coordinadoresExternos || []).reduce((acc, it) => acc + (Number(it.monto) || 0), 0);
});

// Opcional: normalizar espacios
ModuloEventoEspecialSchema.pre('save', function (next) {
  if (this.nombre) this.nombre = this.nombre.replace(/\s+/g, ' ').trim();
  next();
});

module.exports = mongoose.model('ModuloEventoEspecial', ModuloEventoEspecialSchema);
