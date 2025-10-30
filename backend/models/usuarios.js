const mongoose = require('mongoose');

// ------------ Subdocs ------------
const documentoSchema = new mongoose.Schema({
  tipo:        { type: String, required: true },
  nombre:      { type: String, required: true },
  url:         { type: String, required: true },
  fechaSubida: { type: Date, default: Date.now }
});
documentoSchema.set('toJSON',   { virtuals: true, versionKey: false });
documentoSchema.set('toObject', { virtuals: true, versionKey: false });

// Catálogos
const NIVELES_PRO = Object.freeze(['Junior', 'Senior']);

const ROLES = Object.freeze([
  'Administrador',
  'Directoras',
  'Coordinador y profesional',
  'Coordinador de área',
  'Profesional',
  'Administrativo',
  'Recepcionista',
  'Pasante',
  'Área'
]);

// Profesional por área
const areaProfesionalSchema = new mongoose.Schema({
  areaId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Area' },
  areaNombre: { type: String },
  nivel:      { type: String, enum: NIVELES_PRO, required: true }
}, { _id: false });

// Coordinación por área
const areaCoordinadaSchema = new mongoose.Schema({
  areaId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Area' },
  areaNombre: { type: String }
}, { _id: false });

// 👇 Área para Pasante (una sola)
const pasanteAreaSchema = new mongoose.Schema({
  areaId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Area' },
  areaNombre: { type: String }
}, { _id: false });

// ------------ Usuario ------------
const usuarioSchema = new mongoose.Schema({
  nombreApellido: String,
  fechaNacimiento: Date,
  domicilio: String,
  dni: String,
  cuit: String,
  matricula: String,

  jurisdiccion: {
    type: String,
    enum: ['Provincial', 'Nacional'],
    default: undefined,
    set: v => (typeof v === 'string' && v.trim() === '' ? undefined : v)
  },

  registroNacionalDePrestadores: String,
  whatsapp: String,
  mail: String,

  // 💰 acuerdos + observaciones
  salarioAcuerdo: String,
  salarioAcuerdoObs: String,
  fijoAcuerdo: String,
  fijoAcuerdoObs: String,

  banco: String,
  cbu: String,
  numeroCuenta: String,
  numeroSucursal: String,
  alias: String,
  nombreFiguraExtracto: String,
  tipoCuenta: String,

  // Detalle por rol/área
  areasProfesional: [areaProfesionalSchema],
  areasCoordinadas: [areaCoordinadaSchema],

  // ⚠️ LEGACY: lista “chata” (se autollenará)
  areas: [String],

  rol: { type: String, enum: ROLES, required: true },

  // Solo para roles con parte profesional (no obligatorio)
  seguroMalaPraxis: String,

  // 👇 Para Pasante: nivel + área
  pasanteNivel: { type: String, enum: NIVELES_PRO, default: undefined },
  pasanteArea:  { type: pasanteAreaSchema, default: undefined },

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

usuarioSchema.set('toJSON',   { virtuals: true, versionKey: false });
usuarioSchema.set('toObject', { virtuals: true, versionKey: false });

// ------------ Validaciones condicionales ------------
usuarioSchema.pre('validate', function (next) {
  const rol = this.rol || '';

  const esProfesional = rol === 'Profesional' || rol === 'Coordinador y profesional';
  const esCoordinador = rol === 'Coordinador de área' || rol === 'Coordinador y profesional';
  const esPasante     = rol === 'Pasante';

  // Profesionales: al menos un área con nivel
  if (esProfesional) {
    if (!Array.isArray(this.areasProfesional) || this.areasProfesional.length === 0) {
      this.invalidate('areasProfesional', 'Debe tener al menos un área como profesional');
    } else {
      for (const ap of this.areasProfesional) {
        if (!ap?.nivel) {
          this.invalidate('areasProfesional.nivel', 'Cada área profesional debe tener nivel (Junior/Senior)');
          break;
        }
      }
    }
    // Seguro NO obligatorio, y pasante exclusivo
    this.pasanteNivel = undefined;
    this.pasanteArea  = undefined;
  } else {
    // ✅ No borramos areasProfesional para permitir áreas opcionales en otros roles
    // Si querés reservar el seguro para roles con parte profesional, lo limpiamos:
    this.seguroMalaPraxis = undefined;
  }

  // Coordinadores: al menos un área coordinada
  if (esCoordinador) {
    if (!Array.isArray(this.areasCoordinadas) || this.areasCoordinadas.length === 0) {
      this.invalidate('areasCoordinadas', 'Debe tener al menos un área para coordinación');
    }
    // Pasante exclusivo
    this.pasanteNivel = undefined;
    this.pasanteArea  = undefined;
  } else {
    // ✅ No borramos areasCoordinadas para permitir áreas opcionales en otros roles
  }

  // Pasante: requiere nivel + área (id o nombre)
  if (esPasante) {
    if (!this.pasanteNivel) {
      this.invalidate('pasanteNivel', 'El rol Pasante requiere seleccionar nivel (Junior/Senior)');
    }
    const a = this.pasanteArea || {};
    const tieneArea = Boolean(a.areaId || (a.areaNombre && a.areaNombre.trim()));
    if (!tieneArea) {
      this.invalidate('pasanteArea', 'El rol Pasante requiere asignar un área');
    }
    // Exclusividad de pasante: no usar profesional/coord ni seguro
    this.areasProfesional = [];
    this.areasCoordinadas = [];
    this.seguroMalaPraxis = undefined;
  } else {
    // Si NO es pasante, vaciar campos exclusivos de pasante
    this.pasanteNivel = undefined;
    this.pasanteArea  = undefined;
  }

  next();
});

// ------------ Compat: autollenar `areas` (legacy) ------------
usuarioSchema.pre('save', function (next) {
  const nombres = new Set();
  (this.areasProfesional || []).forEach(a => { if (a?.areaNombre) nombres.add(a.areaNombre); });
  (this.areasCoordinadas || []).forEach(a => { if (a?.areaNombre) nombres.add(a.areaNombre); });
  if (this.pasanteArea?.areaNombre) nombres.add(this.pasanteArea.areaNombre); // incluir Pasante
  this.areas = Array.from(nombres);
  next();
});

// ------------ Modelo ------------
const Usuario = mongoose.model('Usuario', usuarioSchema);
Usuario.ROLES = ROLES;
Usuario.NIVELES_PRO = NIVELES_PRO;

module.exports = Usuario;

