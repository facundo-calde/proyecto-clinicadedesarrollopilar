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
  return period >= d && period <= h;
}

function parseNumberLike(v) {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v.replace(/\./g, "").replace(",", "."));
    if (!isNaN(n)) return n;
  }
  return 0;
}

function normalizeCantidad(v) {
  if (v == null) return 1;
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  const s = String(v).trim();
  if (/^\d+\s*\/\s*\d+$/.test(s)) {
    const [a, b] = s.split("/").map(n => parseFloat(n));
    if (b && !Number.isNaN(a) && !Number.isNaN(b)) return a / b;
  }
  const n = Number(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function mkAsigKey({ moduloId, cantidad, areaId, profesionalId }) {
  const mid = moduloId ? String(moduloId) : "";
  const aid = areaId ? String(areaId) : "";
  const pid = profesionalId ? String(profesionalId) : "";
  return [mid, cantidad, aid, pid].join("|");
}

/** Avanzar un mes: "2025-03" -> "2025-04" */
function nextPeriod(period) {
  if (!period || !/^\d{4}-\d{2}$/.test(period)) return period;
  let y = parseInt(period.slice(0, 4), 10);
  let m = parseInt(period.slice(5, 7), 10);
  m += 1;
  if (m > 12) {
    m = 1;
    y += 1;
  }
  return `${y}-${String(m).padStart(2, "0")}`;
}

/**
 * Precio del cargo:
 * 1) Si la asignación trae override (precio/valor/monto/arancel/importe/tarifa), usarlo.
 * 2) Si no, usar modulo.valorPadres.
 */
function getPrecioDesdeValorPadres(modulo, { asig }) {
  // 1) Override desde la asignación (si viene algo ahí, manda eso)
  const overrideCands = [
    asig?.precio,
    asig?.valor,
    asig?.monto,
    asig?.arancel,
    asig?.importe,
    asig?.tarifa,
    asig?.valorPadres,
    asig?.valorModulo,     // <- por si en la asignación vino con este nombre
  ];

  const override = overrideCands
    .map(parseNumberLike)
    .find(n => n > 0);

  if (override) return override;

  // 2) Fallback: campos del MÓDULO
  const moduloCands = [
    modulo?.valorPadres,
    modulo?.valorModulo,   // <- ACA agregamos esto
    modulo?.precioModulo,
    modulo?.precio,
    modulo?.valor,
    modulo?.monto,
    modulo?.arancel,
    modulo?.importe,
    modulo?.tarifa,
  ];

  const base = moduloCands
    .map(parseNumberLike)
    .find(n => n > 0);

  return base || 0;
}


function pickProfesionalNombre(asig, cacheUsuarios) {
  const arr = Array.isArray(asig?.profesionales) ? asig.profesionales : [];
  const id = arr[0]?.profesionalId || arr[0]?._id || arr[0];
  if (!id) return undefined;
  const u = cacheUsuarios?.get(String(id));
  return u?.nombreApellido || u?.usuario || u?.nombre || undefined;
}

/* =============== Core Upsert (reutilizable) =============== */
/**
 * Upsert del cargo del período. Evita duplicados usando asigKey.
 * Acá sólo manejamos MÓDULOS MENSUALES (no eventos especiales).
 */
async function upsertCargo({
  dni,
  pacienteId,
  areaId,
  areaNombre,
  modulo,
  moduloId,
  period,
  cantidad,
  profesionalNombre,
  asignacion,
}) {
  const cant  = normalizeCantidad(cantidad);
  const base  = getPrecioDesdeValorPadres(modulo, { asig: asignacion });
  const total = +(base * (Number(cant) || 1)).toFixed(2);

  const moduloNombre = modulo?.nombre || modulo?.titulo || "";
  const moduloNumero = modulo?.numero || "";
  const descripcion  = `Cargo ${period} — ${moduloNumero ? moduloNumero + ". " : ""}${moduloNombre || "Módulo"}`;

  // asigKey: usar la que viene o construirla
  const p0 = Array.isArray(asignacion?.profesionales) ? asignacion.profesionales[0] || {} : {};
  const areaIdFromAsig = p0?.areaId || areaId;
  const profesionalId  = p0?.profesionalId || p0?._id || p0?.id || undefined;
  const asigKey = asignacion?.asigKey || mkAsigKey({
    moduloId,
    cantidad: cant,
    areaId: areaIdFromAsig,
    profesionalId
  });

  // ------------------ 1) Intento moderno: por asigKey ------------------
  const filterByKey = { dni, period, tipo: "CARGO", asigKey };
  const update = {
    $set: {
      descripcion,
      monto: total,
      cantidad: Number(cant) || 1,
      profesional: profesionalNombre || undefined,
      moduloNombre: moduloNombre || undefined,
      areaNombre: areaNombre || undefined,
      areaId: areaIdFromAsig || areaId,
      moduloId: moduloId,
      // explícitamente marcamos como NO evento especial
      esEventoEspecial: false,
      updatedAt: new Date()
    },
    $setOnInsert: {
      pacienteId,
      fecha: new Date(),
      estado: "PENDIENTE",
      tipo: "CARGO",
      dni,
      period,
      asigKey,
      esEventoEspecial: false
    }
  };

  let res = await Mov.updateOne(filterByKey, update, { upsert: true });
  if (res.matchedCount > 0 || res.upsertedCount > 0) return;

  // ------------------ 2) Compatibilidad: “legacy” (sin asigKey) ------------------
  // Si había uno existente del mismo módulo/área/período, lo adoptamos y le seteamos asigKey.
  const legacyFilter = {
    dni,
    areaId: areaIdFromAsig || areaId,
    moduloId,
    period,
    tipo: "CARGO",
    estado: { $ne: "PAGADO" },
    asigKey: { $exists: false }
  };

  res = await Mov.updateOne(
    legacyFilter,
    {
      $set: {
        ...update.$set,
        asigKey
      },
      $setOnInsert: update.$setOnInsert
    },
    { upsert: true }
  );
  // con esto evitamos que, al re-ejecutar, se vuelvan a crear los anteriores
}

/* =============== Cargos para TODO el mes (cron/masivo) =============== */
/**
 * Genera cargos del MES indicado (period, ej "2025-03") para TODOS los pacientes en Alta.
 * Sólo genera para ese mes puntual (no hace histórico).
 */
async function generarCargosDelMes(period = yyyymm()) {
  const pacientes = await Paciente.find({ estado: "Alta" }).lean();
  if (!pacientes.length) return { pacientes: 0, cargos: 0 };

  // Precarga catálogos
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
  const modById   = new Map(modulos.map(m => [String(m._id), m]));
  const userById  = new Map(usuarios.map(u => [String(u._id), u]));
  const areaById  = new Map(areas.map(a => [String(a._id), a]));

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
      const area   = areaById.get(String(areaId));
      const areaNombre = area?.nombre || area?.titulo || "";

      const createdAt     = p.createdAt || p.creadoEl || new Date();
      const createdPeriod = yyyymm(new Date(createdAt));
      const desdeMes      = asig.desdeMes || createdPeriod;
      const hastaMes      = asig.hastaMes || null;

      // este job masivo sigue siendo "por mes": sólo actúa si ese period puntual está dentro del rango
      if (!inRange(period, desdeMes, hastaMes)) continue;

      const profesionalNombre = pickProfesionalNombre(asig, userById);
      const cantidad = asig.cantidad;

      try {
        await upsertCargo({
          dni,
          pacienteId: pid,
          areaId,
          areaNombre,
          modulo,
          moduloId,
          period,
          cantidad,
          profesionalNombre,
          asignacion: asig,
        });
        procesados++;
      } catch (e) {
        if (e?.code !== 11000) console.error("cargo upsert (masivo)", e);
      }
    }
  }
  return { pacientes: pacientes.length, cargos: procesados };
}

/* =============== Cargos instantáneos para UN paciente (alta/asignación) =============== */
/**
 * Genera cargos para UN paciente.
 *
 * 🔹 Acá es donde se respeta lo que pediste:
 *   - Si la asignación tiene un `desdeMes` anterior (ej. "2025-01") y hoy estamos en "2025-04",
 *     se generan cargos para TODOS los meses: 2025-01, 2025-02, 2025-03, 2025-04.
 *   - Los cargos se generan una vez por mes gracias al índice único (no duplica).
 */
async function generarCargosParaPaciente(dni, period = yyyymm()) {
  if (!dni) return { ok: false, reason: "dni requerido" };

  const p = await Paciente.findOne({ dni, estado: "Alta" }).lean();
  if (!p) return { ok: true, created: 0 };

  // Precarga
  const modIds  = new Set();
  const userIds = new Set();
  const areaIds = new Set();
  for (const a of (p.modulosAsignados || [])) {
    if (a.moduloId) modIds.add(String(a.moduloId));
    for (const pr of (a.profesionales || [])) {
      if (pr.profesionalId) userIds.add(String(pr.profesionalId));
      if (pr.areaId)        areaIds.add(String(pr.areaId));
    }
  }

  const [modulos, usuarios, areas] = await Promise.all([
    modIds.size  ? Modulo.find({ _id: { $in: [...modIds] } }).lean() : [],
    userIds.size ? Usuario.find({ _id: { $in: [...userIds] } }).lean() : [],
    areaIds.size ? Area.find({ _id: { $in: [...areaIds] } }).lean() : [],
  ]);

  const modById  = new Map(modulos.map(m => [String(m._id), m]));
  const userById = new Map(usuarios.map(u => [String(u._id), u]));
  const areaById = new Map(areas.map(a => [String(a._id), a]));

  let creados = 0;

  for (const asig of (p.modulosAsignados || [])) {
    const moduloId = asig.moduloId;
    const modulo   = modById.get(String(moduloId));
    if (!modulo) continue;

    const areaId = asig.profesionales?.[0]?.areaId;
    if (!areaId) continue;
    const area   = areaById.get(String(areaId));
    const areaNombre = area?.nombre || area?.titulo || "";

    const createdAt     = p.createdAt || p.creadoEl || new Date();
    const createdPeriod = yyyymm(new Date(createdAt));

    let desdeMes = asig.desdeMes || createdPeriod;
    let hastaMes = asig.hastaMes || null;

    // No generar cargos antes de que exista el paciente
    if (desdeMes < createdPeriod) desdeMes = createdPeriod;

    // Límite superior: si hay hastaMes, respetarlo; si no, usamos el "period" que nos pasan (por defecto, mes actual)
    let limiteSuperior = hastaMes || period;

    // Si el rango no tiene sentido, lo salteamos
    if (!inRange(limiteSuperior, desdeMes, limiteSuperior)) continue;

    // Generar cargos de TODOS los meses desde desdeMes hasta limiteSuperior (incluido)
    for (let per = desdeMes; per <= limiteSuperior; per = nextPeriod(per)) {
      try {
        const profesionalNombre = pickProfesionalNombre(asig, userById);
        const cantidad = asig.cantidad;

        await upsertCargo({
          dni,
          pacienteId: p._id,
          areaId,
          areaNombre,
          modulo,
          moduloId,
          period: per,
          cantidad,
          profesionalNombre,
          asignacion: asig,
        });
        creados++;
      } catch (e) {
        if (e?.code !== 11000) console.error("cargo upsert (paciente)", e);
      }
    }
  }

  return { ok: true, created: creados };
}

/* =============== Programación (cron) =============== */
function schedule() {
  if (!cron) return;
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
  generarCargosParaPaciente,
  yyyymm,
};










