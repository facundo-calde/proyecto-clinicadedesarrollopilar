const mongoose = require('mongoose');

const documentoSchema = new mongoose.Schema({
  tipo: { type: String, required: true },
  nombre: { type: String, required: true },
  url: { type: String, required: true },
  fechaSubida: { type: Date, default: Date.now }
});

// Roles (incluye "Directoras")
const ROLES = Object.freeze([
  'Administrador',
  'Directoras',
  'Coordinador de área',
  'Profesional',
  'Administrativo',
  'Recepcionista',
]);

// Niveles de profesional
const NIVELES_PRO = Object.freeze(['Junior', 'Senior']);

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

  rol: { type: String, enum: ROLES },

  // Solo para profesionales
  seguroMalaPraxis: String,
  nivelProfesional: { type: String, enum: NIVELES_PRO }, // Junior / Senior (requerido si rol=Profesional)

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

// Validación condicional: si es Profesional, exigir nivel y (opcional) seguro
usuarioSchema.pre('validate', function (next) {
  if (this.rol === 'Profesional') {
    if (!this.nivelProfesional) {
      this.invalidate('nivelProfesional', 'El nivel profesional (Junior/Senior) es obligatorio para profesionales');
    }
    // Si querés hacerlo obligatorio, descomentá:
    // if (!this.seguroMalaPraxis) {
    //   this.invalidate('seguroMalaPraxis', 'El seguro de mala praxis es obligatorio para profesionales');
    // }
  } else {
    // Si cambian el rol a otro, no guardes nivel
    this.nivelProfesional = undefined;
  }
  next();
});

// Modelo + export
const Usuario = mongoose.model('Usuario', usuarioSchema);
Usuario.ROLES = ROLES;              // opcional
Usuario.NIVELES_PRO = NIVELES_PRO;  // opcional

module.exports = Usuario;
