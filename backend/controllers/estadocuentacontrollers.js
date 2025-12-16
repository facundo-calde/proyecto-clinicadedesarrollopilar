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

// ----------------- GET /api/estado-de-cuenta/:dni/extracto?areaId=...&period=YYYY-MM&desde=YYYY-MM&hasta=YYYY-MM -----------------
async function generarExtractoPDF(req, res) {
  try {
    const fs = require("fs");
    const path = require("path");
    const PDFDocument = require("pdfkit");
    const mongoose = require("mongoose");

    const dni = String(req.params.dni || "").trim();
    const areaId = String(req.query.areaId || "").trim();

    const period = req.query.period ? String(req.query.period).trim() : null;     // mes único
    const desde = req.query.desde ? String(req.query.desde).trim() : null;       // rango
    const hasta = req.query.hasta ? String(req.query.hasta).trim() : null;       // rango

    if (!areaId) return res.status(400).json({ error: "areaId es obligatorio" });

    const paciente = await Paciente.findOne({ dni }).lean();
    if (!paciente) return res.status(404).json({ error: "Paciente no encontrado" });

    const area = await Area.findById(areaId).lean();
    if (!area) return res.status(404).json({ error: "Área no encontrada" });

    const tieneOS = /obra social/i.test(paciente.condicionDePago || "");

    // ---------- Helpers ----------
    const fmtARS = (n) => {
      const num = Number(n || 0);
      return `$ ${num.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    const parseNumberLike = (val, def = 0) => {
      if (val === null || val === undefined || val === "") return def;
      if (typeof val === "number") return val;
      const s = String(val)
        .replace(/\$/g, "")
        .replace(/\s/g, "")
        .replace(/\./g, "")
        .replace(",", ".");
      const n = Number(s);
      return Number.isFinite(n) ? n : def;
    };

    const yyyymmFromMov = (m) =>
      m.period ||
      (m.fecha ? new Date(m.fecha).toISOString().slice(0, 7) : "") ||
      "";

    // rango/periodo: prioridad rango
    const buildWhere = () => {
      const where = {
        dni,
        areaId: new mongoose.Types.ObjectId(areaId),
      };

      if (desde || hasta) {
        // rango inclusivo
        const d = desde || "0000-01";
        const h = hasta || "9999-12";
        where.period = { $gte: d, $lte: h };
      } else if (period) {
        where.period = period;
      }
      return where;
    };

    const whereMov = buildWhere();

    // Movimientos filtrados por periodo/rango
    const movs = await Movimiento.find(whereMov).sort({ fecha: 1 }).lean();

    // Filas base desde módulos asignados (solo para mostrar)
    // (si ya tenés otra función que arma filas para el estado, dejala tal cual)
    const filas = await buildFilasArea(paciente, areaId);

    // ========= PAGOS MAP (igual a tu GET) =========
    const pagosMap = {}; // clave: `${period}|${moduloId}`
    const addPagoToMap = (m, tipoPago) => {
      const mesMov = yyyymmFromMov(m) || "";
      const modKey = m.moduloId ? String(m.moduloId) : "";
      const key = `${mesMov}|${modKey}`;
      if (!pagosMap[key]) pagosMap[key] = { pagPadres: 0, detPadres: "", pagOS: 0, detOS: "" };

      if (tipoPago === "PART") {
        const monto = parseNumberLike(m.monto ?? m.pagPadres, 0);
        pagosMap[key].pagPadres += monto;
        const obs = m.detPadres || m.descripcion || m.observaciones || "";
        if (obs) pagosMap[key].detPadres = pagosMap[key].detPadres ? `${pagosMap[key].detPadres} | ${obs}` : obs;
      }

      if (tipoPago === "OS") {
        const monto = parseNumberLike(m.monto ?? m.pagOS, 0);
        pagosMap[key].pagOS += monto;
        const obs = m.detOS || m.descripcion || m.observaciones || "";
        if (obs) pagosMap[key].detOS = pagosMap[key].detOS ? `${pagosMap[key].detOS} | ${obs}` : obs;
      }
    };

    // Totales
    let totalAPagar = 0;
    let totalPagPadres = 0;
    let totalPagOS = 0;
    let totalFacturado = 0;

    for (const m of movs) {
      const monto = Number(m.monto || 0);

      if (m.tipo === "CARGO") {
        totalAPagar += monto;

        // pagos anidados en el CARGO (si existen)
        const pp = parseNumberLike(m.pagPadres, 0);
        const po = parseNumberLike(m.pagOS, 0);
        totalPagPadres += pp;
        totalPagOS += po;

        if (pp) addPagoToMap(m, "PART");
        if (po) addPagoToMap(m, "OS");
      } else if (m.tipo === "PART") {
        totalPagPadres += monto;
        addPagoToMap(m, "PART");
      } else if (m.tipo === "OS") {
        totalPagOS += monto;
        addPagoToMap(m, "OS");
      } else if (m.tipo === "FACT") {
        totalFacturado += monto;
      }
    }

    if (!tieneOS) totalPagOS = 0;

    // Inyectar pagos a filas (para que el PDF muestre “Pagado por padres / OS” como tu planilla)
    for (const l of filas) {
      const mesLinea = l.mes || l.periodo || l.period || "";
      if (!mesLinea) continue;
      const modKey = l.moduloId ? String(l.moduloId) : "";
      const key = `${mesLinea}|${modKey}`;
      const pagos = pagosMap[key];
      if (!pagos) continue;

      l.pagPadres = pagos.pagPadres;
      l.detPadres = pagos.detPadres;
      l.pagOS = pagos.pagOS;
      l.detOS = pagos.detOS;
    }

    // Facturas (tabla derecha)
    const facturas = movs
      .filter((m) => m.tipo === "FACT")
      .map((m) => ({
        mes: yyyymmFromMov(m) || "-",
        nro: m.nroRecibo || m.tipoFactura || "-",
        monto: Number(m.monto || 0),
        detalle: m.detalle || m.descripcion || m.observaciones || "",
        fecha: m.fecha ? new Date(m.fecha).toISOString().slice(0, 10) : "",
      }))
      .sort((a, b) => String(a.mes).localeCompare(String(b.mes)));

    const totalPagado = totalPagPadres + (tieneOS ? totalPagOS : 0);
    const saldo = Number((totalAPagar - totalPagado).toFixed(2));
    const difFactPag = Number((totalFacturado - totalPagado).toFixed(2));

    // ---------- PDF ----------
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="Extracto_${dni}_${(area.nombre || "area").replace(/\s+/g, "_")}.pdf"`
    );

    // A4 apaisado (para que quede como la planilla)
    const doc = new PDFDocument({ margin: 28, size: "A4", layout: "landscape" });
    doc.pipe(res);

    // ---------- LOGO (robusto) ----------
    let logoDrawn = false;
    try {
      const logoFile = "fc885963d690a6787ca787cf208cdd25_1778x266_fit.png";
      const candidates = [
        path.resolve(process.cwd(), "frontend", "img", logoFile),
        path.resolve(__dirname, "..", "..", "frontend", "img", logoFile),
        path.resolve(process.cwd(), "..", "frontend", "img", logoFile),
      ];
      const found = candidates.find((p) => fs.existsSync(p));
      if (found) {
        doc.image(found, 28, 18, { width: 170 });
        logoDrawn = true;
      }
    } catch (_) {}

    // ---------- LAYOUT BASE ----------
    const pageW = doc.page.width;
    const pageH = doc.page.height;
    const left = 28;
    const right = pageW - 28;
    const top = 28;

    let y = top;
    if (logoDrawn) y = 70;

    // Header texto (igual a la planilla: paciente / área / saldo arriba derecha)
    doc.fontSize(12).fillColor("#000").text("PACIENTE", left, y);
    doc.fontSize(12).fillColor("#000").text(paciente.nombre || "-", left + 80, y);

    // bloque derecha: SALDO y DIF
    const boxR = right - 240;
    doc.fontSize(10).fillColor("#000").text("SALDO", boxR, y);
    doc.fontSize(10).fillColor("#000").text(fmtARS(saldo), boxR + 70, y, { width: 170, align: "right" });

    doc.fontSize(10).fillColor("#000").text("DIF ENTRE FACT Y PAGADO", boxR, y + 16);
    doc.fontSize(10).fillColor("#000").text(fmtARS(difFactPag), boxR + 70, y + 16, { width: 170, align: "right" });

    y += 40;

    // Barra verde del área
    const green = "#8BCB86"; // podés mapear por área si querés
    doc.save();
    doc.rect(left, y, right - left, 22).fill(green);
    doc.restore();
    doc.fontSize(11).fillColor("#000").text(`AREA:${(area.nombre || "").toUpperCase()}`, left + 8, y + 6);
    y += 30;

    // Tablas lado a lado
    const gap = 14;
    const leftW = 620;                 // tabla principal
    const rightW = (right - left) - leftW - gap; // facturas
    const x1 = left;
    const x2 = left + leftW + gap;

    // ----- Definición de columnas (izquierda) -----
    const colsLeft = tieneOS
      ? [
          { k: "mes",        t: "MES",              w: 72,  a: "left"  },
          { k: "cantidad",   t: "CANTIDAD",         w: 64,  a: "center"},
          { k: "modulo",     t: "CODIGO",           w: 210, a: "left"  },
          { k: "prof",       t: "PROFESIONAL",      w: 165, a: "left"  },
          { k: "aPagar",     t: "A PAGAR",          w: 80,  a: "right" },
          { k: "pagPadres",  t: "PAGADO POR PADRES",w: 110, a: "right" },
          { k: "detPadres",  t: "DETALLE",          w: 120, a: "left"  },
          { k: "pagOS",      t: "PAGADO POR O.S.",  w: 110, a: "right" },
          { k: "detOS",      t: "DETALLE",          w: 120, a: "left"  },
        ]
      : [
          { k: "mes",        t: "MES",              w: 80,  a: "left"  },
          { k: "cantidad",   t: "CANTIDAD",         w: 70,  a: "center"},
          { k: "modulo",     t: "CODIGO",           w: 250, a: "left"  },
          { k: "prof",       t: "PROFESIONAL",      w: 190, a: "left"  },
          { k: "aPagar",     t: "A PAGAR",          w: 90,  a: "right" },
          { k: "pagPadres",  t: "PAGADO POR PADRES",w: 130, a: "right" },
          { k: "detPadres",  t: "DETALLE",          w: 160, a: "left"  },
        ];

    // Normalizamos a ancho exacto de leftW
    const sumLeft = colsLeft.reduce((a, c) => a + c.w, 0);
    if (sumLeft !== leftW) {
      // ajusto la última columna para calzar exacto
      colsLeft[colsLeft.length - 1].w += (leftW - sumLeft);
    }

    // ----- Columnas facturas (derecha) -----
    const colsRight = [
      { k: "mes",    t: "MES",       w: 70,  a: "left" },
      { k: "nro",    t: "N FACTURA", w: 90,  a: "left" },
      { k: "monto",  t: "MONTO",     w: 95,  a: "right"},
      { k: "detalle",t: "DETALLE",   w: 95,  a: "left" },
      { k: "fecha",  t: "FECHA",     w: 80,  a: "left" },
    ];
    const sumRight = colsRight.reduce((a, c) => a + c.w, 0);
    if (sumRight !== rightW) colsRight[colsRight.length - 1].w += (rightW - sumRight);

    // ----- helpers dibujo tabla -----
    const rowH = 18;
    const headH = 20;
    const lineCol = "#000000";
    const headFill = "#DFF0D8"; // verde claro
    const cellFill = "#FFFFFF";

    const drawTableHeader = (x, y, w, cols) => {
      doc.save();
      doc.rect(x, y, w, headH).fill(headFill).stroke(lineCol);
      doc.restore();

      doc.fontSize(8).fillColor("#000");
      let cx = x;
      for (const c of cols) {
        doc.save();
        doc.rect(cx, y, c.w, headH).stroke(lineCol);
        doc.restore();
        doc.text(c.t, cx + 4, y + 6, { width: c.w - 8, align: c.a, lineBreak: false });
        cx += c.w;
      }
      return y + headH;
    };

    const drawRow = (x, y, w, cols, values) => {
      doc.save();
      doc.rect(x, y, w, rowH).fill(cellFill).stroke(lineCol);
      doc.restore();

      doc.fontSize(8).fillColor("#000");
      let cx = x;
      for (const c of cols) {
        doc.save();
        doc.rect(cx, y, c.w, rowH).stroke(lineCol);
        doc.restore();

        const v = values[c.k] ?? "";
        doc.text(String(v), cx + 4, y + 5, { width: c.w - 8, align: c.a, lineBreak: false, ellipsis: true });
        cx += c.w;
      }
      return y + rowH;
    };

    const needNewPage = (yy, extra = 0) => yy + extra > pageH - 28;

    // ----- Construcción de filas (izquierda) -----
    const leftRows = (Array.isArray(filas) ? filas : []).map((l) => {
      const mes = l.mes || l.periodo || l.period || "";
      const cant = l.cantidad ?? l.cant ?? 1;
      const codigo = l.moduloNombre || l.modulo || l.moduloNumero || "";
      const prof =
        l.profesionalNombre ||
        l.profesional ||
        (l.profesionales &&
          (l.profesionales.profesional?.[0] ||
            l.profesionales.coordinador?.[0] ||
            l.profesionales.pasante?.[0] ||
            l.profesionales.directora?.[0])) ||
        "";

      // aPagar en fila: si ya viene, úsalo; sino intenta monto
      const aPagar = Number(l.aPagar ?? l.monto ?? 0);

      const pagPadres = Number(l.pagPadres ?? 0);
      const detPadres = l.detPadres || l.detallePadres || l.observaciones || "";
      const pagOS = Number(l.pagOS ?? 0);
      const detOS = l.detOS || l.detalleOS || l.observacionOS || "";

      return {
        mes,
        cantidad: cant,
        modulo: codigo,
        prof,
        aPagar: fmtARS(aPagar),
        pagPadres: fmtARS(pagPadres),
        detPadres,
        pagOS: fmtARS(pagOS),
        detOS,
      };
    });

    // ----- Construcción de facturas (derecha) -----
    const rightRows = (Array.isArray(facturas) ? facturas : []).map((f) => ({
      mes: f.mes || "",
      nro: f.nro || "",
      monto: fmtARS(f.monto || 0),
      detalle: (f.detalle || "").toString(),
      fecha: f.fecha || "",
    }));

    // ---------- DIBUJO: TABLA IZQUIERDA ----------
    // fila título (opcional)
    doc.fontSize(10).fillColor("#000").text("", x1, y);

    // header
    let yLeft = drawTableHeader(x1, y, leftW, colsLeft);
    let yRight = y; // para la tabla derecha

    // ---------- DIBUJO: TABLA DERECHA (FACTURAS) ----------
    doc.fontSize(10).fillColor("#000").text("FACTURAS", x2, y - 14);
    yRight = drawTableHeader(x2, y, rightW, colsRight);

    // Filas sincronizadas en altura (la más larga manda)
    const maxRows = Math.max(leftRows.length, rightRows.length);
    let yy = Math.max(yLeft, yRight);

    // Para mantener “lado a lado” prolijo: dibujamos por índice y avanzamos juntos
    for (let i = 0; i < maxRows; i++) {
      if (needNewPage(yy, rowH + 120)) {
        doc.addPage({ margin: 28, size: "A4", layout: "landscape" });
        // rehacemos cabecera mínima
        let y2 = 28;
        if (logoDrawn) {
          // logo en páginas siguientes (opcional). Si querés, lo repetimos:
          try {
            const logoFile = "fc885963d690a6787ca787cf208cdd25_1778x266_fit.png";
            const candidates = [
              path.resolve(process.cwd(), "frontend", "img", logoFile),
              path.resolve(__dirname, "..", "..", "frontend", "img", logoFile),
              path.resolve(process.cwd(), "..", "frontend", "img", logoFile),
            ];
            const found = candidates.find((p) => fs.existsSync(p));
            if (found) doc.image(found, 28, 18, { width: 170 });
          } catch (_) {}
          y2 = 70;
        }

        doc.save();
        doc.rect(left, y2, right - left, 22).fill(green);
        doc.restore();
        doc.fontSize(11).fillColor("#000").text(`AREA:${(area.nombre || "").toUpperCase()}`, left + 8, y2 + 6);
        y2 += 30;

        yLeft = drawTableHeader(x1, y2, leftW, colsLeft);
        doc.fontSize(10).fillColor("#000").text("FACTURAS", x2, y2 - 14);
        yRight = drawTableHeader(x2, y2, rightW, colsRight);

        yy = Math.max(yLeft, yRight);
      }

      // izquierda
      if (leftRows[i]) {
        yy = drawRow(x1, yy, leftW, colsLeft, leftRows[i]);
      } else {
        // fila vacía para mantener alto parejo
        yy = drawRow(x1, yy, leftW, colsLeft, {});
      }

      // derecha: mismo yy-rowH ya se consumió; para alinear, dibujamos en la misma banda
      // Recalculo y del renglón actual:
      const rowTop = yy - rowH;
      if (rightRows[i]) drawRow(x2, rowTop, rightW, colsRight, rightRows[i]);
      else drawRow(x2, rowTop, rightW, colsRight, {});
    }

    // ---------- Totales estilo “planilla” ----------
    let yTot = yy + 10;

    // caja total a pagar (izquierda)
    if (needNewPage(yTot, 80)) {
      doc.addPage({ margin: 28, size: "A4", layout: "landscape" });
      yTot = 28;
    }

    const boxH = 46;
    doc.save();
    doc.rect(x1 + 330, yTot, 160, boxH).stroke("#000");
    doc.restore();
    doc.fontSize(9).fillColor("#000")
      .text("Total que debería\nhaber pagado", x1 + 336, yTot + 8, { width: 110 });
    doc.fontSize(10).text(fmtARS(totalAPagar), x1 + 430, yTot + 16, { width: 55, align: "right" });

    // caja total pagado (si tiene OS, suma; si no, solo padres)
    doc.save();
    doc.rect(x1 + 500, yTot, 160, boxH).stroke("#000");
    doc.restore();
    doc.fontSize(9).fillColor("#000").text("Total que pagó", x1 + 506, yTot + 8);
    doc.fontSize(10).text(fmtARS(totalPagado), x1 + 506, yTot + 26, { width: 148, align: "right" });

    // caja total facturado (derecha abajo)
    doc.save();
    doc.rect(x2 + 90, yTot, 200, boxH).stroke("#000");
    doc.restore();
    doc.fontSize(9).fillColor("#000").text("Total que se le facturó", x2 + 96, yTot + 8);
    doc.fontSize(10).text(fmtARS(totalFacturado), x2 + 96, yTot + 26, { width: 188, align: "right" });

    doc.end();
  } catch (err) {
    console.error("estado-de-cuenta PDF:", err);
    res.status(500).json({ error: "No se pudo generar el PDF" });
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


