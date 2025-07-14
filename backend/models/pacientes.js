const mongoose = require('mongoose');

const pacienteSchema = new mongoose.Schema({
  nombre: String,
  dni: String,
  fechaNacimiento: String, // o Date si lo parseás
  madre: String,
  padre: String,
  whatsappMadre: String,
  whatsappPadre: String,
  mail: String,
  colegio: String,
  curso: String,
  abonado: String,
  estado: String,
  areas: [String],
  planPaciente: String
}, { timestamps: true });


module.exports = mongoose.model('Paciente', pacienteSchema);