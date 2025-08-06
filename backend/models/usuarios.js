const mongoose = require('mongoose');

const usuarioSchema = new mongoose.Schema({
  nombreApellido: String,
  fechaNacimiento: Date,
  domicilio: String,
  dni: String,
  matricula: String,
  jurisdiccion: String,
  whatsapp: String,
  mail: String,
  salarioAcuerdo: String,
  fijoAcuerdo: String,
  banco: String,
  cbu: String,
  alias: String,
  tipoCuenta: String,
  areas: [String],
  rol: String,
  usuario: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Debe ser un correo electrónico válido']
  },
  contrasena: String,
  activo: { type: Boolean, default: true },
  fechaAlta: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Usuario', usuarioSchema);

