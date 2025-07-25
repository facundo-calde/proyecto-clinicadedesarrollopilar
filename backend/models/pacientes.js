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
  mail: {
    type: String,
    required: true,
    match: [/.+@.+\..+/, 'El email debe ser válido']
  },
  colegio: String,
  curso: String,
  abonado: String,
  estado: String, // "Alta", "Baja", "En espera"
  areas: [String],
  planPaciente: String,
  fechaBaja: String,
  motivoBaja: String,
  documentosPersonales: [{
    fecha: String,
    tipo: String,
    observaciones: String,
    archivos: [String]
  }]
}, { timestamps: true });

module.exports = mongoose.model('Paciente', pacienteSchema);

