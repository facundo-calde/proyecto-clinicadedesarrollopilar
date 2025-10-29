// backend/models/modulos.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const ItemAsignacion = new Schema({
  usuario: { type: Schema.Types.ObjectId, ref: 'Usuario', required: true },
  monto:   { type: Number, min: 0, default: 0 }
}, { _id: false });

const moduloSchema = new Schema({
  // 🔁 NUEVO: nombre como identificador (alfa-numérico)
  nombre: {
    type: String,
    required: true,
    trim: true,
    unique: true,     // si querés permitir duplicados, sacá esto
    index: true,
    minlength: 1,
    maxlength: 120,
    match: /^[\p{L}\p{N}\s._\-#]+$/u  // letras, números, espacios y _.-#
  },

  // Total que pagan los padres
  valorPadres: { type: Number, min: 0, default: 0 },

  // Asignaciones internas (Fono / Psico)
  profesionales: { type: [ItemAsignacion], default: [] },
  coordinadores: { type: [ItemAsignacion], default: [] },
  pasantes:      { type: [ItemAsignacion], default: [] },

  // Asignaciones externas (otras áreas)
  profesionalesExternos: { type: [ItemAsignacion], default: [] },
  coordinadoresExternos: { type: [ItemAsignacion], default: [] },
  pasantesExternos:      { type: [ItemAsignacion], default: [] },

  // Campos que ya tenías (los dejo igual)
  areasExternas: {
    paciente:   { type: Number, default: 0 },
    porcentaje: { type: Number, default: 0 },
    profesional:{ type: Number, default: 0 }
  },
  habilidadesSociales: {
    paciente:   { type: Number, default: 0 },
    porcentaje: { type: Number, default: 0 },
    profesional:{ type: Number, default: 0 }
  }
}, { timestamps: true });

moduloSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: (_, ret) => { ret.id = ret._id; delete ret._id; }
});

module.exports = mongoose.model('Modulo', moduloSchema);
