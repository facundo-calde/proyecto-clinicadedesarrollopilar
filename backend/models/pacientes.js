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
  email: { type: String, trim: true, lowercase: true, match: emailRule },
  documento: { type: String, trim: true } // ✅ nuevo campo opcional
}, { _id: false });

const estadoHistorialSchema = new mongoose.Schema({
  estadoAnterior: { type: String, enum: ['Alta', 'Baja', 'En espera'] },
  estadoNuevo:    { type: String, enum: ['Alta', 'Baja', 'En espera'] },
  estado:         { type: String, enum: ['Alta', 'Baja', 'En espera'] }, // snapshot simple
  fecha: { type: Date, default: Date.now },
  descripcion: { type: String, trim: true },
  cambiadoPor: {
    usuarioId: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
    nombre: String,
    usuario: String
  }
}, { _id: false });

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

  fechaNacimiento: { type: String, required: true },

  responsables: {
    type: [responsableSchema],
    validate: [{
      validator: function (arr) {
        return Array.isArray(arr) && arr.length >= 1 && arr.length <= 3;
      },
      message: 'Debe tener entre 1 y 3 responsables.',
    }]
  },

  colegio: String,
  colegioMail: { type: String, trim: true, lowercase: true, match: emailRule },
  curso: String,

  condicionDePago: {
    type: String,
    enum: ['Obra Social', 'Particular', 'Obra Social + Particular'],
    default: 'Particular'
  },
  estado: { type: String, enum: ['Alta', 'Baja', 'En espera'], default: 'En espera' },

  estadoHistorial: { type: [estadoHistorialSchema], default: [] },

  // Obra social
  prestador: String,
  credencial: String,
  tipo: String,

  // Otros
  areas: [String],
  planPaciente: String,
  fechaBaja: String,
  motivoBaja: String,

  documentosPersonales: [{
    fecha: String,
    tipo: String,
    observaciones: String,
    archivos: [String]
  }],

  // Módulos asignados
  modulosAsignados: [{
    moduloId: { type: mongoose.Schema.Types.ObjectId, ref: 'Modulo' },
    nombre: String,
    cantidad: { type: Number, min: 0.25, max: 2 },
    profesionales: [{
      profesionalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
      areaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Area' },
      area: String,
      nombre: String
    }]
  }],

  // quién lo creó
  creadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' }

}, { timestamps: true });

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








