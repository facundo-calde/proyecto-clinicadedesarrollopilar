// backend/controllers/modulosControllers.js
const mongoose = require('mongoose');
const Modulo = require('../models/modulos');

/* ====================== Helpers ====================== */
const isValidId = (id) =>
  typeof id === 'string' && mongoose.Types.ObjectId.isValid(id);

const parseMaybeJSON = (v) => {
  if (v == null) return v;
  if (typeof v !== 'string') return v;
  try { return JSON.parse(v); } catch { return v; }
};

const toArr = (v) => {
  const p = parseMaybeJSON(v);
  if (p == null) return [];
  return Array.isArray(p) ? p : [p];
};

const toNum = (v, def = 0) => {
  if (v === '' || v == null) return def;
  const n = typeof v === 'string' ? v.replace(',', '.') : v;
  const x = Number(n);
  return Number.isFinite(x) ? x : def;
};

// Normaliza arrays de asignaciones [{usuario, monto}]
const normAsignaciones = (v) => {
  return toArr(v)
    .map(x => {
      if (x && typeof x === 'object') {
        const id = String(x.usuario ?? x._id ?? '').trim();
        const monto = toNum(x.monto, 0);
        return id ? { usuario: id, monto } : null;
      }
      const id = String(x ?? '').trim();
      return id ? { usuario: id, monto: 0 } : null;
    })
    .filter(Boolean)
    .filter(x => isValidId(x.usuario));
};

const sanitizeBody = (body = {}) => {
  const out = {};

  if (body.numero !== undefined) out.numero = toNum(body.numero, NaN);
  if (body.valorPadres !== undefined) out.valorPadres = toNum(body.valorPadres, 0);

  // Internos
  if (body.profesionales !== undefined) out.profesionales = normAsignaciones(body.profesionales);
  if (body.coordinadores !== undefined) out.coordinadores = normAsignaciones(body.coordinadores);
  if (body.pasantes      !== undefined) out.pasantes      = normAsignaciones(body.pasantes);

  // Externos (NUEVOS)
  if (body.profesionalesExternos !== undefined) out.profesionalesExternos = normAsignaciones(body.profesionalesExternos);
  if (body.coordinadoresExternos !== undefined) out.coordinadoresExternos = normAsignaciones(body.coordinadoresExternos);
  if (body.pasantesExternos      !== undefined) out.pasantesExternos      = normAsignaciones(body.pasantesExternos);

  // Campos existentes anidados (si vienen)
  if (body.areasExternas) {
    const a = parseMaybeJSON(body.areasExternas) || {};
    out.areasExternas = {
      paciente:    toNum(a.paciente, 0),
      porcentaje:  toNum(a.porcentaje, 0),
      profesional: toNum(a.profesional, 0),
    };
  }
  if (body.habilidadesSociales) {
    const h = parseMaybeJSON(body.habilidadesSociales) || {};
    out.habilidadesSociales = {
      paciente:    toNum(h.paciente, 0),
      porcentaje:  toNum(h.porcentaje, 0),
      profesional: toNum(h.profesional, 0),
    };
  }

  return out;
};

const populateAsignaciones = (q) =>
  q.populate([
    // Internos
    { path: 'profesionales.usuario', select: 'nombre nombreApellido apellido rol roles areasProfesional areasCoordinadas' },
    { path: 'coordinadores.usuario', select: 'nombre nombreApellido apellido rol roles areasProfesional areasCoordinadas' },
    { path: 'pasantes.usuario',      select: 'nombre nombreApellido apellido rol roles areasProfesional areasCoordinadas' },
    // Externos
    { path: 'profesionalesExternos.usuario', select: 'nombre nombreApellido apellido rol roles areasProfesional areasCoordinadas' },
    { path: 'coordinadoresExternos.usuario', select: 'nombre nombreApellido apellido rol roles areasProfesional areasCoordinadas' },
    { path: 'pasantesExternos.usuario',      select: 'nombre nombreApellido apellido rol roles areasProfesional areasCoordinadas' },
  ]);

/* ====================== CRUD ====================== */
// POST /modulos
const crearModulo = async (req, res) => {
  try {
    const data = sanitizeBody(req.body);

    if (data.numero == null || Number.isNaN(data.numero)) {
      return res.status(400).json({ error: 'El campo "numero" es obligatorio y debe ser numérico.' });
    }

    const saved = await new Modulo(data).save();
    await populateAsignaciones(saved);
    return res.status(201).json(saved);
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ error: 'Ya existe un módulo con ese número.' });
    }
    console.error('❌ crearModulo:', error);
    return res.status(500).json({ error: 'Error al crear módulo' });
  }
};

// GET /modulos
const obtenerModulos = async (_req, res) => {
  try {
    const modulos = await populateAsignaciones(Modulo.find().sort({ numero: 1 }));
    return res.json(modulos);
  } catch (error) {
    console.error('❌ obtenerModulos:', error);
    return res.status(500).json({ error: 'Error al obtener módulos' });
  }
};

// GET /modulos/buscar?numero=...
const buscarModulos = async (req, res) => {
  try {
    const { numero } = req.query;
    if (!numero || !/^\d+$/.test(String(numero))) {
      return res.status(400).json({ error: 'Parámetro "numero" inválido' });
    }

    const regex = new RegExp('^' + String(numero));
    const ids = (await Modulo.aggregate([
      { $addFields: { numeroStr: { $toString: '$numero' } } },
      { $match: { numeroStr: { $regex: regex } } },
      { $sort: { numero: 1 } },
      { $limit: 5 },
      { $project: { _id: 1 } }
    ])).map(m => m._id);

    const full = await populateAsignaciones(Modulo.find({ _id: { $in: ids } }).sort({ numero: 1 }));
    return res.json(full);
  } catch (error) {
    console.error('❌ buscarModulos:', error);
    return res.status(500).json({ error: 'Error en la búsqueda de módulos' });
  }
};

// GET /modulos/:numero
const obtenerModuloPorNumero = async (req, res) => {
  try {
    const numero = parseInt(req.params.numero, 10);
    if (Number.isNaN(numero)) return res.status(400).json({ error: 'Número inválido' });

    const modulo = await populateAsignaciones(Modulo.findOne({ numero }));
    if (!modulo) return res.status(404).json({ error: 'Módulo no encontrado' });

    return res.json(modulo);
  } catch (error) {
    console.error('❌ obtenerModuloPorNumero:', error);
    return res.status(500).json({ error: 'Error al obtener módulo' });
  }
};

// PUT /modulos/:numero
const actualizarModulo = async (req, res) => {
  try {
    const numero = parseInt(req.params.numero, 10);
    if (Number.isNaN(numero)) return res.status(400).json({ error: 'Número inválido' });

    const data = sanitizeBody(req.body);

    // Armamos $set sólo con lo presente (evita nullear arrays si no vienen)
    const $set = {};
    [
      'numero', 'valorPadres',
      // internos
      'profesionales', 'coordinadores', 'pasantes',
      // externos
      'profesionalesExternos', 'coordinadoresExternos', 'pasantesExternos',
      // anidados
      'areasExternas', 'habilidadesSociales'
    ].forEach(k => {
      if (data[k] !== undefined && data[k] !== null && data[k] !== '') $set[k] = data[k];
    });

    const moduloActualizado = await populateAsignaciones(
      Modulo.findOneAndUpdate({ numero }, { $set }, { new: true })
    );
    if (!moduloActualizado) return res.status(404).json({ error: 'Módulo no encontrado' });

    return res.json({ mensaje: 'Módulo actualizado correctamente', modulo: moduloActualizado });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ error: 'Ya existe un módulo con ese número' });
    }
    console.error('❌ actualizarModulo:', error);
    return res.status(500).json({ error: 'Error al actualizar módulo' });
  }
};

// DELETE /modulos/:numero
const eliminarModulo = async (req, res) => {
  try {
    const numero = parseInt(req.params.numero, 10);
    if (Number.isNaN(numero)) return res.status(400).json({ error: 'Número inválido' });

    const eliminado = await Modulo.findOneAndDelete({ numero });
    if (!eliminado) return res.status(404).json({ error: 'Módulo no encontrado' });

    return res.json({ mensaje: 'Módulo eliminado correctamente' });
  } catch (error) {
    console.error('❌ eliminarModulo:', error);
    return res.status(500).json({ error: 'Error al eliminar módulo' });
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

