// backend/controllers/modulosControllers.js
const Modulo = require('../models/modulos');

/* =========================
   Helpers de normalización
   ========================= */
const toNumber = (v) => {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  if (typeof v === 'string') {
    const s = v
      .replace(/\s+/g, '')
      .replace(/\./g, '')        // separador de miles
      .replace(/[$AR$ar$]/gi, '') // símbolos $
      .replace(',', '.');        // coma -> punto
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  }
  return 0;
};

const normAsignacion = (a = {}) => ({
  area: (a.area || '').toString().trim(),
  rol: (a.rol || '').toString().trim(), // "coordinador" | "profesional"
  userId: (a.userId || a.usuarioId || a._id || '').toString().trim(),
  nombre: (a.nombre || '').toString().trim(),
  monto: toNumber(a.monto),
});

const normAreasExternas = (ae = {}) => ({
  paciente: toNumber(ae.paciente),
  porcentaje: toNumber(ae.porcentaje),
  profesional: toNumber(ae.profesional),
});

const buildPayload = (body = {}) => {
  const numero = parseInt(body.numero, 10);
  if (isNaN(numero)) {
    const err = new Error('Número de módulo inválido');
    err.status = 400;
    throw err;
  }

  const out = {
    numero,
    pagaPaciente: toNumber(body.pagaPaciente),
    // listado por persona (fono/psico, coord/prof)
    asignaciones: Array.isArray(body.asignaciones)
      ? body.asignaciones.map(normAsignacion)
      : [],
    // bloque áreas externas (se mantiene)
    areasExternas: normAreasExternas(body.areasExternas || {}),
  };

  // Permitir arrastrar campos extras si tu Schema los contempla
  // (ej.: notas, estado, fechas, etc.)
  const passthroughKeys = [
    'notas',
    'estado',
    'fecha',
    'createdBy',
    'updatedBy',
    'valoresModulo',   // si aún lo usás en algún lado
    'coordinadores',   // idem
    'profesionales',   // idem
    'habilidadesSociales', // si seguís usando
  ];
  for (const k of passthroughKeys) {
    if (body[k] !== undefined) out[k] = body[k];
  }

  return out;
};

/* =========================
   Crear un nuevo módulo
   ========================= */
const crearModulo = async (req, res) => {
  try {
    const payload = buildPayload(req.body);
    const nuevoModulo = new Modulo(payload);
    await nuevoModulo.save();
    res.status(201).json({ mensaje: 'Módulo creado correctamente', modulo: nuevoModulo });
  } catch (error) {
    console.error('❌ Error al crear módulo:', error);
    const status = error.status || 500;
    res.status(status).json({ error: error.message || 'Error al crear módulo' });
  }
};

/* =========================
   Obtener todos los módulos
   ========================= */
const obtenerModulos = async (req, res) => {
  try {
    const modulos = await Modulo.find().sort({ numero: 1 });
    res.json(modulos);
  } catch (error) {
    console.error('❌ Error al obtener módulos:', error);
    res.status(500).json({ error: 'Error al obtener módulos' });
  }
};

/* =========================
   Búsqueda por número (prefix)
   ========================= */
const buscarModulos = async (req, res) => {
  try {
    const { numero } = req.query;
    if (!numero) {
      return res.status(400).json({ error: 'Falta el número' });
    }
    const regex = new RegExp('^' + numero); // empieza con los dígitos
    const modulos = await Modulo.find({ numero: { $regex: regex } }).limit(5);
    res.json(modulos);
  } catch (error) {
    console.error('❌ Error al buscar módulos:', error);
    res.status(500).json({ error: 'Error en la búsqueda de módulos' });
  }
};

/* =========================
   Obtener un módulo por número exacto
   ========================= */
const obtenerModuloPorNumero = async (req, res) => {
  try {
    const numero = parseInt(req.params.numero, 10);
    if (isNaN(numero)) {
      return res.status(400).json({ error: 'Número inválido' });
    }
    const modulo = await Modulo.findOne({ numero });
    if (!modulo) {
      return res.status(404).json({ error: 'Módulo no encontrado' });
    }
    res.json(modulo);
  } catch (error) {
    console.error('❌ Error al obtener módulo por número:', error);
    res.status(500).json({ error: 'Error al obtener módulo' });
  }
};

/* =========================
   Actualizar un módulo por número
   ========================= */
const actualizarModulo = async (req, res) => {
  try {
    const numero = parseInt(req.params.numero, 10);
    if (isNaN(numero)) {
      return res.status(400).json({ error: 'Número inválido' });
    }
    const payload = buildPayload({ ...req.body, numero }); // fuerza el número del path
    const moduloActualizado = await Modulo.findOneAndUpdate(
      { numero },
      payload,
      { new: true }
    );
    if (!moduloActualizado) {
      return res.status(404).json({ error: 'Módulo no encontrado' });
    }
    res.json({ mensaje: 'Módulo actualizado correctamente', modulo: moduloActualizado });
  } catch (error) {
    console.error('❌ Error al actualizar módulo:', error);
    const status = error.status || 500;
    res.status(status).json({ error: error.message || 'Error al actualizar módulo' });
  }
};

/* =========================
   Eliminar módulo por número
   ========================= */
const eliminarModulo = async (req, res) => {
  try {
    const numero = parseInt(req.params.numero, 10);
    if (isNaN(numero)) {
      return res.status(400).json({ error: 'Número inválido' });
    }
    const eliminado = await Modulo.findOneAndDelete({ numero });
    if (!eliminado) {
      return res.status(404).json({ error: 'Módulo no encontrado' });
    }
    res.json({ mensaje: 'Módulo eliminado correctamente' });
  } catch (error) {
    console.error('❌ Error al eliminar módulo:', error);
    res.status(500).json({ error: 'Error al eliminar módulo' });
  }
};

module.exports = {
  crearModulo,
  obtenerModulos,
  buscarModulos,
  obtenerModuloPorNumero,
  actualizarModulo,
  eliminarModulo,
};

