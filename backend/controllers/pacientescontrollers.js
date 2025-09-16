const Paciente = require('../models/pacientes');

// --- Helpers ---
const WSP_RE  = /^\d{10,15}$/;
const DNI_RE  = /^\d{7,8}$/;
const MAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CP_OK   = new Set(['Obra Social', 'Particular', 'Obra Social + Particular']);

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

// Construye el payload final y resuelve compat con schema viejo (tutor)
function buildPacienteData(body, existing = null) {
  const data = {};

  // Campos simples permitidos (usa condicionDePago, no abonado)
  const simples = [
    'nombre','fechaNacimiento','colegio','curso','mail','condicionDePago','estado',
    'areas','planPaciente','fechaBaja','motivoBaja',
    'prestador','credencial','tipo'
  ];
  for (const k of simples) {
    if (body[k] !== undefined && body[k] !== null) data[k] = body[k];
  }

  // DNI solo al crear
  if (!existing && body.dni !== undefined) data.dni = String(body.dni).trim();

  // Normalizaciones suaves
  if (data.mail) data.mail = String(data.mail).trim().toLowerCase();
  if (data.condicionDePago && !CP_OK.has(data.condicionDePago)) delete data.condicionDePago;

  // Validaciones suaves (Mongoose valida fuerte)
  if (data.dni && !DNI_RE.test(data.dni)) delete data.dni;
  if (data.mail && !MAIL_RE.test(data.mail)) delete data.mail;

  // Responsables (nuevo modelo)
  if (body.responsables !== undefined) {
    const resp = sanitizeResponsables(body.responsables);
    if (resp.length > 0) data.responsables = resp;

    // Compat con schema legacy `tutor`
    const t = resp.find(r => r.relacion === 'tutor');
    if (t) data.tutor = { nombre: t.nombre, whatsapp: t.whatsapp };
    else data.tutor = undefined;
  } else if (!existing) {
    // Alta sin responsables explícitos: intentar mapear legacy si vinieran
    const tn  = body?.tutor?.nombre || '';
    const tw  = body?.tutor?.whatsapp || '';
    const mpn = body?.madrePadre || '';
    const mpw = body?.whatsappMadrePadre || '';

    const cand = [];
    if (tn && tw) cand.push({ relacion: 'tutor', nombre: tn, whatsapp: tw });
    if (mpn) cand.push({
      relacion: /madre/i.test(mpn) ? 'madre' : 'padre',
      nombre: mpn.replace(/^(madre|padre)\s*:\s*/i, '').trim(),
      whatsapp: mpw
    });

    const resp = sanitizeResponsables(cand);
    if (resp.length > 0) {
      data.responsables = resp;
      const t = resp.find(r => r.relacion === 'tutor');
      if (t) data.tutor = { nombre: t.nombre, whatsapp: t.whatsapp };
    }
  }

  // Módulos asignados
  if (Array.isArray(body.modulosAsignados)) data.modulosAsignados = body.modulosAsignados;

  // Legacy opcional (mientras migres)
  if (body.tutor) data.tutor = body.tutor;
  if (body.madrePadre !== undefined) data.madrePadre = body.madrePadre;
  if (body.whatsappMadrePadre !== undefined) data.whatsappMadrePadre = body.whatsappMadrePadre;

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

    const nuevo = new Paciente(data);
    await nuevo.save();
    res.status(201).json(nuevo);
  } catch (error) {
    console.error('❌ Error al crear paciente:', error);
    if (error?.code === 11000 && error?.keyPattern?.dni) {
      // Devolvé el existente para abrirlo desde el front
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

    // Asignar campos simples (ignorar intento de cambiar DNI)
    for (const [k, v] of Object.entries(data)) {
      if (k === 'dni') continue;
      paciente[k] = (typeof v === 'string') ? v.trim() : v;
    }

    // Compat de tutor al actualizar responsables
    if (Array.isArray(data.responsables)) {
      const t = data.responsables.find(r => r.relacion === 'tutor');
      if (t) paciente.tutor = { nombre: t.nombre, whatsapp: t.whatsapp };
      else paciente.tutor = undefined; // asegurate de que no sea required en schema legacy
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
