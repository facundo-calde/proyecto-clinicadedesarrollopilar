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

const toStr = (v, def = '') => {
  if (v == null) return def;
  const s = String(v).trim();
  return s || def;
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

// ✅ Ahora priorizamos `nombre` (string). `numero` queda como legacy opcional.
const sanitizeBody = (body = {}) => {
  const out = {};

  // Principal
  if (body.nombre !== undefined) out.nombre = toStr(body.nombre, '');
  // Legacy: si vino numero y no vino nombre, lo usamos para nombre
  if (out.nombre == null || out.nombre === '') {
    if (body.numero !== undefined && body.numero !== null && body.numero !== '') {
      const n = toNum(body.numero, NaN);
      if (!Number.isNaN(n)) out.nombre = String(n);
    }
  }

  // Legacy: también dejamos pasar numero si lo querés seguir guardando durante la transición
  if (body.numero !== undefined) out.numero = toNum(body.numero, NaN);

  if (body.valorPadres !== undefined) out.valorPadres = toNum(body.valorPadres, 0);

  // Internos
  if (body.profesionales !== undefined) out.profesionales = normAsignaciones(body.profesionales);
  if (body.coordinadores !== undefined) out.coordinadores = normAsignaciones(body.coordinadores);
  if (body.pasantes      !== undefined) out.pasantes      = normAsignaciones(body.pasantes);

  // Externos
  if (body.profesionalesExternos !== undefined) out.profesionalesExternos = normAsignaciones(body.profesionalesExternos);
  if (body.coordinadoresExternos !== undefined) out.coordinadoresExternos = normAsignaciones(body.coordinadoresExternos);
  if (body.pasantesExternos      !== undefined) out.pasantesExternos      = normAsignaciones(body.pasantesExternos);

  // Campos anidados
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

// Resolver por id/nombre/numero (para GET/PUT/DELETE :param)
async function findByIdOrNombreOrNumero(idParam) {
  // 1) ObjectId directo
  if (isValidId(idParam)) {
    const byId = await Modulo.findById(idParam);
    if (byId) return byId;
  }
  // 2) nombre exacto (string)
  const byNombre = await Modulo.findOne({ nombre: idParam });
  if (byNombre) return byNombre;

  // 3) legacy numero exacto si idParam es numérico
  if (/^\d+$/.test(String(idParam))) {
    const numero = parseInt(idParam, 10);
    if (!Number.isNaN(numero)) {
      const byNumero = await Modulo.findOne({ numero });
      if (byNumero) return byNumero;
    }
  }
  return null;
}

/* ====================== CRUD ====================== */
// POST /modulos
const crearModulo = async (req, res) => {
  try {
    const data = sanitizeBody(req.body);

    // Validación principal ahora es "nombre"
    if (!data.nombre || !String(data.nombre).trim()) {
      return res.status(400).json({ error: 'El campo "nombre" es obligatorio.' });
    }

    const saved = await new Modulo(data).save();
    await populateAsignaciones(saved);
    return res.status(201).json(saved);
  } catch (error) {
    if (error?.code === 11000) {
      // índice único en nombre
      return res.status(409).json({ error: 'Ya existe un módulo con ese nombre.' });
    }
    console.error('❌ crearModulo:', error);
    return res.status(500).json({ error: 'Error al crear módulo' });
  }
};

// GET /modulos
const obtenerModulos = async (_req, res) => {
  try {
    const modulos = await populateAsignaciones(Modulo.find().sort({ nombre: 1 }));
    return res.json(modulos);
  } catch (error) {
    console.error('❌ obtenerModulos:', error);
    return res.status(500).json({ error: 'Error al obtener módulos' });
  }
};

// GET /modulos/buscar?nombre=...   (preferido)
//     /modulos/buscar?numero=...   (legacy)
const buscarModulos = async (req, res) => {
  try {
    const { nombre, numero } = req.query;

    if (nombre && String(nombre).trim().length >= 1) {
      const regex = new RegExp(String(nombre).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'); // case-insensitive
      const docs = await Modulo.find({ nombre: { $regex: regex } })
        .sort({ nombre: 1 })
        .limit(10);
      const full = await populateAsignaciones(Modulo.find({ _id: { $in: docs.map(d => d._id) } }).sort({ nombre: 1 }));
      return res.json(await full);
    }

    // Legacy por numero (prefijo)
    if (numero && /^\d+$/.test(String(numero))) {
      const regex = new RegExp('^' + String(numero));
      const ids = (await Modulo.aggregate([
        { $addFields: { numeroStr: { $toString: '$numero' } } },
        { $match: { numeroStr: { $regex: regex } } },
        { $sort: { numero: 1 } },
        { $limit: 10 },
        { $project: { _id: 1 } }
      ])).map(m => m._id);

      const full = await populateAsignaciones(Modulo.find({ _id: { $in: ids } }).sort({ numero: 1 }));
      return res.json(await full);
    }

    return res.status(400).json({ error: 'Parámetro de búsqueda inválido (use ?nombre=... o ?numero=...).' });
  } catch (error) {
    console.error('❌ buscarModulos:', error);
    return res.status(500).json({ error: 'Error en la búsqueda de módulos' });
  }
};

// GET /modulos/:idParam  (id Mongo | nombre | numero[legacy])
const obtenerModuloPorNumero = async (req, res) => {
  try {
    const { idParam } = { idParam: req.params.numero ?? req.params.id ?? req.params.nombre ?? req.params.key };
    const moduloBase = await findByIdOrNombreOrNumero(idParam);
    if (!moduloBase) return res.status(404).json({ error: 'Módulo no encontrado' });

    const modulo = await populateAsignaciones(Modulo.findById(moduloBase._id));
    return res.json(await modulo);
  } catch (error) {
    console.error('❌ obtenerModuloPorNumero:', error);
    return res.status(500).json({ error: 'Error al obtener módulo' });
  }
};

// PUT /modulos/:idParam  (id Mongo | nombre | numero[legacy])
const actualizarModulo = async (req, res) => {
  try {
    const { idParam } = { idParam: req.params.numero ?? req.params.id ?? req.params.nombre ?? req.params.key };
    const current = await findByIdOrNombreOrNumero(idParam);
    if (!current) return res.status(404).json({ error: 'Módulo no encontrado' });

    const data = sanitizeBody(req.body);

    // Armamos $set sólo con lo presente
    const $set = {};
    [
      'nombre', 'numero', 'valorPadres',
      // internos
      'profesionales', 'coordinadores', 'pasantes',
      // externos
      'profesionalesExternos', 'coordinadoresExternos', 'pasantesExternos',
      // anidados
      'areasExternas', 'habilidadesSociales'
    ].forEach(k => {
      if (data[k] !== undefined && data[k] !== null && data[k] !== '') $set[k] = data[k];
    });

    // Validación mínima: si cambia nombre, no vacío
    if ($set.nombre !== undefined && !String($set.nombre).trim()) {
      return res.status(400).json({ error: 'El campo "nombre" no puede quedar vacío.' });
    }

    const moduloActualizado = await populateAsignaciones(
      Modulo.findByIdAndUpdate(current._id, { $set }, { new: true })
    );
    return res.json({ mensaje: 'Módulo actualizado correctamente', modulo: await moduloActualizado });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ error: 'Ya existe un módulo con ese nombre.' });
    }
    console.error('❌ actualizarModulo:', error);
    return res.status(500).json({ error: 'Error al actualizar módulo' });
  }
};

// DELETE /modulos/:idParam  (id Mongo | nombre | numero[legacy])
const eliminarModulo = async (req, res) => {
  try {
    const { idParam } = { idParam: req.params.numero ?? req.params.id ?? req.params.nombre ?? req.params.key };
    const current = await findByIdOrNombreOrNumero(idParam);
    if (!current) return res.status(404).json({ error: 'Módulo no encontrado' });

    await Modulo.findByIdAndDelete(current._id);
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
  obtenerModuloPorNumero, // mantiene el nombre exportado para no romper tus routes
  actualizarModulo,
  eliminarModulo,
};
