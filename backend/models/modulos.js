// backend/models/modulos.js
const mongoose = require('mongoose');

const { Schema } = mongoose;

const AsignacionSchema = new Schema({
  area: {
    type: String,
    enum: ['Fonoaudiología', 'Psicología'],
    required: true,
    trim: true,
  },
  rol: {
    type: String,
    enum: ['coordinador', 'profesional'],
    required: true,
    trim: true,
  },
  // Referencia al usuario (coordinador/profesional). Si todavía no tenés el modelo Usuario,
  // podés quitar el "ref" o dejarlo en String. Lo ideal es ObjectId + ref.
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'Usuario',
    required: true,
  },
  nombre: {
    type: String,
    trim: true,
    default: '',
  },
  monto: {
    type: Number,
    min: 0,
    default: 0,
  },
}, { _id: false });

const moduloSchema = new Schema({
  numero: {
    type: Number,
    required: true,
    index: true,
    unique: true, // si no querés que se repita el mismo número de módulo
  },

  // NUEVO: cuánto paga el paciente (ARS)
  pagaPaciente: {
    type: Number,
    min: 0,
    default: 0,
  },

  // NUEVO: asignaciones por persona (coordinadores/profesionales) con monto por módulo
  asignaciones: {
    type: [AsignacionSchema],
    default: [],
  },

  // Se mantiene: ÁREAS EXTERNAS
  areasExternas: {
    paciente:   { type: Number, min: 0, default: 0 },
    porcentaje: { type: Number, min: 0, default: 0 },
    profesional:{ type: Number, min: 0, default: 0 },
  },

  /* -------------------------
     Campos "legacy" (opcionales)
     Los dejo para que no rompa nada que todavía los use.
     Podés eliminarlos cuando dejes de usarlos.
  --------------------------*/
  habilidadesSociales: {
    paciente:   { type: Number, min: 0, default: 0 },
    porcentaje: { type: Number, min: 0, default: 0 },
    profesional:{ type: Number, min: 0, default: 0 },
  },

  valoresModulo: {
    paciente:  { type: Number, min: 0, default: 0 },
    direccion: { type: Number, min: 0, default: 0 },
  },

  coordinadores: {
    horas: { type: Number, min: 0, default: 0 },
    tema:  { type: Number, min: 0, default: 0 },
  },

  profesionales: {
    senior: { type: Number, min: 0, default: 0 },
    junior: { type: Number, min: 0, default: 0 },
  },

  // Extras opcionales por si los necesitás
  notas:      { type: String, trim: true },
  estado:     { type: String, trim: true },
  fecha:      { type: Date },
  createdBy:  { type: Schema.Types.ObjectId, ref: 'Usuario' },
  updatedBy:  { type: Schema.Types.ObjectId, ref: 'Usuario' },
}, {
  timestamps: true,
});

module.exports = mongoose.model('Modulo', moduloSchema);


