const Paciente = require('../models/pacientes');

// Buscar por nombre parcial
const buscarPaciente = async (req, res) => {
  try {
    const { nombre } = req.query;
    if (!nombre) return res.status(400).json({ error: 'Falta el nombre o DNI' });

    const nombreLimpio = nombre.replace(/\./g, '');
    const regex = new RegExp(nombreLimpio, 'i');

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
    const paciente = await Paciente.findOne({ dni });

    if (!paciente) return res.status(404).json({ error: 'No encontrado' });

    // Actualizá solo los campos permitidos
    const campos = [
      'nombre', 'fechaNacimiento', 'colegio', 'curso', 'madre', 'padre',
      'whatsappMadre', 'whatsappPadre', 'mail', 'abonado', 'estado',
      'areas', 'planPaciente', 'fechaBaja', 'motivoBaja', 'documentos' // ← acá
    ];


    campos.forEach(campo => {
      if (req.body[campo] !== undefined) {
        paciente[campo] = req.body[campo];
      }
    });

    await paciente.save();
    res.json(paciente);

  } catch (error) {
    console.error('❌ Error al actualizar:', error);
    res.status(500).json({ error: 'Error al actualizar' });
  }
};


module.exports = {
  buscarPaciente,
  obtenerPorDNI,
  crearPaciente,
  actualizarPaciente
};

