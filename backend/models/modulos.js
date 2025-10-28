const mongoose = require('mongoose');
const { Schema } = mongoose;

const ItemAsignacion = new Schema({
  usuario: { type: Schema.Types.ObjectId, ref: 'Usuario', required: true },
  monto:   { type: Number, default: 0 }
}, { _id: false });

const moduloSchema = new Schema({
  numero: { type: Number, required: true, unique: true, index: true },

  // Total abonado por padres
  valorPadres: { type: Number, default: 0 },

  // Asignaciones por persona
  profesionales: [ItemAsignacion],
  coordinadores: [ItemAsignacion],
  pasantes:      [ItemAsignacion],

  // Campos existentes que mantenés
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

moduloSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: (_, ret) => { ret.id = ret._id; delete ret._id; }
});

module.exports = mongoose.model('Modulo', moduloSchema);

