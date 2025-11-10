// jobs/generarCargos.js
let cron = null;
try {
  cron = require("node-cron");
} catch (e) {
  console.warn("⚠️ node-cron no instalado. El job de cargos no se programará automáticamente.");
}

const Paciente = require("../models/pacientes");
const Usuario  = require("../models/usuarios");
const Modulo   = require("../models/modulos");
const Area     = require("../models/area"); // puede que no se use directamente, lo dejamos por compatibilidad
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

function getPrecioModulo(modulo) {
  const cands = ["precio", "valor", "monto", "arancel", "importe", "tarifa"];
  for (const k of cands) {
    const v = modulo?.[k];
    if (typeof v === "number") return v;
    if (typeof v === "string" && v.trim()) {
      const n = Number(v.replace(/\./g, "").replace(",", "."));
      if (!isNaN(n)) return n;
    }
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

/* =============== Cargos para TODO el mes (cron/masivo) =============== */
async function generarCargosDelMes(period = yyyymm()) {
  const pacientes = await Paciente.find({ estado: "Alta" }).lean();
  if (!pacientes.length) return { pacientes: 0, cargos: 0 };

  const modIds = new Set();
  const areaIds = new Set();
  const userIds = new Set();

  for (const p of pacientes) {
    for (const a of (p.modulosAsignados || [])) {
      if (a.moduloId) modIds.add(String(a.moduloId));
      for (const pr of (a.profesionales || [])) {
        if (pr.areaId) areaIds.add(String(pr.areaId));
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

  let creados = 0;

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

      const cantidad = Number(asig.cantidad ?? 1) || 1;
      const base     = getPrecioModulo(modulo);
      const total    = +(base * cantidad).toFixed(2);
      const profesionalNombre = pickProfesionalNombre(asig, userById);

      // Upsert idempotente del CARGO
      try {
        await Mov.updateOne(
          { dni, areaId, moduloId, period, tipo: "CARGO" },
          {
            $setOnInsert: {
              pacienteId: pid,
              descripcion: `Cargo ${period} - ${modulo.nombre || modulo.numero || "Módulo"}`,
              monto: total,
              cantidad,
              profesional: profesionalNombre,
              fecha: new Date(),
              estado: "PENDIENTE"
            }
          },
          { upsert: true }
        );
        creados++;
      } catch (e) {
        if (e.code !== 11000) console.error("cargo upsert", e);
      }
    }
  }
  return { pacientes: pacientes.length, cargos: creados };
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

    const cantidad = Number(asig.cantidad ?? 1) || 1;
    const base     = getPrecioModulo(modulo);
    const total    = +(base * cantidad).toFixed(2);
    const profesionalNombre = pickProfesionalNombre(asig, userById);

    try {
      await Mov.updateOne(
        { dni, areaId, moduloId, period, tipo: "CARGO" },
        {
          $setOnInsert: {
            pacienteId: p._id,
            descripcion: `Cargo ${period} - ${modulo.nombre || modulo.numero || "Módulo"}`,
            monto: total,
            cantidad,
            profesional: profesionalNombre,
            fecha: new Date(),
            estado: "PENDIENTE"
          }
        },
        { upsert: true }
      );
      creados++;
    } catch (e) {
      if (e.code !== 11000) console.error("cargo upsert paciente", e);
    }
  }

  return { ok: true, created: creados };
}

/* =============== Programación (cron) =============== */
function schedule() {
  if (!cron) return; // sin cron, no programes
  cron.schedule("15 2 * * *", async () => {
    try {
      await generarCargosDelMes(); // mes actual
    } catch (e) {
      console.error("❌ Error en generarCargosDelMes:", e);
    }
  }, { timezone: "America/Argentina/Buenos_Aires" });
}

/* =============== Exports =============== */
module.exports = {
  schedule,
  generarCargosDelMes,
  generarCargosParaPaciente, // <-- nuevo
  yyyymm
};


