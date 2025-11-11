// controllers/pacientescontrollers.js
const mongoose = require("mongoose");
const Paciente = require("../models/pacientes");
// ⬅️ NUEVO: import directo del job para disparar cargos cuando corresponde
const { generarCargosParaPaciente } = require("../jobs/generarCargos");

// --- Validaciones básicas ---
const WSP_RE  = /^\d{10,15}$/;                // solo dígitos, 10–15
const DNI_RE  = /^\d{7,8}$/;                  // 7–8 dígitos
const DOC_RE  = /^\d{7,13}$/;                 // DNI (7-8) o CUIT (11). Permitimos 7–13 para flexibilidad
const MAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/; // formato simple
const CP_OK   = new Set(["Obra Social", "Particular", "Obra Social + Particular"]);
const ESTADOS = new Set(["Alta", "Baja", "En espera"]);

// --- Helpers ---
function toStr(x) { return (x ?? "").toString(); }
function onlyDigits(s) { return toStr(s).replace(/\D+/g, ""); }
function getActor(req) {
  const id = req.user?._id || req.user?.id || req.userId || null;
  const usuario = req.user?.usuario || req.user?.email || null;
  const nombre  = req.user?.nombreApellido || req.user?.nombre || null;
  return { usuarioId: id || undefined, usuario: usuario || undefined, nombre: nombre || undefined };
}

// Permite repetidos y limita a 3. E-mail opcional y validado. NUEVO: documento opcional (DNI/CUIT)
function sanitizeResponsables(responsables) {
  if (!Array.isArray(responsables)) return [];
  const out = [];

  for (const r0 of responsables) {
    const relacion  = toStr(r0.relacion).trim().toLowerCase(); // padre | madre | tutor
    const nombre    = toStr(r0.nombre).trim();
    const whatsapp  = onlyDigits(r0.whatsapp);
    const emailRaw  = toStr(r0.email).trim().toLowerCase();
    const documento = onlyDigits(r0.documento); // ← NUEVO

    if (!["padre", "madre", "tutor"].includes(relacion)) continue;
    if (!nombre) continue;
    if (!WSP_RE.test(whatsapp)) continue;

    const r = { relacion, nombre, whatsapp };
    if (emailRaw) {
      if (!MAIL_RE.test(emailRaw)) continue;
      r.email = emailRaw;
    }
    if (documento && DOC_RE.test(documento)) {
      r.documento = documento;
    }

    out.push(r);
    if (out.length >= 3) break;
  }
  return out;
}

// --- Normalizador de módulos especiales (acepta variantes de nombres)
function pickModulosEspeciales(body) {
  const candidates = [
    "modulosEspecialesAsignados",
    "modulosEspeciales",
    "eventosEspecialesAsignados",
    "modulosEventoEspecial",
    "modulos_evento_especial"
  ];
  for (const k of candidates) {
    if (Array.isArray(body?.[k])) return body[k];
  }
  return undefined;
}

// Construye payload permitido; ignora campos no soportados.
function buildPacienteData(body, existing = null) {
  const data = {};

  // Campos simples (se asignan tal cual si vienen definidos)
  const simples = [
    "nombre", "fechaNacimiento", "colegio", "curso",
    "colegioMail",
    "condicionDePago", "estado",
    "areas", "planPaciente", "fechaBaja", "motivoBaja",
    "prestador", "credencial", "tipo"
  ];
  for (const k of simples) {
    if (body[k] !== undefined && body[k] !== null) data[k] = body[k];
  }

  // DNI solo al crear
  if (!existing && body.dni !== undefined) {
    const dni = toStr(body.dni).trim();
    if (DNI_RE.test(dni)) data.dni = dni;
  }

  // Condición de pago válida
  if (data.condicionDePago && !CP_OK.has(data.condicionDePago)) {
    delete data.condicionDePago;
  }

  // Normalizar mail de colegio (opcional)
  if (data.colegioMail !== undefined) {
    const m = toStr(data.colegioMail).trim().toLowerCase();
    data.colegioMail = m && MAIL_RE.test(m) ? m : undefined;
    if (data.colegioMail === undefined) delete data.colegioMail;
  }

  // Responsables (1..3, con validaciones) — incluye documento opcional
  if (body.responsables !== undefined) {
    const resp = sanitizeResponsables(body.responsables);
    if (resp.length) data.responsables = resp;
  }

  // Módulos comunes (el schema valida)
  if (Array.isArray(body.modulosAsignados)) {
    data.modulosAsignados = body.modulosAsignados;
  }

  // ✅ Módulos ESPECIALES: acepta varios nombres y mapea a modulosEspecialesAsignados
  const especiales = pickModulosEspeciales(body);
  if (Array.isArray(especiales)) {
    data.modulosEspecialesAsignados = especiales.map(e => {
      const moduloId = e?.moduloId || e?.modulo || e?.id || e?._id;
      const cantidad = (e?.cantidad == null ? 1 : Number(e.cantidad));
      const profesionales = Array.isArray(e?.profesionales) ? e.profesionales
                         : Array.isArray(e?.coordinadoresExternos) ? e.coordinadoresExternos
                         : [];
      return {
        moduloId,
        cantidad: isNaN(cantidad) ? 1 : cantidad,
        profesionales
      };
    });
  }

  // Limpieza de strings
  for (const [k, v] of Object.entries(data)) {
    if (typeof v === "string") data[k] = v.trim();
  }

  return data;
}

// ========================= Controllers =========================

// GET /api/pacientes/buscar?nombre=...
const buscarPaciente = async (req, res) => {
  try {
    const q = toStr(req.query.nombre).trim();
    if (!q) return res.status(400).json({ error: "Falta el nombre o DNI" });

    const limpio = q.replace(/\./g, "");
    const regex = new RegExp(limpio, "i");

    const pacientes = await Paciente.find({
      $or: [{ nombre: regex }, { dni: regex }]
    }).lean();

    res.json(pacientes);
  } catch (err) {
    console.error("❌ Error al buscar paciente:", err);
    res.status(500).json({ error: "Error al buscar paciente" });
  }
};

// GET /api/pacientes/:dni
const obtenerPorDNI = async (req, res) => {
  try {
    const dni = toStr(req.params.dni).trim();
    const paciente = await Paciente.findOne({ dni }).lean();
    if (!paciente) return res.status(404).json({ error: "No encontrado" });
    res.json(paciente);
  } catch (err) {
    console.error("❌ Error al obtener por DNI:", err);
    res.status(500).json({ error: "Error interno" });
  }
};

// POST /api/pacientes
const crearPaciente = async (req, res) => {
  try {
    const data = buildPacienteData(req.body, null);

    if (!data.dni) {
      return res.status(400).json({ error: "DNI inválido o faltante" });
    }
    if (!data.responsables || data.responsables.length === 0) {
      return res.status(400).json({ error: "Debe incluir al menos un responsable (padre/madre/tutor)" });
    }

    // Fuerza estado inicial y compone historial
    const actor = getActor(req);
    const observacion = toStr(req.body.observacionCreacion || req.body.descripcionEstado).trim();

    // (igual que antes) estado inicial "En espera"
    data.estado = "En espera";
    data.estadoHistorial = [{
      estadoAnterior: undefined,
      estadoNuevo: "En espera",
      estado: "En espera",
      fecha: new Date(),
      descripcion: observacion || "Estado inicial",
      cambiadoPor: actor
    }];

    if ("creadoPor" in Paciente.schema.paths) {
      data.creadoPor = actor.usuarioId;
    }

    const nuevo = new Paciente(data);
    await nuevo.save();

    // ⬅️ NUEVO: si entró ya en Alta por algún flujo, disparamos cargos
    if (nuevo.estado === "Alta") {
      generarCargosParaPaciente(nuevo.dni).catch(console.error); // no bloquea
    }

    res.status(201).json(nuevo);
  } catch (err) {
    console.error("❌ Error al crear paciente:", err);

    if (err?.code === 11000 && err?.keyPattern?.dni) {
      const existente = await Paciente.findOne({ dni: toStr(req.body.dni).trim() }).lean();
      return res.status(409).json({ error: "El DNI ya existe", dni: req.body.dni, existente });
    }

    if (err?.name === "ValidationError") {
      const detalles = Object.values(err.errors).map(e => e.message);
      return res.status(400).json({ error: "Validación fallida", detalles });
    }

    res.status(500).json({ error: "No se pudo crear paciente" });
  }
};

// PUT /api/pacientes/:dni
const actualizarPaciente = async (req, res) => {
  try {
    const dni = toStr(req.params.dni).trim();
    const paciente = await Paciente.findOne({ dni });
    if (!paciente) return res.status(404).json({ error: "No encontrado" });

    // ⬅️ NUEVO: snapshots antes de tocar nada (para decidir si disparamos cargos)
    const antesEstado = paciente.estado || null;
    const antesMods   = JSON.stringify(paciente.modulosAsignados || []);

    const data = buildPacienteData(req.body, paciente);
    const actor = getActor(req);

    // Cambio de estado → historial
    const nuevoEstado = req.body.estado;
    const descripcionEstado = toStr(req.body.descripcionEstado || req.body.estadoDescripcion).trim();

    if (
      nuevoEstado !== undefined &&
      ESTADOS.has(String(nuevoEstado)) &&
      String(nuevoEstado) !== String(paciente.estado || "")
    ) {
      const anterior = paciente.estado || undefined;
      const nuevo    = String(nuevoEstado);

      if (!Array.isArray(paciente.estadoHistorial)) paciente.estadoHistorial = [];
      paciente.estadoHistorial.push({
        estadoAnterior: anterior,
        estadoNuevo: nuevo,
        estado: nuevo,
        fecha: new Date(),
        descripcion: descripcionEstado || undefined,
        cambiadoPor: actor
      });

      paciente.estado = nuevo;

      if (nuevo === "Baja") {
        if (req.body.fechaBaja)  paciente.fechaBaja  = toStr(req.body.fechaBaja).trim();
        if (req.body.motivoBaja) paciente.motivoBaja = toStr(req.body.motivoBaja).trim();
      }
    }

    // Asignar resto (dni y estado ya tratados)
    for (const [k, v] of Object.entries(data)) {
      if (k === "dni" || k === "estado") continue;
      paciente[k] = typeof v === "string" ? v.trim() : v;
    }

    await paciente.save();

    // ⬅️ NUEVO: dispara cargos si pasó a Alta o cambiaron módulos (comparando snapshots)
    const pasoAAlta     = (antesEstado !== "Alta") && (paciente.estado === "Alta");
    const cambioModulos = (antesMods !== JSON.stringify(paciente.modulosAsignados || []));
    if (pasoAAlta || cambioModulos) {
      generarCargosParaPaciente(paciente.dni).catch(console.error); // fire-and-forget
    }

    res.json(paciente);
  } catch (err) {
    console.error("❌ Error al actualizar:", err);

    if (err?.name === "ValidationError") {
      const detalles = Object.values(err.errors).map(e => e.message);
      return res.status(400).json({ error: "Validación fallida", detalles });
    }

    res.status(500).json({ error: "Error al actualizar" });
  }
};

// GET /api/pacientes?limit=20&sort=nombre|created
const listarPacientes = async (req, res) => {
  try {
    const { nombre, dni, limit = 20, sort } = req.query;
    const LIM = Math.min(parseInt(limit, 10) || 20, 100);

    if (nombre || dni) {
      const qNombre = (nombre || '').toString().trim();
      const qDni    = (dni || '').toString().trim();
      const regex   = qNombre ? new RegExp(qNombre.replace(/\./g, ''), 'i') : null;

      const where = [];
      if (qNombre) where.push({ nombre: regex });
      if (qDni)    where.push({ dni: new RegExp(qDni, 'i') });

      const pacientes = await Paciente.find(where.length ? { $or: where } : {})
        .select('nombre dni estado condicionDePago')
        .sort(sort === 'created' ? { createdAt: -1 } : { nombre: 1 })
        .limit(LIM)
        .lean();

      return res.json(pacientes);
    }

    const pacientes = await Paciente.find({})
      .select('nombre dni estado condicionDePago')
      .sort(sort === 'created' ? { createdAt: -1 } : { nombre: 1 })
      .limit(LIM)
      .lean();

    res.json(pacientes);
  } catch (err) {
    console.error('❌ Error al listar pacientes:', err);
    res.status(500).json({ error: 'Error al listar pacientes' });
  }
};

/* ============================================================================
   DOCUMENTOS PERSONALES (metadata R2)
   ============================================================================ */

// POST /api/pacientes/:dni/documentos
const agregarDocumento = async (req, res) => {
  try {
    const dni = toStr(req.params.dni).trim();
    const p = await Paciente.findOne({ dni });
    if (!p) return res.status(404).json({ error: "Paciente no encontrado" });

    const { fecha, tipo, observaciones, archivoKey, archivoURL } = req.body || {};
    if (!fecha || !tipo || !archivoKey || !archivoURL) {
      return res.status(400).json({ error: "fecha, tipo, archivoKey y archivoURL son obligatorios" });
    }

    if (!Array.isArray(p.documentosPersonales)) p.documentosPersonales = [];
    const doc = {
      _id: new mongoose.Types.ObjectId(),
      fecha: toStr(fecha).trim(),
      tipo: toStr(tipo).trim(),
      observaciones: toStr(observaciones || "").trim() || undefined,
      archivoKey: toStr(archivoKey).trim(),
      archivoURL: toStr(archivoURL).trim(),
      creadoEn: new Date()
    };

    p.documentosPersonales.push(doc);
    await p.save();

    res.status(201).json({ ok: true, documento: doc, documentos: p.documentosPersonales });
  } catch (err) {
    console.error("❌ agregarDocumento:", err);
    res.status(500).json({ error: "No se pudo agregar el documento" });
  }
};

// PUT /api/pacientes/:dni/documentos/:id
// Fallback: /api/pacientes/:dni/documentos?index=#
const actualizarDocumento = async (req, res) => {
  try {
    const dni = toStr(req.params.dni).trim();
    const p = await Paciente.findOne({ dni });
    if (!p) return res.status(404).json({ error: "Paciente no encontrado" });

    if (!Array.isArray(p.documentosPersonales)) p.documentosPersonales = [];

    let idx = -1;
    if (req.params.id) {
      const id = req.params.id;
      idx = p.documentosPersonales.findIndex(d => String(d._id) === String(id) || String(d.id) === String(id));
    } else if (req.query.index != null) {
      idx = parseInt(req.query.index, 10);
    }
    if (idx < 0 || idx >= p.documentosPersonales.length) {
      return res.status(404).json({ error: "Documento no encontrado" });
    }

    const { fecha, tipo, observaciones, archivoKey, archivoURL } = req.body || {};
    const doc = p.documentosPersonales[idx];

    if (fecha !== undefined) doc.fecha = toStr(fecha).trim();
    if (tipo !== undefined)  doc.tipo  = toStr(tipo).trim();
    if (observaciones !== undefined) {
      const v = toStr(observaciones).trim();
      doc.observaciones = v || undefined;
    }
    if (archivoKey !== undefined) doc.archivoKey = toStr(archivoKey).trim();
    if (archivoURL !== undefined) doc.archivoURL = toStr(archivoURL).trim();

    doc.actualizadoEn = new Date();

    await p.save();
    res.json({ ok: true, documento: doc, documentos: p.documentosPersonales });
  } catch (err) {
    console.error("❌ actualizarDocumento:", err);
    res.status(500).json({ error: "No se pudo actualizar el documento" });
  }
};

// DELETE /api/pacientes/:dni/documentos/:id
// Fallback: /api/pacientes/:dni/documentos?index=#
const eliminarDocumento = async (req, res) => {
  try {
    const dni = toStr(req.params.dni).trim();
    const p = await Paciente.findOne({ dni });
    if (!p) return res.status(404).json({ error: "Paciente no encontrado" });

    if (!Array.isArray(p.documentosPersonales)) p.documentosPersonales = [];

    let idx = -1;
    if (req.params.id) {
      const id = req.params.id;
      idx = p.documentosPersonales.findIndex(d => String(d._id) === String(id) || String(d.id) === String(id));
    } else if (req.query.index != null) {
      idx = parseInt(req.query.index, 10);
    }
    if (idx < 0 || idx >= p.documentosPersonales.length) {
      return res.status(404).json({ error: "Documento no encontrado" });
    }

    const removed = p.documentosPersonales.splice(idx, 1)[0];
    await p.save();
    res.json({ ok: true, eliminado: removed, documentos: p.documentosPersonales });
  } catch (err) {
    console.error("❌ eliminarDocumento:", err);
    res.status(500).json({ error: "No se pudo eliminar el documento" });
  }
};

/* ============================================================================
   DIAGNÓSTICOS (metadata R2)
   ============================================================================ */

// POST /api/pacientes/:dni/diagnosticos
const agregarDiagnostico = async (req, res) => {
  try {
    const dni = toStr(req.params.dni).trim();
    const p = await Paciente.findOne({ dni });
    if (!p) return res.status(404).json({ error: "Paciente no encontrado" });

    const { fecha, area, observaciones, archivoKey, archivoURL } = req.body || {};
    if (!fecha || !area || !archivoKey || !archivoURL) {
      return res.status(400).json({ error: "fecha, área, archivoKey y archivoURL son obligatorios" });
    }

    if (!Array.isArray(p.diagnosticos)) p.diagnosticos = [];
    const dx = {
      _id: new mongoose.Types.ObjectId(),
      fecha: toStr(fecha).trim(),
      area: toStr(area).trim(),
      observaciones: toStr(observaciones || "").trim() || undefined,
      archivoKey: toStr(archivoKey).trim(),
      archivoURL: toStr(archivoURL).trim(),
      creadoEn: new Date()
    };

    p.diagnosticos.push(dx);
    await p.save();

    res.status(201).json({ ok: true, diagnostico: dx, diagnosticos: p.diagnosticos });
  } catch (err) {
    console.error("❌ agregarDiagnostico:", err);
    res.status(500).json({ error: "No se pudo agregar el diagnóstico" });
  }
};

// PUT /api/pacientes/:dni/diagnosticos/:id
// Fallback: /api/pacientes/:dni/diagnosticos?index=#
const actualizarDiagnostico = async (req, res) => {
  try {
    const dni = toStr(req.params.dni).trim();
    const p = await Paciente.findOne({ dni });
    if (!p) return res.status(404).json({ error: "Paciente no encontrado" });

    if (!Array.isArray(p.diagnosticos)) p.diagnosticos = [];

    let idx = -1;
    if (req.params.id) {
      const id = req.params.id;
      idx = p.diagnosticos.findIndex(d => String(d._id) === String(id) || String(d.id) === String(id));
    } else if (req.query.index != null) {
      idx = parseInt(req.query.index, 10);
    }
    if (idx < 0 || idx >= p.diagnosticos.length) {
      return res.status(404).json({ error: "Diagnóstico no encontrado" });
    }

    const { fecha, area, observaciones, archivoKey, archivoURL } = req.body || {};
    const dx = p.diagnosticos[idx];

    if (fecha !== undefined) dx.fecha = toStr(fecha).trim();
    if (area !== undefined)  dx.area  = toStr(area).trim();
    if (observaciones !== undefined) {
      const v = toStr(observaciones).trim();
      dx.observaciones = v || undefined;
    }
    if (archivoKey !== undefined) dx.archivoKey = toStr(archivoKey).trim();
    if (archivoURL !== undefined) dx.archivoURL = toStr(archivoURL).trim();

    dx.actualizadoEn = new Date();

    await p.save();
    res.json({ ok: true, diagnostico: dx, diagnosticos: p.diagnosticos });
  } catch (err) {
    console.error("❌ actualizarDiagnostico:", err);
    res.status(500).json({ error: "No se pudo actualizar el diagnóstico" });
  }
};

// DELETE /api/pacientes/:dni/diagnosticos/:id
// Fallback: /api/pacientes/:dni/diagnosticos?index=#
const eliminarDiagnostico = async (req, res) => {
  try {
    const dni = toStr(req.params.dni).trim();
    const p = await Paciente.findOne({ dni });
    if (!p) return res.status(404).json({ error: "Paciente no encontrado" });

    if (!Array.isArray(p.diagnosticos)) p.diagnosticos = [];

    let idx = -1;
    if (req.params.id) {
      const id = req.params.id;
      idx = p.diagnosticos.findIndex(d => String(d._id) === String(id) || String(d.id) === String(id));
    } else if (req.query.index != null) {
      idx = parseInt(req.query.index, 10);
    }
    if (idx < 0 || idx >= p.diagnosticos.length) {
      return res.status(404).json({ error: "Diagnóstico no encontrado" });
    }

    const removed = p.diagnosticos.splice(idx, 1)[0];
    await p.save();
    res.json({ ok: true, eliminado: removed, diagnosticos: p.diagnosticos });
  } catch (err) {
    console.error("❌ eliminarDiagnostico:", err);
    res.status(500).json({ error: "No se pudo eliminar el diagnóstico" });
  }
};

module.exports = {
  listarPacientes,
  buscarPaciente,
  obtenerPorDNI,
  crearPaciente,
  actualizarPaciente,

  agregarDocumento,
  actualizarDocumento,
  eliminarDocumento,

  agregarDiagnostico,
  actualizarDiagnostico,
  eliminarDiagnostico
};

