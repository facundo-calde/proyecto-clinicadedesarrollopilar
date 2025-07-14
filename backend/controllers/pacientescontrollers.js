const Paciente = require('../models/pacientes');

// Buscar por nombre parcial
const buscarPaciente = async (req, res) => {
  try {
    const { nombre } = req.query;
    if (!nombre) return res.status(400).json({ error: 'Falta el nombre o DNI' });

    const regex = new RegExp(nombre, 'i');

    const pacientes = await Paciente.find({
      $or: [
        { nombre: regex },
        { dni: regex }
      ]
    });

    res.json(pacientes);
  } catch (error) {
    console.error('❌ Error al buscar paciente:', error);
    res.status(500).json({ error: 'Error al buscar paciente' });
  }
};


// Obtener por DNI
const obtenerPorDNI = async (req, res) => {
  try {
    const { dni } = req.params;
    const paciente = await Paciente.findOne({ dni });
    if (!paciente) return res.status(404).json({ error: 'No encontrado' });

    res.json(paciente);
  } catch (error) {
    res.status(500).json({ error: 'Error interno' });
  }
};

// Crear nuevo
const crearPaciente = async (req, res) => {
  try {
    const nuevo = new Paciente(req.body);
    await nuevo.save();
    res.status(201).json(nuevo);
  } catch (error) {
    console.error('❌ Error al crear paciente:', error);
    res.status(500).json({ error: 'No se pudo crear paciente' });
  }
};

// Editar por DNI
const actualizarPaciente = async (req, res) => {
  try {
    const { dni } = req.params;
    const actualizado = await Paciente.findOneAndUpdate({ dni }, req.body, { new: true });
    if (!actualizado) return res.status(404).json({ error: 'No encontrado' });

    res.json(actualizado);
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar' });
  }
};

module.exports = {
  buscarPaciente,
  obtenerPorDNI,
  crearPaciente,
  actualizarPaciente
};
