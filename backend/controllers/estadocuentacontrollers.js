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
  let doc = null;

  try {
    const fs = require("fs");
    const path = require("path");
    const PDFDocument = require("pdfkit");

    const dni = toStr(req.params.dni).trim();
    const areaId = toStr(req.query.areaId || "").trim();

    // Compat: period viejo (un mes) + nuevo desde/hasta
    const period = req.query.period ? toStr(req.query.period).trim() : null;
    const desde = req.query.desde ? toStr(req.query.desde).trim() : null;
    const hasta = req.query.hasta ? toStr(req.query.hasta).trim() : null;

    if (!areaId) return res.status(400).json({ error: "areaId es obligatorio" });

    const paciente = await Paciente.findOne({ dni }).lean();
    if (!paciente) return res.status(404).json({ error: "Paciente no encontrado" });

    const area = await Area.findById(areaId).lean();
    if (!area) return res.status(404).json({ error: "Área no encontrada" });

    // ✅ OS según tu enum real
    const cond = String(paciente.condicionDePago || "").trim();
    const tieneOS = cond === "Obra Social" || cond.startsWith("Obra Social +");

    // ---------- Helpers ----------
    function fmtARS(n) {
      const num = Number(n || 0);
      return `$ ${num.toLocaleString("es-AR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
    }

    function yyyymmFromMov(m) {
      return (
        m.period ||
        (m.fecha ? new Date(m.fecha).toISOString().slice(0, 7) : "") ||
        ""
      );
    }

    function fracCantidad(x) {
      const v = Number(x || 0);
      if (!v) return "";
      // valores típicos
      const map = new Map([
        [0.25, "1/4"],
        [0.5, "1/2"],
        [0.75, "3/4"],
        [1, "1"],
        [1.25, "1 1/4"],
        [1.5, "1 1/2"],
        [1.75, "1 3/4"],
        [2, "2"],
      ]);
      const rounded = Math.round(v * 100) / 100;
      if (map.has(rounded)) return map.get(rounded);

      // fallback simple (decimal con coma)
      return String(rounded).replace(".", ",");
    }

    function safeStr(v) {
      return v == null ? "" : String(v);
    }

    function pickFirst(...vals) {
      for (const v of vals) {
        if (v !== undefined && v !== null && String(v).trim() !== "") return v;
      }
      return "";
    }

    // Recorta texto para que NO rompa filas (sin saltos raros)
    function fitText(doc, text, maxW) {
      const s = safeStr(text);
      if (!s) return "";
      if (doc.widthOfString(s) <= maxW) return s;
      const ell = "…";
      let lo = 0, hi = s.length;
      while (lo < hi) {
        const mid = Math.floor((lo + hi) / 2);
        const t = s.slice(0, mid).trimEnd() + ell;
        if (doc.widthOfString(t) <= maxW) lo = mid + 1;
        else hi = mid;
      }
      const out = s.slice(0, Math.max(0, lo - 1)).trimEnd() + ell;
      return out;
    }

    // ---------- Rango ----------
    // Si viene desde/hasta => usamos eso.
    // Si no viene y viene period => desde=hasta=period.
    // Si no viene nada => todo.
    const rangeDesde = desde || period || null;
    const rangeHasta = hasta || period || null;

    function buildPeriodQuery() {
      if (rangeDesde && rangeHasta) return { period: { $gte: rangeDesde, $lte: rangeHasta } };
      if (rangeDesde) return { period: { $gte: rangeDesde } };
      if (rangeHasta) return { period: { $lte: rangeHasta } };
      return {};
    }

    const periodQuery = buildPeriodQuery();

    // ✅ Movimientos del rango (para tabla detalle + facturas)
    const movsRango = await Movimiento.find({
      dni,
      areaId,
      ...periodQuery,
    })
      .sort({ fecha: 1, period: 1 })
      .lean();

    // ✅ Movimientos acumulados hasta "hasta" (para totales / saldo)
    const movsHasta = await Movimiento.find({
      dni,
      areaId,
      ...(rangeHasta ? { period: { $lte: rangeHasta } } : {}),
    })
      .sort({ fecha: 1, period: 1 })
      .lean();

    // ---------- Totales ----------
    let pagadoOS = 0,
      pagadoPART = 0,
      cargos = 0,
      ajustesMas = 0,
      ajustesMenos = 0,
      totalFacturado = 0;

    for (const m of movsHasta) {
      const monto = Number(m.monto || 0);

      if (m.tipo === "CARGO") {
        cargos += monto;
        pagadoPART += parseNumberLike(m.pagPadres, 0);
        pagadoOS += parseNumberLike(m.pagOS, 0);
      } else if (m.tipo === "OS") pagadoOS += monto;
      else if (m.tipo === "PART") pagadoPART += monto;
      else if (m.tipo === "AJUSTE+") ajustesMas += monto;
      else if (m.tipo === "AJUSTE-") ajustesMenos += monto;
      else if (m.tipo === "FACT") totalFacturado += monto;
    }

    if (!tieneOS) pagadoOS = 0;

    const totalCargos = cargos;
    const totalPagado = pagadoOS + pagadoPART;
    const saldo = Number(
      (totalCargos - (totalPagado + ajustesMas - ajustesMenos)).toFixed(2)
    );

    // Diferencia “FACT - PAGADO” (como tu barra)
    const difFactPag = Number((totalFacturado - totalPagado).toFixed(2));

    // ---------- Filas detalle (tipo Excel) ----------
    // Queremos líneas tipo CARGO (y si tenés ajustes manuales que tu UI mete como CARGO, entran igual)
    const filas = movsRango
      .filter((m) => m.tipo === "CARGO")
      .map((m) => {
        const mes = yyyymmFromMov(m) || "-";

        // cantidad: puede venir como m.cantidad o m.cant
        const cantidad = fracCantidad(pickFirst(m.cantidad, m.cant, 1));

        // código / módulo: intenta varios campos típicos
        const codigo = pickFirst(
          m.codigo,
          m.codigoModulo,
          m.moduloCodigo,
          m.nombreModulo,
          m.moduloNombre,
          m.detalleModulo,
          m.descripcion,
          ""
        );

        // profesional: intenta varios campos típicos
        const profesional = pickFirst(
          m.profesionalNombre,
          m.profesional,
          m.nombreProfesional,
          (m.profesionalId && m.profesionalId.nombre) || "",
          ""
        );

        // pagos y detalles
        const aPagar = Number(m.monto || 0);
        const pagPadres = parseNumberLike(m.pagPadres, 0);
        const detPadres = safeStr(pickFirst(m.detPadres, m.detallePadres, m.detallePagoPadres, m.detalle, ""));

        const pagOS = tieneOS ? parseNumberLike(m.pagOS, 0) : 0;
        const detOS = tieneOS ? safeStr(pickFirst(m.detOS, m.detalleOS, m.detallePagoOS, "")) : "";

        return {
          mes,
          cantidad,
          codigo,
          profesional,
          aPagar,
          pagPadres,
          detPadres,
          pagOS,
          detOS,
        };
      });

    // ---------- Facturas (siempre del rango) ----------
    const facturas = movsRango
      .filter((m) => m.tipo === "FACT")
      .map((m) => ({
        mes: yyyymmFromMov(m) || "-",
        nro: pickFirst(m.nroRecibo, m.nroFactura, m.tipoFactura, m.nFactura, "-"),
        monto: Number(m.monto || 0),
        fecha: m.fecha ? new Date(m.fecha) : null,
      }))
      .sort((a, b) => String(a.mes).localeCompare(String(b.mes)));

    function fmtFecha(d) {
      if (!d) return "";
      const dd = String(d.getDate()).padStart(2, "0");
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const yy = d.getFullYear();
      return `${dd}/${mm}/${yy}`;
    }

    // ---------- PDF headers ----------
    res.setHeader("Content-Type", "application/pdf");
    // inline para que abra en pestaña (si el navegador igual descarga, es configuración del browser)
    res.setHeader(
      "Content-Disposition",
      `inline; filename="Extracto_${dni}_${(area.nombre || "area").replace(/\s+/g, "_")}${rangeDesde || rangeHasta ? `_(${rangeDesde || ""}-${rangeHasta || ""})` : ""}.pdf"`
    );
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    // A4 horizontal para que “entre” como tu captura
    doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 24 });
    doc.pipe(res);

    // ---------- Estilos base ----------
    const PAGE_W = doc.page.width;
    const PAGE_H = doc.page.height;
    const M = doc.page.margins.left;

    const greenBar = "#9bbb59";
    const headerFill = "#e7f1df";
    const grid = "#1b1b1b";

    function drawTopHeader() {
      // LOGO opcional (no rompe si no está)
      try {
        const logoFile = "fc885963d690a6787ca787cf208cdd25_1778x266_fit.png";
        const candidates = [
          path.resolve(process.cwd(), "frontend", "img", logoFile),
          path.resolve(__dirname, "..", "..", "frontend", "img", logoFile),
          path.resolve(process.cwd(), "..", "frontend", "img", logoFile),
        ];
        const found = candidates.find((p) => fs.existsSync(p));
        if (found) doc.image(found, M, 14, { width: 160 });
      } catch {}

      doc
        .font("Helvetica-Bold")
        .fontSize(14)
        .fillColor("#000")
        .text("Informe de estado de cuenta", M, 16);

      doc
        .font("Helvetica")
        .fontSize(10)
        .fillColor("#000")
        .text(`${paciente.nombre || "-"} - DNI ${paciente.dni || "-"}`, M, 36);

      doc
        .fontSize(9)
        .fillColor("#333")
        .text(`Área: ${area.nombre || "-"}`, M, 50);

      const rangoTxt =
        rangeDesde || rangeHasta
          ? `Rango: ${rangeDesde || "—"} a ${rangeHasta || "—"}`
          : "Rango: (todos los periodos)";
      doc.text(rangoTxt, M, 62);

      // barra verde tipo excel
      const barY = 80;
      const barH = 24;
      doc.save();
      doc.fillColor(greenBar).rect(M, barY, PAGE_W - M * 2, barH).fill();
      doc.restore();

      doc
        .font("Helvetica-Bold")
        .fontSize(10)
        .fillColor("#000")
        .text(`AREA: ${String(area.nombre || "").toUpperCase()}`, M, barY + 7, {
          width: PAGE_W - M * 2,
          align: "center",
        });

      // “DIF ENTRE FACT Y PAGADO” a la derecha
      const rightTxt = `DIF ENTRE FACT Y PAGADO  -$`;
      const rightVal = fmtARS(Math.abs(difFactPag));
      const rightX = PAGE_W - M - 280;

      doc
        .font("Helvetica-Bold")
        .fontSize(8)
        .fillColor("#000")
        .text(rightTxt, rightX, barY + 8, { width: 200, align: "left" });

      doc
        .font("Helvetica-Bold")
        .fontSize(9)
        .fillColor("#000")
        .text(rightVal, rightX + 200, barY + 7, { width: 80, align: "right" });

      doc.y = barY + barH + 10;
    }

    // Tabla “Excel” (grid) con control total
    function drawTable({ x, y, width, columns, rows, rowH, headerH, title }) {
      let cy = y;

      const drawHeader = () => {
        // título opcional
        if (title) {
          doc.font("Helvetica-Bold").fontSize(9).fillColor("#000").text(title, x, cy);
          cy += 12;
        }

        // header fill
        doc.save();
        doc.fillColor(greenBar).rect(x, cy, width, headerH).fill();
        doc.restore();

        // sub header (labels)
        const hy = cy + headerH;
        doc.save();
        doc.fillColor(headerFill).rect(x, hy, width, rowH).fill();
        doc.restore();

        // bordes header
        doc.save();
        doc.strokeColor(grid).lineWidth(1);
        doc.rect(x, cy, width, headerH + rowH).stroke();
        doc.restore();

        // texto header (AREA o FACTURAS centrado dentro de barra verde)
        doc.font("Helvetica-Bold").fontSize(9).fillColor("#000").text(
          title || "",
          x,
          cy + 7,
          { width, align: "center" }
        );

        // labels
        let cx = x;
        doc.font("Helvetica-Bold").fontSize(7).fillColor("#000");

        for (const c of columns) {
          // lineas verticales
          doc.save();
          doc.strokeColor(grid).lineWidth(1);
          doc.moveTo(cx, hy).lineTo(cx, hy + rowH).stroke();
          doc.restore();

          const label = c.label || "";
          doc.text(label, cx + 3, hy + 4, { width: c.w - 6, align: c.align || "left" });
          cx += c.w;
        }

        // última línea vertical + horizontal bajo labels
        doc.save();
        doc.strokeColor(grid).lineWidth(1);
        doc.moveTo(x + width, hy).lineTo(x + width, hy + rowH).stroke();
        doc.moveTo(x, hy + rowH).lineTo(x + width, hy + rowH).stroke();
        doc.restore();

        cy = hy + rowH;
      };

      const ensureSpace = () => {
        if (cy + rowH > PAGE_H - M - 10) {
          doc.addPage({ size: "A4", layout: "landscape", margin: 24 });
          drawTopHeader();
          cy = doc.y;
          // re-dibuja header de tabla en nueva página (sin repetir título grande)
          drawHeader();
        }
      };

      const drawRow = (r) => {
        ensureSpace();

        // fondo alternado muy sutil como planilla
        doc.save();
        doc.fillColor("#eef6e9").rect(x, cy, width, rowH).fill();
        doc.restore();

        // bordes fila
        doc.save();
        doc.strokeColor(grid).lineWidth(1);
        doc.rect(x, cy, width, rowH).stroke();
        doc.restore();

        // celdas
        let cx = x;
        doc.font("Helvetica").fontSize(7).fillColor("#000");

        for (const c of columns) {
          // línea vertical
          doc.save();
          doc.strokeColor(grid).lineWidth(1);
          doc.moveTo(cx, cy).lineTo(cx, cy + rowH).stroke();
          doc.restore();

          const raw = c.value(r);
          const txt = safeStr(raw);

          // padding interno
          const innerW = c.w - 6;
          const t = fitText(doc, txt, innerW);

          doc.text(
            t,
            cx + 3,
            cy + 3,
            { width: innerW, align: c.align || "left" }
          );

          cx += c.w;
        }

        // última vertical
        doc.save();
        doc.strokeColor(grid).lineWidth(1);
        doc.moveTo(x + width, cy).lineTo(x + width, cy + rowH).stroke();
        doc.restore();

        cy += rowH;
      };

      drawHeader();

      for (const r of rows) drawRow(r);

      return cy;
    }

    // Totales como tu caja (izq) + caja facturado (der)
    function drawTotalsBlock(y) {
      const boxH = 44;
      const leftW = 260;
      const rightW = 150;

      const baseY = y + 14;

      // Caja izquierda (debería / pagó)
      const leftX = Math.round((PAGE_W - leftW) / 2);

      doc.save();
      doc.strokeColor(grid).lineWidth(1);
      doc.rect(leftX, baseY, leftW, boxH).stroke();
      doc.moveTo(leftX + 95, baseY).lineTo(leftX + 95, baseY + boxH).stroke();
      doc.moveTo(leftX, baseY + boxH / 2).lineTo(leftX + leftW, baseY + boxH / 2).stroke();
      doc.restore();

      doc.font("Helvetica-Bold").fontSize(7).fillColor("#000");
      doc.text("Total que deberia\nhaber pagado", leftX + 6, baseY + 6, { width: 85 });
      doc.text("Total que pago", leftX + 6, baseY + boxH / 2 + 10, { width: 85 });

      doc.font("Helvetica-Bold").fontSize(9).fillColor("#000");
      doc.text(fmtARS(totalCargos), leftX + 100, baseY + 10, { width: leftW - 110, align: "right" });
      doc.text(fmtARS(totalPagado), leftX + 100, baseY + boxH / 2 + 12, { width: leftW - 110, align: "right" });

      // Caja derecha (total facturado)
      const rightX = PAGE_W - M - rightW;
      doc.save();
      doc.strokeColor(grid).lineWidth(1);
      doc.rect(rightX, baseY + 10, rightW, 34).stroke();
      doc.moveTo(rightX + 85, baseY + 10).lineTo(rightX + 85, baseY + 44).stroke();
      doc.restore();

      doc.font("Helvetica-Bold").fontSize(7).fillColor("#000");
      doc.text("Total que se\nle facturo", rightX + 6, baseY + 16, { width: 75 });

      doc.font("Helvetica-Bold").fontSize(9).fillColor("#000");
      doc.text(fmtARS(totalFacturado), rightX + 88, baseY + 26, { width: rightW - 92, align: "right" });

      return baseY + boxH + 20;
    }

    // ---------- ARRANCA PDF ----------
    drawTopHeader();

    // Layout principal (tabla + facturas abajo)
    const tableX = M;
    const tableW = PAGE_W - M * 2;

    // Columnas como tu captura, con o sin OS
    // Con OS: 9 cols
    // Sin OS: 7 cols (reparte ancho en detalle y pagado por padres para que se lea mejor)
    let columns;

    if (tieneOS) {
      // totalW ~ 100% de tableW
      columns = [
        { label: "MES", w: 70, align: "left", value: (r) => r.mes },
        { label: "CANT", w: 55, align: "center", value: (r) => r.cantidad },
        { label: "CODIGO", w: 230, align: "left", value: (r) => r.codigo },
        { label: "PROFESIONAL", w: 150, align: "left", value: (r) => r.profesional },
        { label: "A PAGAR", w: 85, align: "right", value: (r) => fmtARS(r.aPagar) },
        { label: "PAGADO POR\nPADRES", w: 110, align: "right", value: (r) => fmtARS(r.pagPadres) },
        { label: "DETALLE", w: 120, align: "left", value: (r) => r.detPadres },
        { label: "PAGADO POR\nO.S", w: 95, align: "right", value: (r) => fmtARS(r.pagOS) },
        { label: "DETALLE", w: 120, align: "left", value: (r) => r.detOS },
      ];
    } else {
      columns = [
        { label: "MES", w: 70, align: "left", value: (r) => r.mes },
        { label: "CANT", w: 55, align: "center", value: (r) => r.cantidad },
        { label: "CODIGO", w: 260, align: "left", value: (r) => r.codigo },
        { label: "PROFESIONAL", w: 170, align: "left", value: (r) => r.profesional },
        { label: "A PAGAR", w: 95, align: "right", value: (r) => fmtARS(r.aPagar) },
        { label: "PAGADO POR\nPADRES", w: 125, align: "right", value: (r) => fmtARS(r.pagPadres) },
        { label: "DETALLE", w: 195, align: "left", value: (r) => r.detPadres },
      ];
    }

    // Ajusta ancho exacto a tableW (por si cambia el layout)
    const sumW = columns.reduce((a, c) => a + c.w, 0);
    const diff = tableW - sumW;
    if (Math.abs(diff) > 0.5) {
      // mete el ajuste en CODIGO para no romper nada
      const idx = columns.findIndex((c) => c.label === "CODIGO");
      if (idx >= 0) columns[idx].w += diff;
    }

    // Tabla principal
    const afterTableY = drawTable({
      x: tableX,
      y: doc.y,
      width: tableW,
      columns,
      rows: filas,
      rowH: 16,
      headerH: 24,
      title: "", // la barra verde de arriba ya dice el AREA como tu captura
    });

    // Si no entra facturas + totales en la página, nueva página
    const needSpace = 140;
    if (afterTableY + needSpace > PAGE_H - M) {
      doc.addPage({ size: "A4", layout: "landscape", margin: 24 });
      drawTopHeader();
    } else {
      doc.y = afterTableY + 10;
    }

    // -------- FACTURAS abajo (misma estética, NEGRO, sin verde raro) --------
    doc.font("Helvetica-Bold").fontSize(10).fillColor("#000").text("FACTURAS", M, doc.y);
    doc.y += 6;

    const fCols = [
      { label: "MES", w: 90, align: "left", value: (f) => f.mes },
      { label: "N FACTURA", w: 140, align: "left", value: (f) => String(f.nro || "") },
      { label: "MONTO", w: 180, align: "right", value: (f) => fmtARS(f.monto) },
      { label: "FECHA", w: 140, align: "left", value: (f) => fmtFecha(f.fecha) },
    ];

    // centra la tabla de facturas como en tu captura “buena”
    const fW = fCols.reduce((a, c) => a + c.w, 0);
    const fX = Math.round((PAGE_W - fW) / 2);

    const afterFactY = drawTable({
      x: fX,
      y: doc.y,
      width: fW,
      columns: fCols,
      rows: facturas,
      rowH: 16,
      headerH: 0,      // no barra verde arriba acá
      title: "",       // ya pusimos "FACTURAS" en texto
    });

    // Totales abajo (como tu caja)
    doc.y = afterFactY;
    drawTotalsBlock(doc.y);

    doc.end();
  } catch (err) {
    console.error("estado-de-cuenta PDF:", err);
    try {
      if (doc && !doc._ended) doc.end();
    } catch {}
    if (!res.headersSent) res.status(500).json({ error: "No se pudo generar el PDF" });
    else res.end();
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


