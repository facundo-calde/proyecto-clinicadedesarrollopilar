const mongoose = require('mongoose');

const pacienteSchema = new mongoose.Schema({
  nombre: String,
  dni: {
    type: String,
    required: true,
    match: [/^\d{7,8}$/, 'El DNI debe tener entre 7 y 8 dígitos numéricos']
  },
  fechaNacimiento: {
    type: String,
    required: true
  },

  // 🔹 Tutor
  tutor: {
    nombre: {
      type: String,
      required: true
    },
    whatsapp: {
      type: String,
      required: true,
      match: [/^\d{10,15}$/, 'El número de WhatsApp debe tener entre 10 y 15 dígitos']
    }
  },

  // 🔹 Padre o Madre (campo unificado)
  madrePadre: String,
  whatsappMadrePadre: {
    type: String,
    match: [/^\d{10,15}$/, 'El número de WhatsApp debe tener entre 10 y 15 dígitos']
  },

  mail: {
    type: String,
    required: true,
    match: [/.+@.+\..+/, 'El email debe ser válido']
  },
  colegio: String,
  curso: String,
  abonado: String,
  estado: String, // "Alta", "Baja", "En espera"

  // 🔹 Campos adicionales para Obra Social
  prestador: String,
  credencial: String,
  tipo: String,

  areas: [String],
  planPaciente: String,
  fechaBaja: String,
  motivoBaja: String,

  // 🔹 Documentos personales
  documentosPersonales: [{
    fecha: String,
    tipo: String,
    observaciones: String,
    archivos: [String]
  }],

  // 🔹 Módulos asignados
modulosAsignados: [{
  moduloId: { type: mongoose.Schema.Types.ObjectId, ref: 'Modulo' }, // referencia al módulo
  nombre: String,   // redundancia para mostrar rápido sin populate
  cantidad: { type: Number, min: 0.25, max: 2 },

  // 🔹 Profesionales asignados a este módulo
  profesionales: [{
    profesionalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' }, // referencia al profesional (si tenés colección Usuarios)
    nombre: String,  // guardás el nombre también para no hacer populate siempre
    area: String     // opcional: podés guardar el área en la que trabaja
  }]
}]

}, { timestamps: true });

module.exports = mongoose.model('Paciente', pacienteSchema);




