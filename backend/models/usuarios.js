const mongoose = require('mongoose');

const documentoSchema = new mongoose.Schema({
  tipo: { type: String, required: true }, // Ej: 'matricula', 'seguro', 'dni'
  nombre: { type: String, required: true }, // Nombre del archivo original
  url: { type: String, required: true }, // Ruta o enlace al archivo
  fechaSubida: { type: Date, default: Date.now }
});

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

  // 🔹 Nuevo campo específico para profesionales
  seguroMalaPraxis: String, // Ej: número de póliza o nombre de la compañía

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
  fechaAlta: { type: Date, default: Date.now },

  documentos: [documentoSchema]
});


module.exports = mongoose.model('Usuario', usuarioSchema);

