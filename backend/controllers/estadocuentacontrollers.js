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

// ----------------- GET /api/estado-de-cuenta/:dni/extracto?areaId=...&desde=YYYY-MM&hasta=YYYY-MM&period=YYYY-MM -----------------
async function generarExtractoPDF(req, res) {
  try {
    const fs = require("fs");
    const path = require("path");
    const PDFDocument = require("pdfkit");

    const dni = toStr(req.params.dni).trim();
    const areaId = toStr(req.query.areaId || "").trim();

    // Soporta:
    // - period=YYYY-MM (un solo mes)
    // - desde=YYYY-MM&hasta=YYYY-MM (rango)
    // - si no viene nada => todos
    const qPeriod = req.query.period ? toStr(req.query.period).trim() : null;
    const qDesde = req.query.desde ? toStr(req.query.desde).trim() : null;
    const qHasta = req.query.hasta ? toStr(req.query.hasta).trim() : null;

    if (!areaId) return res.status(400).json({ error: "areaId es obligatorio" });

    const paciente = await Paciente.findOne({ dni }).lean();
    if (!paciente) return res.status(404).json({ error: "Paciente no encontrado" });

    const area = await Area.findById(areaId).lean();
    if (!area) return res.status(404).json({ error: "Área no encontrada" });

    // ✅ tu enum real
    const tieneOS = String(paciente.condicionDePago || "") !== "Particular";

    // -------- helpers --------
    const inRange = (p, d, h) => {
      if (!p) return false;
      const dd = d || "1900-01";
      const hh = h || "9999-12";
      return p >= dd && p <= hh;
    };

    const yyyymmFromAny = (x) => {
      if (!x) return "";
      if (typeof x === "string" && /^\d{4}-\d{2}$/.test(x)) return x;
      const dt = new Date(x);
      if (!Number.isFinite(dt.getTime())) return "";
      return dt.toISOString().slice(0, 7);
    };

    function fmtARS(n) {
      const num = Number(n || 0);
      return `$ ${num.toLocaleString("es-AR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
    }

    // cantidad como fracciones (0.25=1/4, 0.5=1/2, 0.75=3/4, 1.25=1 1/4, etc.)
    function fmtCantidad(val) {
      const n = Number(val || 0);
      if (!n) return "";
      const q = Math.round(n * 4); // cuartos
      const ent = Math.floor(q / 4);
      const rem = q % 4;
      const remTxt = rem === 0 ? "" : rem === 1 ? "1/4" : rem === 2 ? "1/2" : "3/4";
      if (ent === 0) return remTxt;
      if (rem === 0) return String(ent);
      return `${ent} ${remTxt}`;
    }

    const rango = (() => {
      if (qDesde || qHasta) return { desde: qDesde || null, hasta: qHasta || null };
      if (qPeriod) return { desde: qPeriod, hasta: qPeriod };
      return { desde: null, hasta: null };
    })();

    // -------- datos (filas + movimientos) --------
    // Filas informativas (módulos/eventos/ajustes manuales) - la tabla grande sale de acá
    let filasInfo = await buildFilasArea(paciente, areaId);
    if (!Array.isArray(filasInfo)) filasInfo = [];

    // Filtrar filas por rango si vienen periodos
    if (rango.desde || rango.hasta) {
      filasInfo = filasInfo.filter((r) => {
        const per = r.mes || r.period || yyyymmFromAny(r.fecha) || "";
        return inRange(String(per), rango.desde, rango.hasta);
      });
    }

    // Movimientos (para totales + facturas)
    const movQueryBase = { dni, areaId };

    const movsRango = await Movimiento.find({
      ...movQueryBase,
      ...(rango.desde || rango.hasta ? { period: { $gte: rango.desde || "1900-01", $lte: rango.hasta || "9999-12" } } : {}),
    })
      .sort({ fecha: 1 })
      .lean();

    const movsHasta = await Movimiento.find({
      ...movQueryBase,
      ...(rango.hasta ? { period: { $lte: rango.hasta } } : {}),
    })
      .sort({ fecha: 1 })
      .lean();

    // -------- totales (acumulado hasta "hasta") --------
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
    const saldo = Number((totalCargos - (totalPagado + ajustesMas - ajustesMenos)).toFixed(2));

    // DIF ENTRE FACT Y PAGADO = facturado - pagado (padres + os)
    const difFactPag = Number((totalFacturado - totalPagado).toFixed(2));

    // -------- facturas (del rango seleccionado) --------
    const facturas = (Array.isArray(movsRango) ? movsRango : [])
      .filter((m) => m.tipo === "FACT")
      .map((m) => ({
        mes: m.period || yyyymmFromAny(m.fecha) || "-",
        nro: m.nroRecibo || m.tipoFactura || "-",
        monto: Number(m.monto || 0),
        fecha: m.fecha ? new Date(m.fecha).toLocaleDateString("es-AR") : "",
      }))
      .sort((a, b) => String(a.mes).localeCompare(String(b.mes)));

    // -------- PDF headers (NO se tilda / stream) --------
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="Extracto_${dni}_${(area.nombre || "area").replace(/\s+/g, "_")}${
        rango.desde || rango.hasta ? `_${rango.desde || "inicio"}_a_${rango.hasta || "hoy"}` : ""
      }.pdf"`
    );

    const doc = new PDFDocument({
      size: "A4",
      layout: "landscape", // ✅ para que entre como tu Excel
      margin: 28,
      bufferPages: false,
    });

    // Evita “tildes” por errores silenciosos
    doc.on("error", (e) => {
      try {
        console.error("PDFKit error:", e);
        if (!res.headersSent) res.status(500).json({ error: "No se pudo generar el PDF" });
        else res.end();
      } catch (_) {}
    });

    doc.pipe(res);

    // -------- estilos --------
    const GREEN = "#9BBB59";      // barra
    const HEADER_FILL = "#E6F0D8"; // encabezado tabla
    const BODY_FILL = "#EEF6E6";   // cuerpo tabla
    const BORDER = "#111111";

    const pageW = doc.page.width;
    const pageH = doc.page.height;
    const margin = doc.page.margins.left;
    const usableW = pageW - doc.page.margins.left - doc.page.margins.right;

    const drawLogo = () => {
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
          doc.image(found, margin, 16, { width: 160 });
          logoDrawn = true;
        }
      } catch (e) {
        console.error("No se pudo cargar el logo en PDF:", e);
      }
      return logoDrawn;
    };

    const safeText = (s) => String(s ?? "");

    const rectFill = (x, y, w, h, color) => {
      doc.save();
      doc.fillColor(color).rect(x, y, w, h).fill();
      doc.restore();
    };

    const drawCellText = (text, x, y, w, h, align = "left", size = 7.6) => {
      doc
        .fontSize(size)
        .fillColor("#000")
        .text(safeText(text), x + 3, y + 3, {
          width: w - 6,
          height: h - 6,
          align,
          lineBreak: false,
          ellipsis: true,
        });
    };

    const drawTable = (opts) => {
      const {
        x,
        y,
        columns,
        rows,
        rowH = 14,
        headerH = 18,
        headerFill = HEADER_FILL,
        bodyFill = BODY_FILL,
        fontHeader = 7.1,
        fontBody = 7.6,
        pageBreakY = pageH - doc.page.margins.bottom - 18,
        repeatHeader = true,
      } = opts;

      let cy = y;

      // header
      const drawHeader = () => {
        rectFill(x, cy, columns.reduce((a, c) => a + c.w, 0), headerH, headerFill);
        doc.save();
        doc.lineWidth(1).strokeColor(BORDER).rect(x, cy, columns.reduce((a, c) => a + c.w, 0), headerH).stroke();
        doc.restore();

        let cx = x;
        for (const c of columns) {
          doc.save();
          doc.lineWidth(1).strokeColor(BORDER).rect(cx, cy, c.w, headerH).stroke();
          doc.restore();
          drawCellText(c.label, cx, cy, c.w, headerH, c.align || "left", fontHeader);
          cx += c.w;
        }
        cy += headerH;
      };

      drawHeader();

      for (const r of rows) {
        // page break
        if (cy + rowH > pageBreakY) {
          doc.addPage({ size: "A4", layout: "landscape", margin: 28 });
          // reset locals
          cy = doc.y = doc.page.margins.top;
          if (repeatHeader) drawHeader();
        }

        rectFill(x, cy, columns.reduce((a, c) => a + c.w, 0), rowH, bodyFill);

        let cx = x;
        for (const c of columns) {
          doc.save();
          doc.lineWidth(1).strokeColor(BORDER).rect(cx, cy, c.w, rowH).stroke();
          doc.restore();

          const val = typeof c.value === "function" ? c.value(r) : r[c.key];
          drawCellText(val, cx, cy, c.w, rowH, c.align || "left", fontBody);
          cx += c.w;
        }

        cy += rowH;
      }

      return cy;
    };

    // -------- header superior --------
    const logoDrawn = drawLogo();
    doc.y = logoDrawn ? 60 : doc.page.margins.top;

    doc.fontSize(13).fillColor("#000").text("Informe de estado de cuenta", margin, doc.y);
    doc.moveDown(0.35);

    doc.fontSize(9.5).fillColor("#000").text(`${paciente.nombre || "-"} - DNI ${paciente.dni || "-"}`, margin);
    doc.fontSize(8.5).fillColor("#333").text(`Área: ${area.nombre || "-"}`, margin);

    const rangoTxt =
      rango.desde || rango.hasta
        ? `Rango: ${rango.desde || "inicio"} a ${rango.hasta || "hoy"}`
        : "Rango: (todos los períodos)";
    doc.text(rangoTxt, margin);

    doc.moveDown(0.35);

    // -------- barra verde estilo excel --------
    const barY = doc.y + 6;
    const barH = 22;
    rectFill(margin, barY, usableW, barH, GREEN);

    doc
      .fontSize(9.5)
      .fillColor("#000")
      .text(`AREA: ${safeText(area.nombre || "").toUpperCase()}`, margin, barY + 6, {
        width: usableW * 0.65,
        align: "center",
        lineBreak: false,
      });

    doc
      .fontSize(8.6)
      .fillColor("#000")
      .text(`DIF ENTRE FACT Y PAGADO  -$`, margin + usableW * 0.62, barY + 6, {
        width: usableW * 0.25,
        align: "left",
        lineBreak: false,
      });

    doc
      .fontSize(8.9)
      .fillColor("#000")
      .text(fmtARS(Math.abs(difFactPag)), margin + usableW * 0.86, barY + 6, {
        width: usableW * 0.14,
        align: "right",
        lineBreak: false,
      });

    doc.y = barY + barH + 10;

    // -------- TABLA PRINCIPAL (como tu captura) --------
    // Columnas: MES, CANT, CODIGO, PROFESIONAL, A PAGAR, PAGADO POR PADRES, DETALLE, (si OS: PAGADO POR O.S, DETALLE)
    // ✅ NO mete “No aplica”. Si falta profesional, queda vacío.
    const baseCols = [
      { label: "MES", w: 72, align: "left", value: (r) => safeText(r.mes || r.period || yyyymmFromAny(r.fecha) || "") },
      { label: "CANT", w: 52, align: "center", value: (r) => fmtCantidad(r.cantidad ?? r.cant) },
      {
        label: "CODIGO",
        w: 230,
        align: "left",
        value: (r) => safeText(r.codigo || r.modulo || r.nombreModulo || r.detalleCargo || r.concepto || ""),
      },
      {
        label: "PROFESIONAL",
        w: 150,
        align: "left",
        value: (r) => safeText(r.profesional || r.profesionalNombre || r.nombreProfesional || ""),
      },
      { label: "A PAGAR", w: 84, align: "right", value: (r) => fmtARS(r.aPagar ?? r.montoCargo ?? r.cargo ?? r.monto ?? 0) },
      { label: "PAGADO POR\nPADRES", w: 108, align: "right", value: (r) => fmtARS(r.pagadoPadres ?? r.pagPadres ?? r.pagadoPART ?? 0) },
      { label: "DETALLE", w: 118, align: "left", value: (r) => safeText(r.detallePadres ?? r.detallePART ?? r.detallePagPadres ?? r.detalle || "") },
    ];

    const osCols = [
      { label: "PAGADO POR\nO.S", w: 98, align: "right", value: (r) => fmtARS(r.pagadoOS ?? r.pagOS ?? 0) },
      { label: "DETALLE", w: 118, align: "left", value: (r) => safeText(r.detalleOS ?? r.detallePagOS ?? "") },
    ];

    // Ajuste de anchos para que SIEMPRE entre en landscape sin cortar:
    // distribuimos el sobrante/reduce un poco texto si hace falta
    const colsMain = (() => {
      const cols = [...baseCols, ...(tieneOS ? osCols : [])];
      const sum = cols.reduce((a, c) => a + c.w, 0);
      const max = usableW;
      if (sum <= max) return cols;

      // si por algún motivo se pasa, recortamos un poco en CODIGO/PROFESIONAL/DETALLE
      const overflow = sum - max;
      const targets = cols.filter((c) => ["CODIGO", "PROFESIONAL", "DETALLE"].includes(String(c.label).replace(/\n/g, "")));
      let left = overflow;
      for (const c of targets) {
        if (left <= 0) break;
        const cut = Math.min(left, 20);
        c.w = Math.max(90, c.w - cut);
        left -= cut;
      }
      return cols;
    })();

    // rows: normalizamos para que SIEMPRE haya mes/cantidad/codigo/profesional/pagos
    const rowsMain = filasInfo.map((r) => ({
      ...r,
      mes: r.mes || r.period || yyyymmFromAny(r.fecha) || "",
      cantidad: r.cantidad ?? r.cant,
      codigo: r.codigo || r.modulo || r.nombreModulo || r.detalleCargo || r.concepto || "",
      profesional: r.profesional || r.profesionalNombre || r.nombreProfesional || "",
      aPagar: r.aPagar ?? r.montoCargo ?? r.cargo ?? r.monto ?? 0,
      pagadoPadres: r.pagadoPadres ?? r.pagPadres ?? 0,
      detallePadres: r.detallePadres ?? r.detallePagPadres ?? r.detalle ?? "",
      pagadoOS: r.pagadoOS ?? r.pagOS ?? 0,
      detalleOS: r.detalleOS ?? r.detallePagOS ?? "",
    }));

    // dibujar tabla principal
    const tableX = margin;
    const yAfterMain = drawTable({
      x: tableX,
      y: doc.y,
      columns: colsMain,
      rows: rowsMain,
      rowH: 14,
      headerH: 20,
      headerFill: HEADER_FILL,
      bodyFill: BODY_FILL,
      fontHeader: 7.0, // ✅ más chico para que NO se corte el título
      fontBody: 7.6,
      pageBreakY: pageH - doc.page.margins.bottom - 18,
      repeatHeader: true,
    });

    doc.y = yAfterMain + 10;

    // -------- FACTURAS + TOTALES (TODO JUNTO EN UNA “SECCIÓN”) --------
    // Querés: facturas todas juntas en una hoja (si no entra, se va a la siguiente, pero SIN cortar feo).
    const factTitleH = 16;
    const factRowH = 14;
    const factHeaderH = 18;

    const factCols = [
      { label: "MES", w: 90, align: "left", value: (f) => safeText(f.mes || "-") },
      { label: "N FACTURA", w: 110, align: "left", value: (f) => safeText(f.nro || "-") },
      { label: "MONTO", w: 170, align: "right", value: (f) => fmtARS(f.monto) },
      { label: "FECHA", w: 120, align: "left", value: (f) => safeText(f.fecha || "") },
    ];

    const factW = factCols.reduce((a, c) => a + c.w, 0);
    const factNeedH = factTitleH + factHeaderH + (facturas.length || 1) * factRowH + 90; // + caja totales

    const remaining = pageH - doc.page.margins.bottom - doc.y;
    if (factNeedH > remaining) {
      doc.addPage({ size: "A4", layout: "landscape", margin: 28 });
      // re-dibuja barra para continuidad visual
      const by = doc.y;
      rectFill(margin, by, usableW, barH, GREEN);
      doc
        .fontSize(9.5)
        .fillColor("#000")
        .text(`AREA: ${safeText(area.nombre || "").toUpperCase()}`, margin, by + 6, {
          width: usableW,
          align: "center",
          lineBreak: false,
        });
      doc.y = by + barH + 12;
    }

    // título FACTURAS
    doc.fontSize(10).fillColor("#000").text("FACTURAS", margin, doc.y);
    doc.y += 6;

    const yAfterFacts = drawTable({
      x: margin,
      y: doc.y,
      columns: factCols,
      rows: facturas.length ? facturas : [{ mes: "-", nro: "-", monto: 0, fecha: "" }],
      rowH: factRowH,
      headerH: factHeaderH,
      headerFill: HEADER_FILL,
      bodyFill: "#FFFFFF", // ✅ sin verde “horrible”
      fontHeader: 7.2,
      fontBody: 8.0,
      pageBreakY: pageH - doc.page.margins.bottom - 90, // dejamos lugar para totales
      repeatHeader: true,
    });

    doc.y = yAfterFacts + 14;

    // -------- cajas de totales (NEGRO, como tu captura) --------
    const boxH = 46;
    const boxW = 260;
    const boxX = margin + usableW * 0.38;
    const boxY = doc.y;

    // Caja central (debería/pagó)
    doc.save();
    doc.lineWidth(1).strokeColor(BORDER).rect(boxX, boxY, boxW, boxH).stroke();
    doc.moveTo(boxX + 70, boxY).lineTo(boxX + 70, boxY + boxH).stroke();
    doc.moveTo(boxX, boxY + boxH / 2).lineTo(boxX + boxW, boxY + boxH / 2).stroke();
    doc.restore();

    doc.fontSize(8.5).fillColor("#000").text("Total que deberia\nhaber pagado", boxX + 6, boxY + 7, { width: 64 });
    doc.fontSize(9).fillColor("#000").text(fmtARS(totalCargos), boxX + 74, boxY + 14, { width: boxW - 80, align: "right" });

    doc.fontSize(8.5).fillColor("#000").text("Total que pago", boxX + 6, boxY + boxH / 2 + 7, { width: 64 });
    doc.fontSize(9).fillColor("#000").text(fmtARS(totalPagado), boxX + 74, boxY + boxH / 2 + 14, {
      width: boxW - 80,
      align: "right",
    });

    // Caja derecha (total facturado)
    const box2W = 140;
    const box2X = margin + usableW - box2W;
    const box2Y = boxY + 4;

    doc.save();
    doc.lineWidth(1).strokeColor(BORDER).rect(box2X, box2Y, box2W, 44).stroke();
    doc.moveTo(box2X + 78, box2Y).lineTo(box2X + 78, box2Y + 44).stroke();
    doc.restore();

    doc.fontSize(8.5).fillColor("#000").text("Total que se\nle facturo", box2X + 6, box2Y + 8, { width: 70 });
    doc.fontSize(9).fillColor("#000").text(fmtARS(totalFacturado), box2X + 82, box2Y + 18, {
      width: box2W - 88,
      align: "right",
    });

    // -------- fin --------
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


