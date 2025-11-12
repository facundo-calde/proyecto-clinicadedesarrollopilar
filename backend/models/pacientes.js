const mongoose = require('mongoose');

const emailRule = [/.+@.+\..+/, 'El email debe ser válido'];

/* =========================
 * Subdocumentos
 * ========================= */
const responsableSchema = new mongoose.Schema({
  relacion: { type: String, enum: ['padre', 'madre', 'tutor'], required: true },
  nombre:   { type: String, required: true, trim: true },
  whatsapp: {
    type: String,
    required: true,
    match: [/^\d{10,15}$/, 'El WhatsApp debe tener entre 10 y 15 dígitos'],
  },
  email:     { type: String, trim: true, lowercase: true, match: emailRule },
  documento: { type: String, trim: true } // opcional (DNI/CUIT)
}, { _id: false });

const estadoHistorialSchema = new mongoose.Schema({
  estadoAnterior: { type: String, enum: ['Alta', 'Baja', 'En espera'] },
  estadoNuevo:    { type: String, enum: ['Alta', 'Baja', 'En espera'] },
  estado:         { type: String, enum: ['Alta', 'Baja', 'En espera'] }, // snapshot
  fecha: { type: Date, default: Date.now },
  descripcion: { type: String, trim: true },
  cambiadoPor: {
    usuarioId: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
    nombre: String,
    usuario: String
  }
}, { _id: false });

/* --- Documentos personales (metadata R2) --- */
const documentoPersonalSchema = new mongoose.Schema({
  fecha:          { type: String, required: true }, // o Date si preferís
  tipo:           { type: String, required: true, trim: true },
  observaciones:  { type: String, trim: true },
  archivoKey:     { type: String, required: true, trim: true },
  archivoURL:     { type: String, required: true, trim: true },
  creadoEn:       { type: Date, default: Date.now },
  actualizadoEn:  { type: Date }
}, { _id: true });

/* --- Diagnósticos / Informes (metadata R2) --- */
const diagnosticoSchema = new mongoose.Schema({
  fecha:          { type: String, required: true }, // o Date si preferís
  area:           { type: String, required: true, trim: true },
  observaciones:  { type: String, trim: true },
  archivoKey:     { type: String, required: true, trim: true },
  archivoURL:     { type: String, required: true, trim: true },
  creadoEn:       { type: Date, default: Date.now },
  actualizadoEn:  { type: Date }
}, { _id: true });

/* =========================
 * Esquema principal
 * ========================= */
const pacienteSchema = new mongoose.Schema({
  nombre: { type: String, trim: true },

  dni: {
    type: String,
    required: true,
    unique: true,
    match: [/^\d{7,8}$/, 'El DNI debe tener entre 7 y 8 dígitos numéricos'],
  },

  fechaNacimiento: { type: String, required: true }, // o Date

  responsables: {
    type: [responsableSchema],
    default: [],
    validate: [{
      validator: function (arr) {
        return Array.isArray(arr) && arr.length >= 1 && arr.length <= 3;
      },
      message: 'Debe tener entre 1 y 3 responsables.',
    }]
  },

  colegio: String,
  colegioMail: { type: String, trim: true, lowercase: true, match: emailRule },

  // >>> NUEVOS CAMPOS
  colegioSecundarioMail: { type: String, trim: true, lowercase: true, match: emailRule },
  colegioTelefono: { type: String, trim: true, match: [/^\d{6,15}$/, 'El teléfono del colegio debe tener entre 6 y 15 dígitos'] },
  // <<<

  curso: String,

  condicionDePago: {
  type: String,
  enum: [
    'Obra Social',
    'Particular',
    'Obra Social + Particular',
    'Obra Social + Particular (les pagan a ellos)' // ← nuevo
  ],
  default: 'Particular'
},

  estado: { type: String, enum: ['Alta', 'Baja', 'En espera'], default: 'En espera' },

  estadoHistorial: { type: [estadoHistorialSchema], default: [] },

  // Obra social
  prestador: String,
  credencial: String,
  tipo: String,

  // Otros
  areas: { type: [String], default: [] },
  planPaciente: String,
  fechaBaja: String,
  motivoBaja: String,

  // Metadata de documentos y diagnósticos con archivoKey/archivoURL
  documentosPersonales: { type: [documentoPersonalSchema], default: [] },
  diagnosticos:         { type: [diagnosticoSchema],       default: [] },

  // Módulos asignados (normales)
  modulosAsignados: {
    type: [{
      moduloId: { type: mongoose.Schema.Types.ObjectId, ref: 'Modulo' },
      nombre:   { type: String }, // por compatibilidad con datos viejos

      // 👉 opcionales para facilitar filtros/reportes (el job sigue usando profesionales[0].areaId)
      areaId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Area' },
      area:     { type: String },

      cantidad: { type: Number, min: 0.25, max: 2, default: 1 },
      profesionales: [{
        profesionalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
        areaId:        { type: mongoose.Schema.Types.ObjectId, ref: 'Area' },
        area:          { type: String },
        nombre:        { type: String }
      }],

      // vigencia opcional (usado por tu job)
      desdeMes: { type: String }, // "YYYY-MM"
      hastaMes: { type: String }  // "YYYY-MM" o null
    }],
    default: []
  },

  // Módulos de EVENTO ESPECIAL asignados (compatibles con tu front)
  modulosEspecialesAsignados: {
    type: [{
      moduloId: { type: mongoose.Schema.Types.ObjectId, ref: 'Modulo' }, // o colección separada si la tuvieras
      nombre:   { type: String },   // fallback si no hay ref
      cantidad: { type: Number, default: 1, min: 1, max: 1 }, // en EE suele ser 1
      profesionales: [{
        profesionalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
        areaId:        { type: mongoose.Schema.Types.ObjectId, ref: 'Area' },
        area:          { type: String },
        nombre:        { type: String }
      }]
    }],
    default: []
  },

  // quién lo creó
  creadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' }

}, { timestamps: true });

/* =========================
 * Índices
 * ========================= */
pacienteSchema.index({ dni: 1 }, { unique: true });

/* =========================
 * Hooks
 * ========================= */
pacienteSchema.pre('save', function(next) {
  if (this.isNew && this.estado && (!Array.isArray(this.estadoHistorial) || this.estadoHistorial.length === 0)) {
    this.estadoHistorial.push({
      estado: this.estado,
      estadoNuevo: this.estado,
      descripcion: 'Estado inicial',
      cambiadoPor: this._actorId ? { usuarioId: this._actorId } : undefined
    });
  }
  next();
});

module.exports = mongoose.model('Paciente', pacienteSchema);



