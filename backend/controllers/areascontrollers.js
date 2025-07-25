const Area = require('../models/area');

// Obtener todas
exports.obtenerAreas = async (req, res) => {
  try {
    const areas = await Area.find();
    res.json(areas);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener áreas' });
  }
};

// Crear
exports.crearArea = async (req, res) => {
  try {
    const { nombre, mail } = req.body;
    const nuevaArea = new Area({ nombre, mail });
    await nuevaArea.save();
    res.status(201).json(nuevaArea);
  } catch (err) {
    res.status(400).json({ error: 'Error al crear área' });
  }
};

// Editar
exports.editarArea = async (req, res) => {
  try {
    const areaActualizada = await Area.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    res.json(areaActualizada);
  } catch (err) {
    res.status(400).json({ error: 'Error al editar área' });
  }
};

// Eliminar
exports.eliminarArea = async (req, res) => {
  try {
    await Area.findByIdAndDelete(req.params.id);
    res.json({ message: 'Área eliminada' });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar área' });
  }
};
