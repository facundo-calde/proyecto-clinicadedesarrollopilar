const Usuario = require('../models/usuarios');

exports.crearUsuario = async (req, res) => {
  try {
    const nuevo = new Usuario(req.body);
    await nuevo.save();
    res.status(201).json(nuevo);
  } catch (err) {
    res.status(500).json({ error: 'Error al crear usuario', detalles: err });
  }
};

exports.obtenerUsuarios = async (req, res) => {
  try {
    const lista = await Usuario.find();
    res.status(200).json(lista);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener usuarios' });
  }
};

exports.eliminarUsuario = async (req, res) => {
  try {
    await Usuario.findByIdAndDelete(req.params.id);
    res.status(200).json({ mensaje: 'Usuario eliminado' });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar usuario' });
  }
};

exports.actualizarUsuario = async (req, res) => {
  try {
    const actualizado = await Usuario.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.status(200).json(actualizado);
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar usuario' });
  }
};

// Ejemplo para controlador separado
exports.getUsuarioPorId = async (req, res) => {
  try {
    const usuario = await Usuario.findById(req.params.id);
    if (!usuario) return res.status(404).json({ error: 'No encontrado' });
    res.json(usuario);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener usuario' });
  }
};
