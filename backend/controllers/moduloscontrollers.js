// backend/controllers/modulosControllers.js
const mongoose = require('mongoose');
const Modulo = require('../models/modulos');

// ---------- Helpers ----------
const normAsignaciones = (v) => {
  if (!v) return [];
  const arr = Array.isArray(v) ? v : [v];
  return arr.map(x => {
    // acepta {usuario, monto} | {_id, monto} | ObjectId
    if (x && typeof x === 'object') {
      const id = String(x.usuario ?? x._id ?? '').trim();
      const monto = Number(x.monto ?? 0) || 0;
      return id ? { usuario: id, monto } : null;
    }
    const id = String(x ?? '').trim();
    return id ? { usuario: id, monto: 0 } : null;
  }).filter(Boolean);
};

const sanitizeBody = (body = {}) => {
  const out = {};

  if (body.numero !== undefined) out.numero = Number(body.numero);
  if (body.valorPadres !== undefined) out.valorPadres = Number(body.valorPadres);

  // asignaciones por persona
  if (body.profesionales !== undefined) out.profesionales = normAsignaciones(body.profesionales);
  if (body.coordinadores !== undefined) out.coordinadores = normAsignaciones(body.coordinadores);
  if (body.pasantes      !== undefined) out.pasantes      = normAsignaciones(body.pasantes);

  // bloques opcionales
  if (body.areasExternas) {
    out.areasExternas = {
      paciente:    Number(body.areasExternas.paciente ?? 0),
      porcentaje:  Number(body.areasExternas.porcentaje ?? 0),
      profesional: Number(body.areasExternas.profesional ?? 0),
    };
  }
  if (body.habilidadesSociales) {
    out.habilidadesSociales = {
      paciente:    Number(body.habilidadesSociales.paciente ?? 0),
      porcentaje:  Number(body.habilidadesSociales.porcentaje ?? 0),
      profesional: Number(body.habilidadesSociales.profesional ?? 0),
    };
  }

  return out;
};

const populateAsignaciones = (q) =>
  q
    .populate('profesionales.usuario', 'nombre nombreApellido apellido rol roles')
    .populate('coordinadores.usuario', 'nombre nombreApellido apellido rol roles')
    .populate('pasantes.usuario',      'nombre nombreApellido apellido rol roles');

// ---------- CRUD ----------
// Crear un nuevo módulo
const crearModulo = async (req, res) => {
  try {
    const data = sanitizeBody(req.body);

    if (data.numero == null || Number.isNaN(data.numero)) {
      return res.status(400).json({ error: 'El campo "numero" es obligatorio' });
    }

    const nuevo  = new Modulo(data);
    const saved  = await nuevo.save();

    // ✅ populate correcto sobre documento
    await saved.populate([
      { path: 'profesionales.usuario', select: 'nombre nombreApellido apellido rol roles' },
      { path: 'coordinadores.usuario', select: 'nombre nombreApellido apellido rol roles' },
      { path: 'pasantes.usuario',      select: 'nombre nombreApellido apellido rol roles' },
    ]);

    res.status(201).json(saved);
  } catch (error) {
    if (error && error.code === 11000) {
      return res.status(409).json({ error: 'Ya existe un módulo con ese número' });
    }
    console.error('❌ Error al crear módulo:', error);
    res.status(500).json({ error: 'Error al crear módulo' });
  }
};


const obtenerModulos = async (_req, res) => {
  try {
    const modulos = await populateAsignaciones(
      Modulo.find().sort({ numero: 1 })
    );
    res.json(modulos);
  } catch (error) {
    console.error('❌ Error al obtener módulos:', error);
    res.status(500).json({ error: 'Error al obtener módulos' });
  }
};

// Buscar por prefijo (?numero=12 -> 12, 120, 121, ...)
const buscarModulos = async (req, res) => {
  try {
    const { numero } = req.query;
    if (!numero || !/^\d+$/.test(String(numero))) {
      return res.status(400).json({ error: 'Parámetro "numero" inválido' });
    }

    const regex = new RegExp('^' + String(numero));

    const modsAggr = await Modulo.aggregate([
      { $addFields: { numeroStr: { $toString: '$numero' } } },
      { $match: { numeroStr: { $regex: regex } } },
      { $sort: { numero: 1 } },
      { $limit: 5 },
      { $project: { _id: 1 } }
    ]);

    const ids = modsAggr.map(m => m._id);
    const full = await populateAsignaciones(
      Modulo.find({ _id: { $in: ids } }).sort({ numero: 1 })
    );

    res.json(full);
  } catch (error) {
    console.error('❌ Error en la búsqueda de módulos:', error);
    res.status(500).json({ error: 'Error en la búsqueda de módulos' });
  }
};

const obtenerModuloPorNumero = async (req, res) => {
  try {
    const numero = parseInt(req.params.numero, 10);
    if (Number.isNaN(numero)) return res.status(400).json({ error: 'Número inválido' });

    const modulo = await populateAsignaciones(
      Modulo.findOne({ numero })
    );

    if (!modulo) return res.status(404).json({ error: 'Módulo no encontrado' });

    res.json(modulo);
  } catch (error) {
    console.error('❌ Error al obtener módulo por número:', error);
    res.status(500).json({ error: 'Error al obtener módulo' });
  }
};

const actualizarModulo = async (req, res) => {
  try {
    const numero = parseInt(req.params.numero, 10);
    if (Number.isNaN(numero)) return res.status(400).json({ error: 'Número inválido' });

    const data = sanitizeBody(req.body);

    const moduloActualizado = await populateAsignaciones(
      Modulo.findOneAndUpdate({ numero }, { $set: data }, { new: true })
    );

    if (!moduloActualizado) return res.status(404).json({ error: 'Módulo no encontrado' });

    res.json({ mensaje: 'Módulo actualizado correctamente', modulo: moduloActualizado });
  } catch (error) {
    if (error && error.code === 11000) {
      return res.status(409).json({ error: 'Ya existe un módulo con ese número' });
    }
    console.error('❌ Error al actualizar módulo:', error);
    res.status(500).json({ error: 'Error al actualizar módulo' });
  }
};

const eliminarModulo = async (req, res) => {
  try {
    const numero = parseInt(req.params.numero, 10);
    if (Number.isNaN(numero)) return res.status(400).json({ error: 'Número inválido' });

    const eliminado = await Modulo.findOneAndDelete({ numero });
    if (!eliminado) return res.status(404).json({ error: 'Módulo no encontrado' });

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
