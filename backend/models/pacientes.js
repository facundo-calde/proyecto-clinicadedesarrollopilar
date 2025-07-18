const mongoose = require('mongoose');

const documentoSchema = new mongoose.Schema({
  fecha: String,
  area: String,
  observaciones: String,
  archivos: [String]
}, { _id: false });

const pacienteSchema = new mongoose.Schema({
  nombre: String,
  dni: {
    type: String,
    required: true,
    match: [/^\d{7,8}$/, 'El DNI debe tener entre 7 y 8 dígitos numéricos']
  },
  fechaNacimiento: { type: String, required: true },
  madre: { type: String, required: true },
  padre: { type: String, required: true },
  whatsappMadre: { type: String, required: true },
  whatsappPadre: { type: String, required: true },
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

