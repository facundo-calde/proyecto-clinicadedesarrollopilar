const mongoose = require('mongoose');

// ------------ Subdocs ------------
const documentoSchema = new mongoose.Schema({
  tipo:        { type: String, required: true },
  nombre:      { type: String, required: true },
  url:         { type: String, required: true },
  fechaSubida: { type: Date, default: Date.now }
});

// ✅ salida plana (incluye virtuals si los agregás luego)
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
  'Área' // 👈 nuevo rol
]);


// Profesional por área (permite distintos niveles por área)
const areaProfesionalSchema = new mongoose.Schema({
  areaId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Area' }, // recomendado
  areaNombre: { type: String },                                       // fallback/legacy
  nivel:      { type: String, enum: NIVELES_PRO, required: true }
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
  cuit: String,
  matricula: String,

  // 👇 ahora tolera '' convirtiéndolo a undefined (no rompe enum)
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
  salarioAcuerdoObs: String,  // 👈 nuevo
  fijoAcuerdo: String,
  fijoAcuerdoObs: String,     // 👈 nuevo

  banco: String,
  cbu: String,
  numeroCuenta: String,
  numeroSucursal: String,
  alias: String,
  nombreFiguraExtracto: String,
  tipoCuenta: String,

  // ✅ Detalle por rol/área
  areasProfesional: [areaProfesionalSchema], // {areaId/areaNombre, nivel: 'Junior'|'Senior'}
  areasCoordinadas: [areaCoordinadaSchema],  // {areaId/areaNombre}

  // ⚠️ LEGACY: lista “chata” (se autollenará)
  areas: [String],

  rol: { type: String, enum: ROLES, required: true },

  // Solo para roles que incluyen parte profesional (no obligatorio)
  seguroMalaPraxis: String,

  // 👇 Para el rol "Pasante": nivel global (no por área)
  nivelPasante: { type: String, enum: NIVELES_PRO, default: undefined },

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

// ✅ salida plana (incluye virtuals si los agregás luego)
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
    // Seguro NO obligatorio
    this.nivelPasante = undefined; // por si cambió el rol
  } else {
    // Si no es profesional, vaciamos su estructura
    this.areasProfesional = [];
    this.seguroMalaPraxis = undefined;
  }

  // Coordinadores: al menos un área coordinada
  if (esCoordinador) {
    if (!Array.isArray(this.areasCoordinadas) || this.areasCoordinadas.length === 0) {
      this.invalidate('areasCoordinadas', 'Debe tener al menos un área para coordinación');
    }
  } else {
    this.areasCoordinadas = [];
  }

  // Pasante: requiere nivel general (Junior/Senior)
  if (esPasante) {
    if (!this.nivelPasante) {
      this.invalidate('nivelPasante', 'El rol Pasante requiere seleccionar nivel (Junior/Senior)');
    }
    // No requiere áreas profesionales ni coordinadas
    this.areasProfesional = [];
    this.areasCoordinadas = [];
    this.seguroMalaPraxis = undefined;
  } else {
    // Si cambió a otro rol, limpiamos nivelPasante
    this.nivelPasante = undefined;
  }

  next();
});

// ------------ Compat: autollenar `areas` (legacy) ------------
usuarioSchema.pre('save', function (next) {
  const nombres = new Set();
  (this.areasProfesional || []).forEach(a => { if (a?.areaNombre) nombres.add(a.areaNombre); });
  (this.areasCoordinadas || []).forEach(a => { if (a?.areaNombre) nombres.add(a.areaNombre); });
  this.areas = Array.from(nombres);
  next();
});

// ------------ Modelo ------------
const Usuario = mongoose.model('Usuario', usuarioSchema);
Usuario.ROLES = ROLES;
Usuario.NIVELES_PRO = NIVELES_PRO;

module.exports = Usuario;
