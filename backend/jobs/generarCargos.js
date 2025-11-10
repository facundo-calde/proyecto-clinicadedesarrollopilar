// backend/jobs/generarCargos.js
let cron = null;
try {
  cron = require("node-cron");
} catch (e) {
    console.warn("⚠️ node-cron no instalado. El job de cargos no se programará automáticamente.");
}

const Paciente = require("../models/pacientes");
const Usuario  = require("../models/usuarios");
const Modulo   = require("../models/modulos");
const Area     = require("../models/area"); // compat
const Mov      = require("../models/estadoDeCuentaMovimiento");

/* =============== Helpers =============== */
function yyyymm(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function inRange(period, desdeMes, hastaMes) {
  const d = desdeMes || "1900-01";
  const h = hastaMes || "9999-12";
  return (period >= d) && (period <= h);
}

function parseNumberLike(v) {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v.replace(/\./g, "").replace(",", "."));
    if (!isNaN(n)) return n;
  }
  return 0;
}

function getPrecioModulo(modulo) {
  const cands = ["precio", "valor", "monto", "arancel", "importe", "tarifa"];
  for (const k of cands) {
    const n = parseNumberLike(modulo?.[k]);
    if (n) return n;
  }
  return 0;
}

function pickProfesionalNombre(asig, cacheUsuarios) {
  const arr = Array.isArray(asig?.profesionales) ? asig.profesionales : [];
  const id = arr[0]?.profesionalId || arr[0]?._id || arr[0];
  if (!id) return undefined;
  const u = cacheUsuarios?.get(String(id));
  return u?.nombreApellido || u?.usuario || u?.nombre || undefined;
}

/* =============== Core Upsert (reutilizable) =============== */
/** Upsert del cargo del período. Actualiza si existe y NO está PAGADO. */
async function upsertCargo({ dni, pacienteId, areaId, modulo, moduloId, period, cantidad, profesionalNombre }) {
  const base  = getPrecioModulo(modulo);
  const total = +(base * (Number(cantidad ?? 1) || 1)).toFixed(2);

  // 🚫 No tocar cargos ya pagados:
  const filter = { dni, areaId, moduloId, period, tipo: "CARGO", estado: { $ne: "PAGADO" } };

  // Refleja siempre estado actual (si existe y no está pagado → $set actualiza)
  const update = {
    $set: {
      descripcion: `Cargo ${period} - ${modulo.nombre || modulo.numero || "Módulo"}`,
      monto: total,
      cantidad: Number(cantidad ?? 1) || 1,
      profesional: profesionalNombre,
    },
    $setOnInsert: {
      pacienteId,
      fecha: new Date(),
      estado: "PENDIENTE",
    },
  };

  await Mov.updateOne(filter, update, { upsert: true });
}

/* =============== Cargos para TODO el mes (cron/masivo) =============== */
async function generarCargosDelMes(period = yyyymm()) {
  const pacientes = await Paciente.find({ estado: "Alta" }).lean();
  if (!pacientes.length) return { pacientes: 0, cargos: 0 };

  // Precarga de catálogos para minimizar queries
  const modIds  = new Set();
  const areaIds = new Set();
  const userIds = new Set();

  for (const p of pacientes) {
    for (const a of (p.modulosAsignados || [])) {
      if (a.moduloId) modIds.add(String(a.moduloId));
      for (const pr of (a.profesionales || [])) {
        if (pr.areaId)        areaIds.add(String(pr.areaId));
        if (pr.profesionalId) userIds.add(String(pr.profesionalId));
      }
    }
  }

  const [modulos, areas, usuarios] = await Promise.all([
    modIds.size  ? Modulo.find({ _id: { $in: [...modIds] } }).lean() : [],
    areaIds.size ? Area.find({ _id: { $in: [...areaIds] } }).lean() : [],
    userIds.size ? Usuario.find({ _id: { $in: [...userIds] } }).lean() : [],
  ]);
  const modById  = new Map(modulos.map(m => [String(m._id), m]));
  const userById = new Map(usuarios.map(u => [String(u._id), u]));

  let procesados = 0;

  for (const p of pacientes) {
    const dni = p.dni;
    const pid = p._id;

    for (const asig of (p.modulosAsignados || [])) {
      const moduloId = asig.moduloId;
      const modulo   = modById.get(String(moduloId));
      if (!modulo) continue;

      const areaId = asig.profesionales?.[0]?.areaId;
      if (!areaId) continue;

      // Vigencia
      const createdAt = p.createdAt || p.creadoEl || new Date();
      const createdPeriod = yyyymm(new Date(createdAt));
      const desdeMes = asig.desdeMes || createdPeriod;
      const hastaMes = asig.hastaMes || null;
      if (!inRange(period, desdeMes, hastaMes)) continue;

      const profesionalNombre = pickProfesionalNombre(asig, userById);
      const cantidad = Number(asig.cantidad ?? 1) || 1;

      try {
        await upsertCargo({
          dni,
          pacienteId: pid,
          areaId,
          modulo,
          moduloId,
          period,
          cantidad,
          profesionalNombre,
        });
        procesados++;
      } catch (e) {
        // Si hay conflicto de índice, no spamear
        if (e?.code !== 11000) console.error("cargo upsert (masivo)", e);
      }
    }
  }
  return { pacientes: pacientes.length, cargos: procesados };
}

/* =============== Cargos instantáneos para UN paciente (alta/asignación) =============== */
async function generarCargosParaPaciente(dni, period = yyyymm()) {
  if (!dni) return { ok: false, reason: "dni requerido" };

  const p = await Paciente.findOne({ dni, estado: "Alta" }).lean();
  if (!p) return { ok: true, created: 0 };

  // Precarga
  const modIds = new Set();
  const userIds = new Set();
  for (const a of (p.modulosAsignados || [])) {
    if (a.moduloId) modIds.add(String(a.moduloId));
    for (const pr of (a.profesionales || [])) {
      if (pr.profesionalId) userIds.add(String(pr.profesionalId));
    }
  }

  const [modulos, usuarios] = await Promise.all([
    modIds.size  ? Modulo.find({ _id: { $in: [...modIds] } }).lean() : [],
    userIds.size ? Usuario.find({ _id: { $in: [...userIds] } }).lean() : [],
  ]);

  const modById  = new Map(modulos.map(m => [String(m._id), m]));
  const userById = new Map(usuarios.map(u => [String(u._id), u]));

  let creados = 0;

  for (const asig of (p.modulosAsignados || [])) {
    const moduloId = asig.moduloId;
    const modulo   = modById.get(String(moduloId));
    if (!modulo) continue;

    const areaId = asig.profesionales?.[0]?.areaId;
    if (!areaId) continue;

    const createdAt = p.createdAt || p.creadoEl || new Date();
    const createdPeriod = yyyymm(new Date(createdAt));
    const desdeMes = asig.desdeMes || createdPeriod;
    const hastaMes = asig.hastaMes || null;
    if (!inRange(period, desdeMes, hastaMes)) continue;

    const profesionalNombre = pickProfesionalNombre(asig, userById);
    const cantidad = Number(asig.cantidad ?? 1) || 1;

    try {
      await upsertCargo({
        dni,
        pacienteId: p._id,
        areaId,
        modulo,
        moduloId,
        period,
        cantidad,
        profesionalNombre,
      });
      creados++;
    } catch (e) {
      if (e?.code !== 11000) console.error("cargo upsert (paciente)", e);
    }
  }

  return { ok: true, created: creados };
}

/* =============== Programación (cron) =============== */
function schedule() {
  if (!cron) return; // sin cron, no programes
  // 02:15 AM todos los días
  cron.schedule(
    "15 2 * * *",
    async () => {
      try {
        await generarCargosDelMes(); // mes actual
      } catch (e) {
        console.error("❌ Error en generarCargosDelMes:", e);
      }
    },
    { timezone: "America/Argentina/Buenos_Aires" }
  );
}

/* =============== Exports =============== */
module.exports = {
  schedule,
  generarCargosDelMes,
  generarCargosParaPaciente, // para disparar al alta/asignación
  yyyymm,
};


