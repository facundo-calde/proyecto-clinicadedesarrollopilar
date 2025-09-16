const mongoose = require('mongoose');

const responsableSchema = new mongoose.Schema({
  relacion: { type: String, enum: ['padre', 'madre', 'tutor'], required: true },
  nombre:   { type: String, required: true, trim: true },
  whatsapp: {
    type: String,
    required: true,
    match: [/^\d{10,15}$/, 'El WhatsApp debe tener entre 10 y 15 dígitos'],
  },
}, { _id: false });

const pacienteSchema = new mongoose.Schema({
  nombre: { type: String, trim: true },
  dni: {
    type: String,
    required: true,
    unique: true,
    match: [/^\d{7,8}$/, 'El DNI debe tener entre 7 y 8 dígitos numéricos'],
  },
  fechaNacimiento: { type: String, required: true },

  // 🔹 Responsables (permite relaciones repetidas)
  responsables: {
    type: [responsableSchema],
    validate: [
      {
        validator: function(arr) {
          return Array.isArray(arr) && arr.length >= 1 && arr.length <= 3;
        },
        message: 'Debe tener entre 1 y 3 responsables.',
      }
      // ❌ Se elimina el validador que prohibía duplicados de "relacion"
    ]
  },

  // Email y otros datos
  mail: {
    type: String,
    required: true,
    match: [/.+@.+\..+/, 'El email debe ser válido'],
    trim: true,
    lowercase: true,
  },
  colegio: String,
  curso: String,
  condicionDePago: String,     // ojo: tu frontend usa "abonado". Unificalo.
  estado: String,              // "Alta", "Baja", "En espera"

  // Obra social
  prestador: String,
  credencial: String,
  tipo: String,

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

  modulosAsignados: [{
    moduloId: { type: mongoose.Schema.Types.ObjectId, ref: 'Modulo' },
    nombre: String,
    cantidad: { type: Number, min: 0.25, max: 2 },
    profesionales: [{
      profesionalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
      nombre: String,
      area: String
    }]
  }],

  /* ⚠️ Legacy para compat. Quitalos cuando migres todo. */
  tutor: {
    nombre: String,
    whatsapp: { type: String, match: [/^\d{10,15}$/] }
  },
  madrePadre: String,
  whatsappMadrePadre: { type: String, match: [/^\d{10,15}$/] },

}, { timestamps: true });

/* 🔧 Hook opcional de compatibilidad:
   si hay responsables y alguno es "tutor", completa el campo legacy `tutor` con el primero. */
pacienteSchema.pre('validate', function(next) {
  if (Array.isArray(this.responsables)) {
    const t = this.responsables.find(r => r.relacion === 'tutor');
    if (t) this.tutor = { nombre: t.nombre, whatsapp: t.whatsapp };
  }
  next();
});

module.exports = mongoose.model('Paciente', pacienteSchema);




