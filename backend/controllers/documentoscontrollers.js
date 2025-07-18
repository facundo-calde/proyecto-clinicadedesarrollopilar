const Paciente = require('../models/pacientes');

// GET documentos
const obtenerDocumentos = async (req, res) => {
  try {
    const { dni } = req.params;
    const paciente = await Paciente.findOne({ dni });
    if (!paciente) return res.status(404).json({ error: 'Paciente no encontrado' });

    res.json(paciente.documentosPersonales || []);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener documentos' });
  }
};

// POST documento
const agregarDocumento = async (req, res) => {
  try {
    const { dni } = req.params;
    const { fecha, tipo, observaciones, archivos } = req.body;

    const paciente = await Paciente.findOne({ dni });
    if (!paciente) return res.status(404).json({ error: 'Paciente no encontrado' });

    paciente.documentosPersonales = paciente.documentosPersonales || [];
    paciente.documentosPersonales.push({ fecha, tipo, observaciones, archivos });
    await paciente.save();

    res.status(201).json(paciente.documentosPersonales);
  } catch (err) {
    res.status(500).json({ error: 'Error al agregar documento' });
  }
};

// DELETE documento
const eliminarDocumento = async (req, res) => {
  try {
    const { dni, index } = req.params;
    const paciente = await Paciente.findOne({ dni });
    if (!paciente) return res.status(404).json({ error: 'Paciente no encontrado' });

    if (paciente.documentosPersonales && paciente.documentosPersonales[index]) {
      paciente.documentosPersonales.splice(index, 1);
      await paciente.save();
      res.json({ ok: true });
    } else {
      res.status(404).json({ error: 'Documento no encontrado' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar documento' });
  }
};

module.exports = {
  agregarDocumento,
  obtenerDocumentos,
  eliminarDocumento
};
