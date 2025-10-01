const Paciente = require('../models/pacientes');

// --- Helpers ---
const WSP_RE  = /^\d{10,15}$/;
const DNI_RE  = /^\d{7,8}$/;
const MAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CP_OK   = new Set(['Obra Social', 'Particular', 'Obra Social + Particular']);
const ESTADOS = new Set(['Alta', 'Baja', 'En espera']);

// Permite relaciones repetidas y limita a 3
function sanitizeResponsables(responsables) {
  if (!Array.isArray(responsables)) return [];
  const out = [];
  for (const r0 of responsables) {
    const r = {
      relacion: String(r0.relacion || '').toLowerCase().trim(),
      nombre:   (r0.nombre || '').trim(),
      whatsapp: (r0.whatsapp || '').trim(),
    };
    if (!['padre','madre','tutor'].includes(r.relacion)) continue;
    if (!r.nombre) continue;
    if (!WSP_RE.test(r.whatsapp)) continue;
    out.push(r);
    if (out.length >= 3) break; // máx. 3
  }
  return out;
}

// Construye el payload final (sin legacy)
function buildPacienteData(body, existing = null) {
  const data = {};

  // Campos soportados por el schema
  const simples = [
    'nombre','fechaNacimiento','colegio','curso',
    'colegioMail','mailPadres','mailTutor',
    'condicionDePago','estado',
    'areas','planPaciente','fechaBaja','motivoBaja',
    'prestador','credencial','tipo'
  ];
  for (const k of simples) {
    if (body[k] !== undefined && body[k] !== null) data[k] = body[k];
  }

  // DNI solo al crear
  if (!existing && body.dni !== undefined) data.dni = String(body.dni).trim();

  // Validaciones suaves
  if (data.dni && !DNI_RE.test(data.dni)) delete data.dni;
  if (data.condicionDePago && !CP_OK.has(data.condicionDePago)) delete data.condicionDePago;

  // Normalizar/validar mails opcionales
  ['colegioMail','mailPadres','mailTutor'].forEach(k => {
    if (data[k] !== undefined) {
      data[k] = String(data[k]).trim().toLowerCase();
      if (data[k] && !MAIL_RE.test(data[k])) delete data[k];
    }
  });

  // Responsables (1..3, permite repetidos)
  if (body.responsables !== undefined) {
    const resp = sanitizeResponsables(body.responsables);
    if (resp.length > 0) data.responsables = resp;
  }

  // Módulos (se valida por Mongoose)
  if (Array.isArray(body.modulosAsignados)) data.modulosAsignados = body.modulosAsignados;

  return data;
}

// --- Controllers ---

// Buscar por nombre parcial o DNI
const buscarPaciente = async (req, res) => {
  try {
    const { nombre } = req.query;
    if (!nombre) return res.status(400).json({ error: 'Falta el nombre o DNI' });

    const nombreLimpio = String(nombre).replace(/\./g, '');
    const regex = new RegExp(nombreLimpio, 'i');

    const pacientes = await Paciente.find({
      $or: [{ nombre: regex }, { dni: regex }]
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
    console.error('❌ Error al obtener por DNI:', error);
    res.status(500).json({ error: 'Error interno' });
  }
};

// Crear nuevo
const crearPaciente = async (req, res) => {
  try {
    const data = buildPacienteData(req.body, null);

    if (!data.responsables || data.responsables.length === 0) {
      return res.status(400).json({ error: 'Debe incluir al menos un responsable (padre/madre/tutor).' });
    }

    // si viene estado y NO viene historial, el pre('save') del modelo cargará el estado inicial
    const nuevo = new Paciente(data);
    await nuevo.save();
    res.status(201).json(nuevo);
  } catch (error) {
    console.error('❌ Error al crear paciente:', error);
    if (error?.code === 11000 && error?.keyPattern?.dni) {
      const existente = await Paciente.findOne({ dni: req.body.dni }).lean();
      return res.status(409).json({ error: 'El DNI ya existe', dni: req.body.dni, existente });
    }
    if (error?.name === 'ValidationError') {
      const detalles = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({ error: 'Validación fallida', detalles });
    }
    res.status(500).json({ error: 'No se pudo crear paciente' });
  }
};

// Actualizar
const actualizarPaciente = async (req, res) => {
  try {
    const { dni } = req.params;
    const paciente = await Paciente.findOne({ dni });
    if (!paciente) return res.status(404).json({ error: 'No encontrado' });

    const data = buildPacienteData(req.body, paciente);

    // ===== AUDITORÍA: datos del usuario que modifica (del token) =====
    const actor = {
      usuarioId: req.user?.id || null,
      usuario: req.user?.usuario || null,
      nombre: req.user?.nombreApellido || null  // viene del token (login actualizado)
    };
    // =================================================================

    // Si cambia el estado, agregamos entrada al historial (con snapshot completo)
    const nuevoEstado = req.body.estado;
    const descripcionEstado = req.body.descripcionEstado || req.body.estadoDescripcion || '';
    if (
      nuevoEstado !== undefined &&
      ESTADOS.has(String(nuevoEstado)) &&
      String(nuevoEstado) !== String(paciente.estado || '')
    ) {
      const estadoAnterior = String(paciente.estado ?? '—');
      const estadoNuevo    = String(nuevoEstado);

      paciente.estado = estadoNuevo;
      if (!Array.isArray(paciente.estadoHistorial)) paciente.estadoHistorial = [];

      paciente.estadoHistorial.push({
        // compat y datos explícitos para el render
        estado: estadoNuevo,
        estadoAnterior,
        estadoNuevo,
        fecha: new Date(),
        descripcion: descripcionEstado,
        cambiadoPor: actor
      });
    }

    // Asignar el resto de campos (ignorar cambio de DNI y estado: ya se manejó)
    for (const [k, v] of Object.entries(data)) {
      if (k === 'dni' || k === 'estado') continue;
      paciente[k] = (typeof v === 'string') ? v.trim() : v;
    }

    await paciente.save();
    res.json(paciente);
  } catch (error) {
    console.error('❌ Error al actualizar:', error);
    if (error?.name === 'ValidationError') {
      const detalles = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({ error: 'Validación fallida', detalles });
    }
    res.status(500).json({ error: 'Error al actualizar' });
  }
};


module.exports = {
  buscarPaciente,
  obtenerPorDNI,
  crearPaciente,
  actualizarPaciente
};

