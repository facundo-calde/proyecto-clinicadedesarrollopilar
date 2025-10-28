// backend/controllers/modulosControllers.js
const mongoose = require('mongoose');
const Modulo = require('../models/modulos');

const toArrayIds = (v) => {
  if (v == null || v === '') return [];
  const arr = Array.isArray(v) ? v : [v];
  // filtra valores vacíos y castea a ObjectId si parecen válidos
  return arr
    .map(x => String(x).trim())
    .filter(Boolean)
    .map(x => (mongoose.Types.ObjectId.isValid(x) ? new mongoose.Types.ObjectId(x) : x));
};

const sanitizeBody = (body = {}) => {
  const out = {};
  if (body.numero !== undefined) out.numero = Number(body.numero);
  if (body.valorPadres !== undefined) out.valorPadres = Number(body.valorPadres);

  if (body.profesionales !== undefined) out.profesionales = toArrayIds(body.profesionales);
  if (body.coordinadores !== undefined) out.coordinadores = toArrayIds(body.coordinadores);

  // Mantener bloques opcionales si vienen del UI
  if (body.areasExternas) {
    out.areasExternas = {
      paciente: Number(body.areasExternas.paciente ?? 0),
      porcentaje: Number(body.areasExternas.porcentaje ?? 0),
      profesional: Number(body.areasExternas.profesional ?? 0),
    };
  }
  if (body.habilidadesSociales) {
    out.habilidadesSociales = {
      paciente: Number(body.habilidadesSociales.paciente ?? 0),
      porcentaje: Number(body.habilidadesSociales.porcentaje ?? 0),
      profesional: Number(body.habilidadesSociales.profesional ?? 0),
    };
  }

  return out;
};

// Crear un nuevo módulo
const crearModulo = async (req, res) => {
  try {
    const data = sanitizeBody(req.body);

    if (data.numero == null || Number.isNaN(data.numero)) {
      return res.status(400).json({ error: 'El campo "numero" es obligatorio' });
    }

    const nuevo = new Modulo(data);
    const saved = await nuevo.save();

    const populated = await saved
      .populate('profesionales', 'nombre apellido rol roles')
      .populate('coordinadores', 'nombre apellido rol roles');

    res.status(201).json(populated);
  } catch (error) {
    // Duplicado de "numero"
    if (error && error.code === 11000) {
      return res.status(409).json({ error: 'Ya existe un módulo con ese número' });
    }
    console.error('❌ Error al crear módulo:', error);
    res.status(500).json({ error: 'Error al crear módulo' });
  }
};

// Obtener todos los módulos (ordenados por número)
const obtenerModulos = async (_req, res) => {
  try {
    const modulos = await Modulo.find()
      .sort({ numero: 1 })
      .populate('profesionales', 'nombre apellido rol roles')
      .populate('coordinadores', 'nombre apellido rol roles');

    res.json(modulos);
  } catch (error) {
    console.error('❌ Error al obtener módulos:', error);
    res.status(500).json({ error: 'Error al obtener módulos' });
  }
};

// Buscar módulos por prefijo de número (?numero=12 -> 12,120,121,...)
const buscarModulos = async (req, res) => {
  try {
    const { numero } = req.query;
    if (!numero || !/^\d+$/.test(String(numero))) {
      return res.status(400).json({ error: 'Parámetro "numero" inválido' });
    }

    const regex = new RegExp('^' + String(numero)); // prefijo

    // Usamos agregación para castear numero a string y matchear por regex
    const modulos = await Modulo.aggregate([
      { $addFields: { numeroStr: { $toString: '$numero' } } },
      { $match: { numeroStr: { $regex: regex } } },
      { $sort: { numero: 1 } },
      { $limit: 5 }
    ]);

    // populate manual post-aggregate
    const ids = modulos.map(m => m._id);
    const full = await Modulo.find({ _id: { $in: ids } })
      .sort({ numero: 1 })
      .populate('profesionales', 'nombre apellido rol roles')
      .populate('coordinadores', 'nombre apellido rol roles');

    res.json(full);
  } catch (error) {
    console.error('❌ Error en la búsqueda de módulos:', error);
    res.status(500).json({ error: 'Error en la búsqueda de módulos' });
  }
};

// Obtener un módulo por número exacto
const obtenerModuloPorNumero = async (req, res) => {
  try {
    const numero = parseInt(req.params.numero, 10);
    if (Number.isNaN(numero)) {
      return res.status(400).json({ error: 'Número inválido' });
    }

    const modulo = await Modulo.findOne({ numero })
      .populate('profesionales', 'nombre apellido rol roles')
      .populate('coordinadores', 'nombre apellido rol roles');

    if (!modulo) {
      return res.status(404).json({ error: 'Módulo no encontrado' });
    }

    res.json(modulo);
  } catch (error) {
    console.error('❌ Error al obtener módulo por número:', error);
    res.status(500).json({ error: 'Error al obtener módulo' });
  }
};

// Actualizar un módulo por número
const actualizarModulo = async (req, res) => {
  try {
    const numero = parseInt(req.params.numero, 10);
    if (Number.isNaN(numero)) {
      return res.status(400).json({ error: 'Número inválido' });
    }

    const data = sanitizeBody(req.body);

    const moduloActualizado = await Modulo.findOneAndUpdate(
      { numero },
      { $set: data },
      { new: true }
    )
      .populate('profesionales', 'nombre apellido rol roles')
      .populate('coordinadores', 'nombre apellido rol roles');

    if (!moduloActualizado) {
      return res.status(404).json({ error: 'Módulo no encontrado' });
    }

    res.json({ mensaje: 'Módulo actualizado correctamente', modulo: moduloActualizado });
  } catch (error) {
    // detecta intento de duplicar "numero" si permiten cambiarlo
    if (error && error.code === 11000) {
      return res.status(409).json({ error: 'Ya existe un módulo con ese número' });
    }
    console.error('❌ Error al actualizar módulo:', error);
    res.status(500).json({ error: 'Error al actualizar módulo' });
  }
};

// Eliminar módulo por número
const eliminarModulo = async (req, res) => {
  try {
    const numero = parseInt(req.params.numero, 10);
    if (Number.isNaN(numero)) {
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
