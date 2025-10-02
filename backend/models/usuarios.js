const mongoose = require('mongoose');

// ------------ Subdocs ------------
const documentoSchema = new mongoose.Schema({
  tipo: { type: String, required: true },
  nombre: { type: String, required: true },
  url: { type: String, required: true },
  fechaSubida: { type: Date, default: Date.now }
});

// Catálogos
const ROLES = Object.freeze([
  'Administrador',
  'Directoras',
  'Coordinador y profesional',
  'Coordinador de área',
  'Profesional',
  'Administrativo',
  'Recepcionista',
]);

const NIVELES_PRO = Object.freeze(['Junior', 'Senior']);

// Profesional por área (permite distintos niveles por área)
const areaProfesionalSchema = new mongoose.Schema({
  areaId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Area' }, // recomendado
  areaNombre:  { type: String },                                       // fallback/legacy
  nivel:       { type: String, enum: NIVELES_PRO, required: true }
}, { _id: false });

// Coordinación por área
const areaCoordinadaSchema = new mongoose.Schema({
  areaId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Area' },
  areaNombre: { type: String }
}, { _id: false });

// ------------ Usuario ------------
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

  // ✅ NUEVO: detalle por rol/área
  areasProfesional: [areaProfesionalSchema], // {areaId/areaNombre, nivel: 'Junior'|'Senior'}
  areasCoordinadas: [areaCoordinadaSchema],  // {areaId/areaNombre}

  // ⚠️ LEGACY: lista “chata” para compat con front viejo (se autollenará)
  areas: [String],

  rol: { type: String, enum: ROLES, required: true },

  // Solo para roles que incluyen parte profesional
  seguroMalaPraxis: String,

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
}, { timestamps: true });

// ------------ Validaciones condicionales ------------
usuarioSchema.pre('validate', function (next) {
  const rol = this.rol || '';
  const esProfesional = rol === 'Profesional' || rol === 'Coordinador y profesional';
  const esCoordinador = rol === 'Coordinador de área' || rol === 'Coordinador y profesional';

  if (esProfesional) {
    if (!Array.isArray(this.areasProfesional) || this.areasProfesional.length === 0) {
      this.invalidate('areasProfesional', 'Debe tener al menos un área como profesional');
    } else {
      // cada entrada debe tener nivel
      for (const ap of this.areasProfesional) {
        if (!ap?.nivel) {
          this.invalidate('areasProfesional.nivel', 'Cada área profesional debe tener nivel (Junior/Senior)');
          break;
        }
      }
    }
    // si querés obligar seguro, descomentá:
    // if (!this.seguroMalaPraxis) {
    //   this.invalidate('seguroMalaPraxis', 'El seguro de mala praxis es obligatorio para profesionales');
    // }
  } else {
    // si no tiene parte profesional, limpiá detalle profesional
    this.areasProfesional = [];
    this.seguroMalaPraxis = undefined;
  }

  if (esCoordinador) {
    if (!Array.isArray(this.areasCoordinadas) || this.areasCoordinadas.length === 0) {
      this.invalidate('areasCoordinadas', 'Debe tener al menos un área como coordinador');
    }
  } else {
    this.areasCoordinadas = [];
  }

  next();
});

// ------------ Compat: autollenar `areas` (legacy) ------------
usuarioSchema.pre('save', function (next) {
  // Combina nombres de áreas de ambos bloques para no romper el front viejo
  const nombres = new Set();

  (this.areasProfesional || []).forEach(a => {
    if (a?.areaNombre) nombres.add(a.areaNombre);
  });
  (this.areasCoordinadas || []).forEach(a => {
    if (a?.areaNombre) nombres.add(a.areaNombre);
  });

  this.areas = Array.from(nombres);
  next();
});

// ------------ Modelo ------------
const Usuario = mongoose.model('Usuario', usuarioSchema);
Usuario.ROLES = ROLES;
Usuario.NIVELES_PRO = NIVELES_PRO;

module.exports = Usuario;
