const Modulo = require('../models/modulos');

// Crear un nuevo módulo
const crearModulo = async (req, res) => {
  try {
    const nuevoModulo = new Modulo(req.body);
    await nuevoModulo.save();
    res.status(201).json({ mensaje: 'Módulo creado correctamente' });
  } catch (error) {
    console.error('❌ Error al crear módulo:', error);
    res.status(500).json({ error: 'Error al crear módulo' });
  }
};

// Obtener todos los módulos
const obtenerModulos = async (req, res) => {
  try {
    const modulos = await Modulo.find().sort({ numero: 1 });
    res.json(modulos);
  } catch (error) {
    console.error('❌ Error al obtener módulos:', error);
    res.status(500).json({ error: 'Error al obtener módulos' });
  }
};

// Buscar módulos por número
const buscarModulos = async (req, res) => {
  try {
    const { numero } = req.query;

    if (!numero) {
      return res.status(400).json({ error: 'Falta el número' });
    }

    const regex = new RegExp('^' + numero); // Coincidencias que empiezan con los dígitos ingresados
    const modulos = await Modulo.find({ numero: { $regex: regex } }).limit(5);

    res.json(modulos);
  } catch (error) {
    console.error('❌ Error al buscar módulos:', error);
    res.status(500).json({ error: 'Error en la búsqueda de módulos' });
  }
};

// Obtener un módulo por número exacto
const obtenerModuloPorNumero = async (req, res) => {
  try {
    const numero = parseInt(req.params.numero);
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

// Actualizar un módulo por número
const actualizarModulo = async (req, res) => {
  try {
    const numero = parseInt(req.params.numero);
    if (isNaN(numero)) {
      return res.status(400).json({ error: 'Número inválido' });
    }

    const moduloActualizado = await Modulo.findOneAndUpdate(
      { numero },
      req.body,
      { new: true }
    );

    if (!moduloActualizado) {
      return res.status(404).json({ error: 'Módulo no encontrado' });
    }

    res.json({ mensaje: 'Módulo actualizado correctamente', modulo: moduloActualizado });
  } catch (error) {
    console.error('❌ Error al actualizar módulo:', error);
    res.status(500).json({ error: 'Error al actualizar módulo' });
  }
};

// Eliminar módulo por número
const eliminarModulo = async (req, res) => {
  try {
    const numero = parseInt(req.params.numero);
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
  eliminarModulo
};
