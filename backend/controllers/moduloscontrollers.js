// backend/controllers/moduloscontrollers.js
const mongoose = require('mongoose');
const Modulo = require('../models/modulos');
const ModuloEventoEspecial = require('../models/moduloEventoEspecial');

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

/* ========== Sanitizadores para MÓDULO estándar ========== */
// Sanitiza body según nuevo esquema (solo NOMBRE)
const sanitizeBody = (body = {}) => {
  const out = {};

  if (body.nombre !== undefined) out.nombre = toStr(body.nombre, '');
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

// Toma el valor del parámetro de ruta, sea cual sea el nombre
function getIdParam(req) {
  const raw =
    req.params.idOrNombre ??
    req.params.id ??
    req.params.nombre ??
    req.params.key ??
    req.params.numero ??
    Object.values(req.params || {})[0];

  return raw ? decodeURIComponent(String(raw)) : '';
}

// Resolver por id/nombre (para GET/PUT/DELETE :param)
async function findByIdOrNombre(idParam) {
  if (!idParam) return null;

  // 1) ObjectId directo
  if (isValidId(idParam)) {
    const byId = await Modulo.findById(idParam);
    if (byId) return byId;
  }
  // 2) nombre exacto
  const byNombre = await Modulo.findOne({ nombre: idParam });
  if (byNombre) return byNombre;

  return null;
}

/* ====================== CRUD MÓDULOS ====================== */
// POST /modulos
const crearModulo = async (req, res) => {
  try {
    const data = sanitizeBody(req.body);

    if (!data.nombre || !String(data.nombre).trim()) {
      return res.status(400).json({ error: 'El campo "nombre" es obligatorio.' });
    }

    const saved = await new Modulo(data).save();
    // devolver versión lean para asegurar _id
    const plain = await Modulo.findById(saved._id).select('_id nombre').lean();
    return res.status(201).json(plain);
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ error: 'Ya existe un módulo con ese nombre.' });
    }
    console.error('❌ crearModulo:', error);
    return res.status(500).json({ error: 'Error al crear módulo' });
  }
};

// GET /modulos  (?lite=1 para solo _id y nombre)
const obtenerModulos = async (req, res) => {
  try {
    const lite = String(req.query.lite || '').trim() === '1';
    if (lite) {
      const list = await Modulo.find().select('_id nombre').sort({ nombre: 1 }).lean();
      return res.json(list);
    }
    // completo, pero evitando que se pierda _id: usar lean()
    const modulos = await populateAsignaciones(
      Modulo.find().sort({ nombre: 1 }).lean()
    );
    return res.json(await modulos);
  } catch (error) {
    console.error('❌ obtenerModulos:', error);
    return res.status(500).json({ error: 'Error al obtener módulos' });
  }
};

// GET /modulos/buscar?nombre=...
const buscarModulos = async (req, res) => {
  try {
    const { nombre } = req.query;

    if (!nombre || !String(nombre).trim()) {
      return res.status(400).json({ error: 'Parámetro "nombre" inválido' });
    }

    const regex = new RegExp(
      String(nombre).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
      'i'
    );

    const docs = await Modulo.find({ nombre: { $regex: regex } })
      .select('_id nombre')
      .sort({ nombre: 1 })
      .limit(10)
      .lean();

    return res.json(docs);
  } catch (error) {
    console.error('❌ buscarModulos:', error);
    return res.status(500).json({ error: 'Error en la búsqueda de módulos' });
  }
};

// GET /modulos/:idOrNombre  (id Mongo | nombre)
const obtenerModulo = async (req, res) => {
  try {
    const idParam = getIdParam(req);
    if (!idParam) return res.status(400).json({ error: 'Parámetro faltante' });

    const moduloBase = await findByIdOrNombre(idParam);
    if (!moduloBase) return res.status(404).json({ error: 'Módulo no encontrado' });

    const modulo = await populateAsignaciones(
      Modulo.findById(moduloBase._id).lean()
    );
    return res.json(await modulo);
  } catch (error) {
    console.error('❌ obtenerModulo:', error);
    return res.status(500).json({ error: 'Error al obtener módulo' });
  }
};

// PUT /modulos/:idOrNombre  (id Mongo | nombre)
const actualizarModulo = async (req, res) => {
  try {
    const idParam = getIdParam(req);
    if (!idParam) return res.status(400).json({ error: 'Parámetro faltante' });

    const current = await findByIdOrNombre(idParam);
    if (!current) return res.status(404).json({ error: 'Módulo no encontrado' });

    const data = sanitizeBody(req.body);

    const $set = {};
    [
      'nombre', 'valorPadres',
      'profesionales', 'coordinadores', 'pasantes',
      'profesionalesExternos', 'coordinadoresExternos', 'pasantesExternos',
      'areasExternas', 'habilidadesSociales'
    ].forEach(k => {
      if (data[k] !== undefined && data[k] !== null && data[k] !== '') $set[k] = data[k];
    });

    if ($set.nombre !== undefined && !String($set.nombre).trim()) {
      return res.status(400).json({ error: 'El campo "nombre" no puede quedar vacío.' });
    }

    await Modulo.findByIdAndUpdate(current._id, { $set }, { new: false });

    const moduloActualizado = await populateAsignaciones(
      Modulo.findById(current._id).lean()
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

// DELETE /modulos/:idOrNombre  (id Mongo | nombre)
const eliminarModulo = async (req, res) => {
  try {
    const idParam = getIdParam(req);
    if (!idParam) return res.status(400).json({ error: 'Parámetro faltante' });

    const current = await findByIdOrNombre(idParam);
    if (!current) return res.status(404).json({ error: 'Módulo no encontrado' });

    await Modulo.findByIdAndDelete(current._id);
    return res.json({ mensaje: 'Módulo eliminado correctamente' });
  } catch (error) {
    console.error('❌ eliminarModulo:', error);
    return res.status(500).json({ error: 'Error al eliminar módulo' });
  }
};

/* ==========================================================
   CRUD MÓDULO EVENTO ESPECIAL
   (solo nombre, valorPadres y coordinadoresExternos [{usuario,monto}])
   Endpoints esperados por el front:
   - POST   /moduloseventoespecial
   - GET    /moduloseventoespecial
   - GET    /moduloseventoespecial/buscar?nombre=...
   - GET    /moduloseventoespecial/:nombre
   - PUT    /moduloseventoespecial/:nombre
   - DELETE /moduloseventoespecial/:nombre
   ========================================================== */

// Sanitizador específico
const sanitizeEventoEspecial = (body = {}) => {
  const out = {};
  if (body.nombre !== undefined) out.nombre = toStr(body.nombre, '');
  if (body.valorPadres !== undefined) out.valorPadres = toNum(body.valorPadres, 0);
  if (body.coordinadoresExternos !== undefined) {
    out.coordinadoresExternos = normAsignaciones(body.coordinadoresExternos);
  }
  return out;
};

const populateEventoEspecial = (q) =>
  q.populate([
    { path: 'coordinadoresExternos.usuario', select: 'nombre nombreApellido apellido rol roles areasProfesional areasCoordinadas' }
  ]);

// find by id/nombre (case-insensitive por nombre)
async function findEventoByIdOrNombre(idParam) {
  if (!idParam) return null;
  if (isValidId(idParam)) {
    const byId = await ModuloEventoEspecial.findById(idParam);
    if (byId) return byId;
  }
  const byNombre = await ModuloEventoEspecial
    .findOne({ nombre: idParam })
    .collation({ locale: 'es', strength: 1 });
  return byNombre || null;
}

// POST /moduloseventoespecial
const crearEventoEspecial = async (req, res) => {
  try {
    const data = sanitizeEventoEspecial(req.body);
    if (!data.nombre || !String(data.nombre).trim()) {
      return res.status(400).json({ error: 'El campo "nombre" es obligatorio.' });
    }
    const doc = await ModuloEventoEspecial.create(data);
    res.status(201).json(doc);
  } catch (e) {
    if (e?.code === 11000) return res.status(409).json({ error: 'Ya existe un evento especial con ese nombre' });
    console.error('❌ crearEventoEspecial:', e);
    res.status(400).json({ error: e.message || 'No se pudo crear el evento especial' });
  }
};

// GET /moduloseventoespecial
const listarEventosEspeciales = async (_req, res) => {
  try {
    const lista = await ModuloEventoEspecial.find().sort({ updatedAt: -1 }).lean();
    res.json(lista);
  } catch (e) {
    console.error('❌ listarEventosEspeciales:', e);
    res.status(500).json({ error: 'Error al listar eventos especiales' });
  }
};

// GET /moduloseventoespecial/buscar?nombre=...
const buscarEventosEspeciales = async (req, res) => {
  try {
    const { nombre } = req.query;
    if (!nombre || !String(nombre).trim()) {
      return res.status(400).json({ error: 'Parámetro "nombre" inválido' });
    }
    const regex = new RegExp(
      String(nombre).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
      'i'
    );
    const docs = await ModuloEventoEspecial.find({ nombre: { $regex: regex } })
      .select('_id nombre')
      .sort({ nombre: 1 })
      .limit(10)
      .lean();
    res.json(docs);
  } catch (e) {
    console.error('❌ buscarEventosEspeciales:', e);
    res.status(500).json({ error: 'Error en la búsqueda' });
  }
};

// GET /moduloseventoespecial/:nombre
const obtenerEventoEspecial = async (req, res) => {
  try {
    const idParam = getIdParam(req);
    if (!idParam) return res.status(400).json({ error: 'Parámetro faltante' });

    const base = await findEventoByIdOrNombre(idParam);
    if (!base) return res.status(404).json({ error: 'Evento especial no encontrado' });

    const doc = await populateEventoEspecial(
      ModuloEventoEspecial.findById(base._id).lean()
    );
    res.json(await doc);
  } catch (e) {
    console.error('❌ obtenerEventoEspecial:', e);
    res.status(500).json({ error: 'Error al obtener evento especial' });
  }
};

// PUT /moduloseventoespecial/:nombre
const actualizarEventoEspecial = async (req, res) => {
  try {
    const idParam = getIdParam(req);
    if (!idParam) return res.status(400).json({ error: 'Parámetro faltante' });

    const current = await findEventoByIdOrNombre(idParam);
    if (!current) return res.status(404).json({ error: 'Evento especial no encontrado' });

    const data = sanitizeEventoEspecial(req.body);
    const $set = {};
    ['nombre', 'valorPadres', 'coordinadoresExternos'].forEach(k => {
      if (data[k] !== undefined && data[k] !== null && data[k] !== '') $set[k] = data[k];
    });

    if ($set.nombre !== undefined && !String($set.nombre).trim()) {
      return res.status(400).json({ error: 'El campo "nombre" no puede quedar vacío.' });
    }

    await ModuloEventoEspecial.findByIdAndUpdate(current._id, { $set }, { new: false });

    const actualizado = await populateEventoEspecial(
      ModuloEventoEspecial.findById(current._id).lean()
    );

    res.json({ mensaje: 'Evento especial actualizado', evento: await actualizado });
  } catch (e) {
    if (e?.code === 11000) return res.status(409).json({ error: 'Nombre duplicado' });
    console.error('❌ actualizarEventoEspecial:', e);
    res.status(500).json({ error: 'Error al actualizar evento especial' });
  }
};

// DELETE /moduloseventoespecial/:nombre
const eliminarEventoEspecial = async (req, res) => {
  try {
    const idParam = getIdParam(req);
    if (!idParam) return res.status(400).json({ error: 'Parámetro faltante' });

    const current = await findEventoByIdOrNombre(idParam);
    if (!current) return res.status(404).json({ error: 'Evento especial no encontrado' });

    await ModuloEventoEspecial.findByIdAndDelete(current._id);
    res.json({ mensaje: 'Evento especial eliminado' });
  } catch (e) {
    console.error('❌ eliminarEventoEspecial:', e);
    res.status(500).json({ error: 'Error al eliminar evento especial' });
  }
};

/* ====================== Exports ====================== */
module.exports = {
  // Módulos
  crearModulo,
  obtenerModulos,
  buscarModulos,
  obtenerModulo,
  actualizarModulo,
  eliminarModulo,

  // Módulos Evento Especial
  crearEventoEspecial,
  listarEventosEspeciales,
  buscarEventosEspeciales,
  obtenerEventoEspecial,
  actualizarEventoEspecial,
  eliminarEventoEspecial,
};

