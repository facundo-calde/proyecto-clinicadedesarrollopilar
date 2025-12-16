// controllers/estadocuentacontrollers.js
const mongoose = require("mongoose");
const PDFDocument = require("pdfkit");
const Paciente = require("../models/pacientes");
const Usuario = require("../models/usuarios");
const Modulo = require("../models/modulos");
const Area = require("../models/area");
const Movimiento = require("../models/estadoDeCuentaMovimiento");
const path = require("path");
const fs = require("fs");


const toStr = (v) => (v ?? "").toString();

function parseCantidad(v) {
  if (v == null) return 1;
  if (typeof v === "number") return v;
  const s = String(v).trim();
  if (!s) return 1;
  if (s.includes("/")) {
    const [a, b] = s.split("/").map(Number);
    if (!isNaN(a) && !isNaN(b) && b !== 0) return a / b;
  }
  const n = Number(s.replace(",", "."));
  return isNaN(n) ? 1 : n;
}

function parseNumberLike(v, def = 0) {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v.replace(/\./g, "").replace(",", "."));
    if (!isNaN(n)) return n;
  }
  return def;
}

function fmtARS(n) {
  const num = Number(n || 0);
  return `$ ${num.toLocaleString("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function getPrecioModulo(mod) {
  if (!mod) return 0;

  const cands = [
    "valorPadres",
    "valorModulo",
    "precioModulo",
    "precio",
    "valor",
    "monto",
    "arancel",
    "importe",
    "tarifa",
  ];

  for (const k of cands) {
    const v = mod[k];
    if (typeof v === "number") {
      return v;
    }
    if (typeof v === "string" && v.trim()) {
      const n = Number(v.replace(/\./g, "").replace(",", "."));
      if (!isNaN(n)) return n;
    }
  }
  return 0;
}

function labelUsuario(u) {
  if (!u) return "";
  return u.nombreApellido || u.nombre || u.usuario || "";
}

function mapById(arr) {
  const m = new Map();
  for (const x of arr || []) m.set(String(x._id), x);
  return m;
}

// ----------------- ARMAR FILAS (por área) -----------------
async function buildFilasArea(paciente, areaId) {
  const modAsig = Array.isArray(paciente.modulosAsignados)
    ? paciente.modulosAsignados
    : [];
  const list = modAsig.filter((m) => {
    const a = m.areaId || m.area;
    if (!areaId) return true;
    if (!a) return false;
    return String(a) === String(areaId) || String(a?._id) === String(areaId);
  });

  const moduloIds = list.map((m) => String(m.moduloId)).filter(Boolean);
  const profIds = [];
  for (const m of list) {
    const arr = Array.isArray(m.profesionales)
      ? m.profesionales
      : Array.isArray(m.coordinadoresExternos)
      ? m.coordinadoresExternos
      : [];
    for (const pr of arr) {
      const id = pr.profesionalId || pr.usuario || pr.usuarioId || pr._id;
      if (id) profIds.push(String(id));
    }
  }

  const [mods, usuarios] = await Promise.all([
    moduloIds.length ? Modulo.find({ _id: { $in: moduloIds } }).lean() : [],
    profIds.length ? Usuario.find({ _id: { $in: profIds } }).lean() : [],
  ]);

  const modById = mapById(mods);
  const userById = mapById(usuarios);

  return list.map((item) => {
    const modDoc = modById.get(String(item.moduloId)) || {};
    const numero = modDoc.numero ?? modDoc.codigo ?? modDoc.nombre ?? "—";
    const valorModulo = getPrecioModulo(modDoc);
    const cant = parseCantidad(item.cantidad ?? 1);
    const aPagar = Number((valorModulo * cant).toFixed(2));

    const roles = {
      profesional: [],
      coordinador: [],
      pasante: [],
      directora: [],
    };
    const listaProf = Array.isArray(item.profesionales)
      ? item.profesionales
      : Array.isArray(item.coordinadoresExternos)
      ? item.coordinadoresExternos
      : [];

    for (const pr of listaProf) {
      const u = userById.get(
        String(pr.profesionalId || pr.usuario || pr.usuarioId || pr._id)
      );
      const nom = labelUsuario(u) || "Profesional";
      const rol = (pr.rol || "").toLowerCase();
      if (/coordin/i.test(rol)) roles.coordinador.push(nom);
      else if (/pasant/i.test(rol)) roles.pasante.push(nom);
      else if (/direct/i.test(rol)) roles.directora.push(nom);
      else roles.profesional.push(nom);
    }

    return {
      mes: item.mes || item.periodo || "",
      moduloId: item.moduloId || null,
      moduloNumero: numero,
      cant,
      valorModulo,
      aPagar,
      profesionales: roles,
    };
  });
}

// ----------------- GET /api/estado-de-cuenta/:dni -----------------
const obtenerEstadoDeCuenta = async (req, res) => {
  try {
    const dni = toStr(req.params.dni).trim();
    const areaId = req.query.areaId ? toStr(req.query.areaId) : null;
    const period = req.query.period ? toStr(req.query.period) : null; // opcional YYYY-MM

    const paciente = await Paciente.findOne({ dni }).lean();
    if (!paciente)
      return res.status(404).json({ error: "Paciente no encontrado" });

    const tieneOS = /obra social/i.test(paciente.condicionDePago || "");

    // Filas base desde módulos asignados (solo para mostrar)
    const filas = await buildFilasArea(paciente, areaId);

    // Movimientos crudos
    const whereMov = {
      dni,
      ...(areaId ? { areaId: new mongoose.Types.ObjectId(areaId) } : {}),
      ...(period ? { period } : {}),
    };
    const movs = await Movimiento.find(whereMov).sort({ fecha: 1 }).lean();

    // Facturas (tipo FACT)
    const facturas = movs
      .filter((m) => m.tipo === "FACT")
      .map((m) => ({
        _id: m._id,
        mes: m.period || (m.fecha ? m.fecha.toISOString().slice(0, 7) : ""),
        nro: m.nroRecibo || m.tipoFactura || "",
        monto: Number(m.monto || 0),
        detalle: m.descripcion || m.observaciones || "",
        fecha: m.fecha ? m.fecha.toISOString().slice(0, 10) : "",
      }));

    // Totales y mapa de pagos por (periodo + módulo)
    let pagadoOS = 0,
      pagadoPART = 0,
      cargos = 0,
      ajustesMas = 0,
      ajustesMenos = 0;

    const pagosMap = {}; // clave: `${period}|${moduloId}`

    const addPagoToMap = (m, tipoPago) => {
      const mesMov =
        m.period || (m.fecha ? m.fecha.toISOString().slice(0, 7) : "") || "";
      const modKey = m.moduloId ? String(m.moduloId) : "";
      const key = `${mesMov}|${modKey}`;
      if (!pagosMap[key]) {
        pagosMap[key] = {
          pagPadres: 0,
          detPadres: "",
          pagOS: 0,
          detOS: "",
        };
      }

      if (tipoPago === "PART") {
        const monto = parseNumberLike(m.monto ?? m.pagPadres, 0);
        pagosMap[key].pagPadres += monto;
        const obs =
          m.detPadres || m.descripcion || m.observaciones || "" || "";
        if (obs) {
          pagosMap[key].detPadres = pagosMap[key].detPadres
            ? `${pagosMap[key].detPadres} | ${obs}`
            : obs;
        }
      } else if (tipoPago === "OS") {
        const monto = parseNumberLike(m.monto ?? m.pagOS, 0);
        pagosMap[key].pagOS += monto;
        const obs = m.detOS || m.descripcion || m.observaciones || "" || "";
        if (obs) {
          pagosMap[key].detOS = pagosMap[key].detOS
            ? `${pagosMap[key].detOS} | ${obs}`
            : obs;
        }
      }
    };

    for (const m of movs) {
      const monto = Number(m.monto || 0);

      if (m.tipo === "CARGO") {
        cargos += monto;

        // pagos anidados en el CARGO
        const pp = parseNumberLike(m.pagPadres, 0);
        const po = parseNumberLike(m.pagOS, 0);
        pagadoPART += pp;
        pagadoOS += po;

        if (pp) addPagoToMap(m, "PART");
        if (po) addPagoToMap(m, "OS");
      } else if (m.tipo === "OS") {
        pagadoOS += monto;
        addPagoToMap(m, "OS");
      } else if (m.tipo === "PART") {
        pagadoPART += monto;
        addPagoToMap(m, "PART");
      } else if (m.tipo === "AJUSTE+") ajustesMas += monto;
      else if (m.tipo === "AJUSTE-") ajustesMenos += monto;
    }

    if (!tieneOS) pagadoOS = 0;

    const totalCargos = cargos;
    const totalPagado = pagadoOS + pagadoPART + ajustesMas - ajustesMenos;
    const saldo = Number((totalCargos - totalPagado).toFixed(2));
    const estado = saldo <= 0 ? "PAGADO" : "PENDIENTE";

    // ============================================================
    //   INYECTAR PAGOS EXISTENTES EN LAS FILAS DE MÓDULOS
    // ============================================================
    for (const l of filas) {
      const periodLinea = l.mes || l.periodo || "";
      if (!periodLinea) continue;

      const modKey = l.moduloId ? String(l.moduloId) : "";
      const key = `${periodLinea}|${modKey}`;
      const pagos = pagosMap[key];
      if (!pagos) continue;

      l.pagPadres = pagos.pagPadres;
      l.detPadres = pagos.detPadres;
      l.pagOS = pagos.pagOS;
      l.detOS = pagos.detOS;
    }

    res.json({
      paciente: {
        dni: paciente.dni,
        nombre: paciente.nombre,
        condicionDePago: paciente.condicionDePago,
        estado: paciente.estado,
        tieneOS,
      },
      area: areaId ? await Area.findById(areaId).select("nombre").lean() : null,
      period: period || null,
      filas,
      facturas,
      totales: {
        aPagar: totalCargos,
        pagadoOS,
        pagadoPART,
        cargos,
        ajustesMas,
        ajustesMenos,
        saldo,
        estado,
      },
      movimientos: movs,
    });
  } catch (err) {
    console.error("estado-de-cuenta GET:", err);
    res.status(500).json({ error: "Error al obtener estado de cuenta" });
  }
};

// ----------------- PUT /api/estado-de-cuenta/:dni -----------------
// Guarda líneas (CARGO) y facturas (FACT) que vienen del modal
const actualizarEstadoDeCuenta = async (req, res) => {
  try {
    const dni = toStr(req.params.dni).trim();
    const { areaId: rawAreaId, lineas, facturas } = req.body || {};

    const paciente = await Paciente.findOne({ dni }).lean();
    if (!paciente)
      return res.status(404).json({ error: "Paciente no encontrado" });

    const areaId = rawAreaId ? new mongoose.Types.ObjectId(rawAreaId) : null;
    const area = areaId ? await Area.findById(areaId).lean() : null;

    const lineasArr = Array.isArray(lineas) ? lineas : [];
    const facturasArr = Array.isArray(facturas) ? facturas : [];

    const ADMIN_ID = "__ADMIN__";

    // ---- catálogos para módulos y profesionales ----
    const moduloIds = [
      ...new Set(
        lineasArr
          .map((l) => l.moduloId)
          .filter(
            (id) =>
              id &&
              id !== ADMIN_ID &&
              mongoose.Types.ObjectId.isValid(String(id))
          )
          .map(String)
      ),
    ];
    const profesionalIds = [
      ...new Set(
        lineasArr.map((l) => l.profesionalId).filter(Boolean).map(String)
      ),
    ];

    const [modulos, profesionales] = await Promise.all([
      moduloIds.length ? Modulo.find({ _id: { $in: moduloIds } }).lean() : [],
      profesionalIds.length
        ? Usuario.find({ _id: { $in: profesionalIds } }).lean()
        : [],
    ]);

    const modById = mapById(modulos);
    const profById = mapById(profesionales);

    // ---- normalizar líneas: ahora soporta "Administración" ----
    const lineasValidas = lineasArr
      .map((l) => {
        const mes = (l.mes || l.period || "").trim(); // YYYY-MM
        const esAdmin =
          !!l.esAdmin ||
          l.moduloId === ADMIN_ID ||
          String(l.moduloNombre || "")
            .toLowerCase()
            .trim() === "administración" ||
          String(l.moduloNombre || "")
            .toLowerCase()
            .trim() === "administracion";

        return {
          ...l,
          mes,
          esAdmin,
        };
      })
      // si es admin, no exigimos módulo real; si no lo es, sí
      .filter((l) => l.mes && (l.moduloId || l.esAdmin));

    // ---- limpiamos lo que vamos a regenerar (CARGO + FACT) ----
    const baseFilter = { dni };
    if (areaId) baseFilter.areaId = areaId;

    const periodsCargos = [
      ...new Set(lineasValidas.map((l) => l.mes).filter(Boolean)),
    ];

    const deleteFilterCargos = {
      ...baseFilter,
      tipo: "CARGO",
      ...(periodsCargos.length ? { period: { $in: periodsCargos } } : {}),
    };

    const deleteFilterFacts = {
      ...baseFilter,
      tipo: "FACT",
    };

    await Promise.all([
      Movimiento.deleteMany(deleteFilterCargos),
      Movimiento.deleteMany(deleteFilterFacts),
    ]);

    const docsToInsert = [];

    // ---- reconstruir CARGOS desde líneas ----
    lineasValidas.forEach((l, idx) => {
      const period = l.mes; // YYYY-MM seguro
      const esAdmin =
        l.esAdmin ||
        l.moduloId === ADMIN_ID ||
        String(l.moduloNombre || "")
          .toLowerCase()
          .trim() === "administración" ||
        String(l.moduloNombre || "")
          .toLowerCase()
          .trim() === "administracion";

   // 🟢 CASO ESPECIAL: ADMINISTRACIÓN (AJUSTE MANUAL)
if (esAdmin) {
  const montoCargo = parseNumberLike(l.aPagar, 0);
  const pagPadres = parseNumberLike(l.pagPadres, 0);
  const pagOS     = parseNumberLike(l.pagOS, 0);

  // si está totalmente vacía (sin cargo, sin pagos, sin detalles) no la guardamos
  if (
    !montoCargo &&
    !pagPadres &&
    !pagOS &&
    !(l.detPadres && String(l.detPadres).trim()) &&
    !(l.detOS && String(l.detOS).trim())
  ) {
    return;
  }

  const fechaCargo = new Date(`${period}-01T00:00:00.000Z`);
  const asigKey = `ADMIN-${dni}-${areaId || "sinArea"}-${period}-${idx}`;

  docsToInsert.push({
    pacienteId: paciente._id,
    dni,
    areaId: areaId || undefined,
    areaNombre: area?.nombre || l.areaNombre || undefined,

    moduloId: undefined,
    moduloNombre: "Administración",

    period,
    asigKey,
    tipo: "CARGO",
    fecha: fechaCargo,
    monto: montoCargo,     // puede ser 0
    cantidad: 1,
    profesional: undefined,

    pagPadres,
    detPadres: l.detPadres || "",
    pagOS,
    detOS: l.detOS || "",

    descripcion:
      l.detPadres ||
      l.detOS ||
      `Ajuste administrativo ${period}`,

    estado: "PENDIENTE",
    meta: {
      ...(l.meta || {}),
      esAdministracion: true,
    },
  });

  return;
}

      // 🔵 CASO NORMAL (MÓDULO)
      const moduloIdStr = l.moduloId ? String(l.moduloId) : null;
      const modDoc = moduloIdStr ? modById.get(moduloIdStr) : null;

      const cant = parseCantidad(l.cantidad ?? 1);
      const precioLinea =
        l.precioModulo != null
          ? parseNumberLike(l.precioModulo, 0)
          : getPrecioModulo(modDoc);
      const montoCargo = +(precioLinea * (Number(cant) || 0)).toFixed(2);

      const profesionalIdStr = l.profesionalId ? String(l.profesionalId) : null;
      const profDoc = profesionalIdStr ? profById.get(profesionalIdStr) : null;
      const profesionalNombre =
        l.profesionalNombre || labelUsuario(profDoc) || undefined;

      const moduloNombre =
        l.moduloNombre ||
        modDoc?.nombre ||
        modDoc?.codigo ||
        modDoc?.numero ||
        "";

      const fechaCargo = new Date(`${period}-01T00:00:00.000Z`);

      // 🔑 clave única por línea para respetar el índice {dni,areaId,moduloId,period,tipo,asigKey}
      const asigKey = `${dni}-${areaId || "sinArea"}-${period}-${
        moduloIdStr || "sinModulo"
      }-${idx}`;

      docsToInsert.push({
        pacienteId: paciente._id,
        dni,
        areaId: areaId || undefined,
        areaNombre: area?.nombre || l.areaNombre || undefined,

        moduloId: modDoc?._id || moduloIdStr || undefined,
        moduloNombre: moduloNombre || undefined,

        period,
        asigKey,
        tipo: "CARGO",
        fecha: fechaCargo,
        monto: montoCargo,
        cantidad: Number(cant) || 1,
        profesional: profesionalNombre,

        // pagos que vienen del modal (se guardan en el CARGO)
        pagPadres: parseNumberLike(l.pagPadres, 0),
        detPadres: l.detPadres || "",
        pagOS: parseNumberLike(l.pagOS, 0),
        detOS: l.detOS || "",

        descripcion: `Cargo ${period} — ${moduloNombre || "Módulo"}`,
        estado: "PENDIENTE",
      });
    });

    // ---- reconstruir FACTURAS desde facturas ----
    for (const f of facturasArr) {
      const period = (f.mes || "").trim(); // YYYY-MM
      const monto = parseNumberLike(f.monto, 0);
      if (!monto) continue;

      const fecha =
        f.fecha && String(f.fecha).trim()
          ? new Date(f.fecha)
          : new Date(`${period || "1970-01"}-01T00:00:00.000Z`);

      docsToInsert.push({
        pacienteId: paciente._id,
        dni,
        areaId: areaId || undefined,
        areaNombre: area?.nombre || undefined,

        period: period || undefined,
        tipo: "FACT",
        fecha,
        monto,

        nroRecibo: f.nro || undefined,
        descripcion: f.detalle || undefined,
        observaciones: f.detalle || undefined,
        estado: "PENDIENTE",
      });
    }

    if (docsToInsert.length) {
      await Movimiento.insertMany(docsToInsert);
    }

    return res.json({
      ok: true,
      inserted: docsToInsert.length,
    });
  } catch (err) {
    console.error("estado-de-cuenta PUT:", err);
    res
      .status(500)
      .json({ error: "No se pudo actualizar el estado de cuenta" });
  }
};


// ----------------- POST /api/estado-de-cuenta/:dni/movimientos -----------------
const crearMovimiento = async (req, res) => {
  try {
    const dni = toStr(req.params.dni).trim();
    const paciente = await Paciente.findOne({ dni })
      .select("_id dni condicionDePago")
      .lean();
    if (!paciente)
      return res.status(404).json({ error: "Paciente no encontrado" });

    const tieneOS = /obra social/i.test(paciente.condicionDePago || "");
    const { tipo, areaId, monto } = req.body || {};

    if (!areaId)
      return res.status(400).json({ error: "areaId es obligatorio" });
    if (typeof monto !== "number")
      return res
        .status(400)
        .json({ error: "monto numérico es obligatorio" });

    if (tipo === "OS" && !tieneOS)
      return res.status(400).json({
        error:
          "El paciente no tiene obra social. No se puede registrar pago OS.",
      });

    const mov = await Movimiento.create({
      ...req.body,
      dni,
      pacienteId: paciente._id,
    });

    res.status(201).json({ ok: true, movimiento: mov });
  } catch (err) {
    console.error("estado-de-cuenta POST movimiento:", err);
    res.status(500).json({ error: "No se pudo registrar el movimiento" });
  }
};

// ----------------- DELETE /api/estado-de-cuenta/movimientos/:movId -----------------
const eliminarMovimiento = async (req, res) => {
  try {
    const id = toStr(req.params.movId);
    const mov = await Movimiento.findByIdAndDelete(id).lean();
    if (!mov) return res.status(404).json({ error: "Movimiento no encontrado" });
    res.json({ ok: true, eliminado: mov });
  } catch (err) {
    console.error("estado-de-cuenta DELETE movimiento:", err);
    res.status(500).json({ error: "No se pudo eliminar el movimiento" });
  }
};

// ----------------- GET /api/estado-de-cuenta/movimientos/:dni -----------------
const getPorDni = async (req, res) => {
  try {
    const { dni } = req.params;
    const { areaId } = req.query;

    const q = { dni };
    if (areaId) q.areaId = new mongoose.Types.ObjectId(areaId);

    const movimientos = await Movimiento.find(q).sort({ fecha: 1 }).lean();
    res.json({ dni, movimientos });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};

// ----------------- GET /api/estado-de-cuenta/:dni/extracto?areaId=...&desde=YYYY-MM&hasta=YYYY-MM (&period=YYYY-MM opcional) -----------------
async function generarExtractoPDF(req, res) {
  try {
    const fs = require("fs");
    const path = require("path");
    const PDFDocument = require("pdfkit");

    // ==== AJUSTÁ ESTO SI TU MODELO SE LLAMA DISTINTO ====
    // const Movimiento = require("../models/estadoDeCuentaMovimiento"); // <- si lo necesitás acá
    // ====================================================

    // ---------- Helpers seguros ----------
    const toStr = (v) => (v === null || v === undefined ? "" : String(v));

    const parseNumberLike = (v, def = 0) => {
      if (v === null || v === undefined) return def;
      if (typeof v === "number") return Number.isFinite(v) ? v : def;
      let s = String(v).trim();
      if (!s) return def;
      // soporta "12.345,67" y "$ 12.345,67"
      s = s.replace(/\$/g, "").replace(/\s+/g, "").replace(/\./g, "").replace(/,/g, ".");
      const n = Number(s);
      return Number.isFinite(n) ? n : def;
    };

    const fmtARS = (n) => {
      const num = Number(n || 0);
      return `$ ${num.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    const yyyymmFromMov = (m) =>
      toStr(m.period).slice(0, 7) ||
      (m.fecha ? new Date(m.fecha).toISOString().slice(0, 7) : "") ||
      "";

    const inRange = (p, desde, hasta) => {
      if (!p) return false;
      const d = desde || "1900-01";
      const h = hasta || "9999-12";
      return p >= d && p <= h;
    };

    const normalizeYYYYMM = (s) => {
      s = toStr(s).trim();
      return /^\d{4}-\d{2}$/.test(s) ? s : "";
    };

    const qtyToFrac = (q) => {
      const n = Number(q || 0);
      if (!n) return "";
      const sign = n < 0 ? "-" : "";
      const x = Math.abs(n);

      const whole = Math.floor(x + 1e-9);
      const frac = x - whole;

      const quarters = Math.round(frac * 4); // 0..4
      let fracStr = "";
      if (quarters === 0) fracStr = "";
      else if (quarters === 1) fracStr = "1/4";
      else if (quarters === 2) fracStr = "1/2";
      else if (quarters === 3) fracStr = "3/4";
      else if (quarters === 4) {
        // carry
        if (whole === 0) return sign + "1";
        return sign + String(whole + 1);
      }

      if (whole === 0) return sign + (fracStr || "0");
      if (!fracStr) return sign + String(whole);
      return sign + `${whole} ${fracStr}`;
    };

    // ---------- Params ----------
    const dni = toStr(req.params.dni).trim();
    const areaId = toStr(req.query.areaId || "").trim();

    const period = normalizeYYYYMM(req.query.period);
    let desde = normalizeYYYYMM(req.query.desde);
    let hasta = normalizeYYYYMM(req.query.hasta);

    if (!areaId) return res.status(400).json({ error: "areaId es obligatorio" });

    // si viene period, pisa rango
    if (period) {
      desde = period;
      hasta = period;
    } else {
      // si falta uno, asumimos el otro
      if (desde && !hasta) hasta = desde;
      if (!desde && hasta) desde = hasta;
    }

    const paciente = await Paciente.findOne({ dni }).lean();
    if (!paciente) return res.status(404).json({ error: "Paciente no encontrado" });

    const area = await Area.findById(areaId).lean();
    if (!area) return res.status(404).json({ error: "Área no encontrada" });

    // 👇 REGLA REAL según tu enum
    const condicion = toStr(paciente.condicionDePago || "").trim();
    const tieneOS =
      condicion === "Obra Social" ||
      condicion === "Obra Social + Particular" ||
      condicion === "Obra Social + Particular (les pagan a ellos)";

    // ---------- Movimientos: rango ----------
    const movQuery = { dni, areaId };
    const movsAll = await Movimiento.find(movQuery).sort({ fecha: 1 }).lean();

    // filtramos por rango en JS para no depender 100% de period en DB
    const movsRango = movsAll.filter((m) => {
      const p = yyyymmFromMov(m);
      if (!desde && !hasta) return true;
      return inRange(p, desde, hasta);
    });

    // ---------- Armado de filas detalle (como tu grilla) ----------
    // Nos basamos en CARGO (que son las líneas “módulo / evento / admin”)
    const filas = movsRango
      .filter((m) => String(m.tipo || "").toUpperCase() === "CARGO")
      .map((m) => {
        const mes = yyyymmFromMov(m) || "-";
        const cant =
          qtyToFrac(m.cantidad ?? m.cant ?? m.qty) ||
          qtyToFrac(m.cantidadModulo ?? m.cantModulo) ||
          qtyToFrac(1);

        const codigo =
          toStr(m.codigo || m.moduloCodigo || m.nombreModulo || m.moduloNombre || m.descripcion || m.detalleCargo || "")
            .trim();

        const profesional =
          toStr(
            m.profesional ||
              m.profesionalNombre ||
              (m.profesionalId && m.profesionalId.nombre) ||
              (m.profesionalObj && m.profesionalObj.nombre) ||
              m.profNombre ||
              ""
          ).trim();

        const aPagar = Number(m.monto || 0);

        const pagPadres = parseNumberLike(m.pagPadres ?? m.pagadoPadres ?? m.pagoPadres, 0);
        const detPadres = toStr(m.detPadres ?? m.detallePadres ?? m.detallePagoPadres ?? m.detallePadresTxt ?? "").trim();

        const pagOS = parseNumberLike(m.pagOS ?? m.pagadoOS ?? m.pagoOS, 0);
        const detOS = toStr(m.detOS ?? m.detalleOS ?? m.detallePagoOS ?? "").trim();

        return { mes, cant, codigo, profesional, aPagar, pagPadres, detPadres, pagOS, detOS };
      });

    // ---------- Facturas ----------
    const facturas = movsRango
      .filter((m) => String(m.tipo || "").toUpperCase() === "FACT")
      .map((m) => ({
        mes: yyyymmFromMov(m) || "-",
        nro: toStr(m.nroRecibo || m.nFactura || m.nroFactura || m.tipoFactura || "-"),
        monto: Number(m.monto || 0),
        fecha: m.fecha ? new Date(m.fecha).toLocaleDateString("es-AR") : (toStr(m.fechaStr || "")) || "",
      }))
      .sort((a, b) => String(a.mes).localeCompare(String(b.mes)));

    // ---------- Totales ----------
    const totalDeberia = filas.reduce((acc, r) => acc + Number(r.aPagar || 0), 0);
    const totalPagoPadres = filas.reduce((acc, r) => acc + Number(r.pagPadres || 0), 0);
    const totalPagoOS = tieneOS ? filas.reduce((acc, r) => acc + Number(r.pagOS || 0), 0) : 0;
    const totalPago = totalPagoPadres + totalPagoOS;

    const totalFacturado = facturas.reduce((acc, f) => acc + Number(f.monto || 0), 0);
    const difFactPagado = Number((totalFacturado - totalPago).toFixed(2));

    // ---------- PDF headers ----------
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="Extracto_${dni}_${(area.nombre || "area").replace(/\s+/g, "_")}${desde && hasta ? "_" + desde + "_" + hasta : ""}.pdf"`
    );
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    const doc = new PDFDocument({ size: "A4", margin: 36, bufferPages: true });
    doc.pipe(res);

    // ---------- Estilo ----------
    const pageW = doc.page.width;
    const pageH = doc.page.height;
    const left = doc.page.margins.left;
    const right = pageW - doc.page.margins.right;
    const top = doc.page.margins.top;
    const bottom = pageH - doc.page.margins.bottom;

    const GREEN = "#9BBE63";
    const LIGHT = "#EAF2E0";
    const GRID = "#111";

    const ensureSpace = (needH) => {
      if (doc.y + needH > bottom) {
        doc.addPage();
        doc.y = top;
      }
    };

    const drawBanner = (areaNombre, difValue) => {
      const y = doc.y;
      const h = 20;

      doc.save();
      doc.rect(left, y, right - left, h).fill(GREEN);
      doc.fillColor("#000").font("Helvetica-Bold").fontSize(10);

      doc.text(`AREA: ${toStr(areaNombre).toUpperCase()}`, left, y + 6, {
        width: (right - left) * 0.6,
        align: "center",
      });

      doc.text(`DIF ENTRE FACT Y PAGADO  -$`, left + (right - left) * 0.60, y + 6, {
        width: (right - left) * 0.25,
        align: "right",
      });

      doc.text(fmtARS(Math.abs(difValue)), left + (right - left) * 0.85, y + 6, {
        width: (right - left) * 0.15,
        align: "right",
      });

      doc.restore();
      doc.y = y + h + 10;
    };

    const drawHeaderInfo = () => {
      // LOGO (si existe)
      try {
        const logoFile = "fc885963d690a6787ca787cf208cdd25_1778x266_fit.png";
        const candidates = [
          path.resolve(process.cwd(), "frontend", "img", logoFile),
          path.resolve(__dirname, "..", "..", "frontend", "img", logoFile),
          path.resolve(process.cwd(), "..", "frontend", "img", logoFile),
        ];
        const found = candidates.find((p) => fs.existsSync(p));
        if (found) doc.image(found, left, 12, { width: 160 });
      } catch {}

      doc.y = 20 + 55;

      doc.fillColor("#000").font("Helvetica-Bold").fontSize(13).text("Informe de estado de cuenta", left, doc.y);
      doc.moveDown(0.4);

      doc.font("Helvetica").fontSize(10).text(`${paciente.nombre || "-"} - DNI ${paciente.dni || "-"}`, left);
      doc.fontSize(9).fillColor("#333").text(`Área: ${area.nombre || "-"}`, left);
      const rangoTxt =
        desde && hasta ? `Rango: ${desde} a ${hasta}` : "Rango: (todos los periodos)";
      doc.text(rangoTxt, left);
      doc.fillColor("#000");

      doc.moveDown(0.6);
      drawBanner(area.nombre || "-", difFactPagado);
    };

    const calcCellHeight = (text, width, fontSize) => {
      if (!text) return 0;
      doc.fontSize(fontSize);
      return doc.heightOfString(String(text), { width, align: "left" });
    };

    const drawTable = (title, cols, rows, options = {}) => {
      const {
        headerFill = GREEN,
        headerTextColor = "#000",
        rowFill = LIGHT,
        fontSize = 8,
        headerFontSize = 7.5,
        rowPaddingY = 3,
        minRowH = 14,
      } = options;

      if (title) {
        ensureSpace(20);
        doc.font("Helvetica-Bold").fontSize(10).fillColor("#000").text(title, left, doc.y);
        doc.moveDown(0.4);
      }

      // Header bar
      ensureSpace(28);
      const tableX = left;
      const tableW = cols.reduce((a, c) => a + c.w, 0);
      const headerY = doc.y;

      doc.save();
      doc.rect(tableX, headerY, tableW, 18).fill(headerFill);
      doc.restore();

      // Header labels
      doc.font("Helvetica-Bold").fontSize(headerFontSize).fillColor(headerTextColor);
      let x = tableX;
      cols.forEach((c) => {
        doc.text(c.label, x + 3, headerY + 5, { width: c.w - 6, align: c.align || "left" });
        x += c.w;
      });

      // Border header
      doc.save();
      doc.strokeColor(GRID);
      doc.rect(tableX, headerY, tableW, 18).stroke();
      // verticals
      x = tableX;
      cols.forEach((c) => {
        doc.moveTo(x, headerY).lineTo(x, headerY + 18).stroke();
        x += c.w;
      });
      doc.moveTo(tableX + tableW, headerY).lineTo(tableX + tableW, headerY + 18).stroke();
      doc.restore();

      doc.y = headerY + 18;

      // Rows
      doc.font("Helvetica").fontSize(fontSize).fillColor("#000");

      for (const r of rows) {
        // medir altura por wrap en columnas “largas”
        let rowH = minRowH;

        for (const c of cols) {
          const t = r[c.key] ?? "";
          const h = calcCellHeight(t, c.w - 6, fontSize);
          rowH = Math.max(rowH, h + rowPaddingY * 2);
        }

        ensureSpace(rowH + 2);

        const y = doc.y;

        // fill
        doc.save();
        doc.rect(tableX, y, tableW, rowH).fill(rowFill);
        doc.restore();

        // text
        let cx = tableX;
        for (const c of cols) {
          const txt = r[c.key] ?? "";
          doc.text(String(txt), cx + 3, y + rowPaddingY, {
            width: c.w - 6,
            align: c.align || "left",
          });
          cx += c.w;
        }

        // grid
        doc.save();
        doc.strokeColor(GRID);
        doc.rect(tableX, y, tableW, rowH).stroke();
        cx = tableX;
        cols.forEach((c) => {
          doc.moveTo(cx, y).lineTo(cx, y + rowH).stroke();
          cx += c.w;
        });
        doc.moveTo(tableX + tableW, y).lineTo(tableX + tableW, y + rowH).stroke();
        doc.restore();

        doc.y = y + rowH;
      }

      doc.moveDown(0.6);

      return { tableX, tableW };
    };

    const drawTotalsBoxes = () => {
      // cajas como tu captura
      ensureSpace(120);

      const boxW1 = 260;
      const boxH = 46;
      const x1 = left + 260;
      const y1 = doc.y + 10;

      // Caja “Total que debería / Total que pagó”
      doc.save();
      doc.strokeColor("#111");
      doc.rect(x1, y1, boxW1, boxH).stroke();
      doc.moveTo(x1 + 110, y1).lineTo(x1 + 110, y1 + boxH).stroke();
      doc.moveTo(x1, y1 + boxH / 2).lineTo(x1 + boxW1, y1 + boxH / 2).stroke();
      doc.restore();

      doc.font("Helvetica-Bold").fontSize(8).fillColor("#000");
      doc.text("Total que deberia\nhaber pagado", x1 + 6, y1 + 6, { width: 104, align: "left" });
      doc.text("Total que pago", x1 + 6, y1 + boxH / 2 + 6, { width: 104, align: "left" });

      doc.font("Helvetica-Bold").fontSize(9);
      doc.text(fmtARS(totalDeberia), x1 + 120, y1 + 14, { width: boxW1 - 130, align: "right" });
      doc.text(fmtARS(totalPago), x1 + 120, y1 + boxH / 2 + 14, { width: boxW1 - 130, align: "right" });

      // Caja “Total facturado” a la derecha
      const boxW2 = 140;
      const x2 = right - boxW2;
      const y2 = y1 + 10;

      doc.save();
      doc.strokeColor("#111");
      doc.rect(x2, y2, boxW2, 34).stroke();
      doc.moveTo(x2 + 78, y2).lineTo(x2 + 78, y2 + 34).stroke();
      doc.restore();

      doc.font("Helvetica-Bold").fontSize(8).text("Total que se\nle facturo", x2 + 6, y2 + 6, { width: 70 });
      doc.font("Helvetica-Bold").fontSize(9).text(fmtARS(totalFacturado), x2 + 82, y2 + 18, {
        width: boxW2 - 88,
        align: "right",
      });

      doc.y = y2 + 50;
    };

    // ---------- Render ----------
    drawHeaderInfo();

    // Tabla principal (detalle)
    const colsDetalleBase = [
      { key: "mes",        label: "MES",        w: 58,  align: "left" },
      { key: "cant",       label: "CANT",       w: 44,  align: "center" },
      { key: "codigo",     label: "CODIGO",     w: 190, align: "left" },
      { key: "profesional",label: "PROFESIONAL",w: 120, align: "left" },
      { key: "aPagar",     label: "A PAGAR",    w: 70,  align: "right" },
      { key: "pagPadres",  label: "PAGADO POR\nPADRES", w: 88, align: "right" },
      { key: "detPadres",  label: "DETALLE",    w: 95,  align: "left" },
    ];

    const colsOS = [
      { key: "pagOS",      label: "PAGADO POR\nO.S.", w: 78, align: "right" },
      { key: "detOS",      label: "DETALLE",    w: 95, align: "left" },
    ];

    const colsDetalle = tieneOS ? colsDetalleBase.concat(colsOS) : colsDetalleBase;

    const rowsDetalle = filas.map((r) => ({
      mes: r.mes,
      cant: r.cant,
      codigo: r.codigo,
      profesional: r.profesional,
      aPagar: fmtARS(r.aPagar),
      pagPadres: fmtARS(r.pagPadres),
      detPadres: r.detPadres,
      ...(tieneOS ? { pagOS: fmtARS(r.pagOS), detOS: r.detOS } : {}),
    }));

    drawTable("", colsDetalle, rowsDetalle, {
      headerFill: LIGHT,
      headerTextColor: "#000",
      rowFill: LIGHT,
      headerFontSize: 7.2,
      fontSize: 7.4,
      minRowH: 14,
    });

    // FACTURAS abajo, pero SIN superposición.
    // Si no entra en esta hoja con una altura mínima, arrancamos nueva hoja.
    const estimatedFactH = 18 + Math.max(1, facturas.length) * 16 + 30;
    if (doc.y + estimatedFactH > bottom) {
      doc.addPage();
      doc.y = top;
      // banner simple arriba
      doc.y = top + 10;
      drawBanner(area.nombre || "-", difFactPagado);
    }

    // Facturas
    const colsFact = [
      { key: "mes",   label: "MES",       w: 90,  align: "left" },
      { key: "nro",   label: "N FACTURA", w: 120, align: "left" },
      { key: "monto", label: "MONTO",     w: 160, align: "right" },
      { key: "fecha", label: "FECHA",     w: 170, align: "left" },
    ];

    const rowsFact = facturas.map((f) => ({
      mes: f.mes,
      nro: f.nro,
      monto: fmtARS(f.monto),
      fecha: f.fecha || "",
    }));

    drawTable("FACTURAS", colsFact, rowsFact, {
      headerFill: LIGHT,
      headerTextColor: "#000",
      rowFill: "#FFFFFF",
      headerFontSize: 7.4,
      fontSize: 7.6,
      minRowH: 14,
    });

    // Totales al final (en negro)
    drawTotalsBoxes();

    doc.end();
  } catch (err) {
    console.error("estado-de-cuenta PDF:", err);
    try {
      res.status(500).json({ error: "No se pudo generar el PDF" });
    } catch {}
  }
}





module.exports = {
  obtenerEstadoDeCuenta,
  actualizarEstadoDeCuenta,
  crearMovimiento,
  eliminarMovimiento,
  generarExtractoPDF,
  getPorDni,
  __test__: { buildFilasArea, parseCantidad, getPrecioModulo },
};


