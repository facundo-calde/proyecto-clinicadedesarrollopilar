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

    // ✅ rango (prioridad: desde/hasta). period queda como compat (hasta = period)
    const desde = req.query.desde ? toStr(req.query.desde).trim() : null;
    const hasta = req.query.hasta
      ? toStr(req.query.hasta).trim()
      : (req.query.period ? toStr(req.query.period).trim() : null);

    if (!areaId) return res.status(400).json({ error: "areaId es obligatorio" });

    const paciente = await Paciente.findOne({ dni }).lean();
    if (!paciente) return res.status(404).json({ error: "Paciente no encontrado" });

    const area = await Area.findById(areaId).lean();
    if (!area) return res.status(404).json({ error: "Área no encontrada" });

    // ✅ según tu model (enum)
    const condicion = String(paciente.condicionDePago || "Particular");
    const tieneOS =
      condicion === "Obra Social" ||
      condicion.startsWith("Obra Social +");

    // (si lo necesitás para códigos desde módulos asignados, no lo rompo)
    let filasInfo = [];
    try {
      filasInfo = await buildFilasArea(paciente, areaId);
    } catch (_) {
      filasInfo = [];
    }

    // ----------------- Helpers -----------------
    function fmtARS(n) {
      const num = Number(n || 0);
      return `$ ${num.toLocaleString("es-AR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
    }

    const yyyymmFromMov = (m) =>
      m.period ||
      (m.fecha ? new Date(m.fecha).toISOString().slice(0, 7) : "") ||
      "";

    const safeStr = (v) => (v === null || v === undefined ? "" : String(v));

    function fmtCant(n) {
      const x = Number(n || 0);
      const map = {
        0.25: "1/4",
        0.5: "1/2",
        0.75: "3/4",
        1: "1",
        1.25: "1 1/4",
        1.5: "1 1/2",
        1.75: "1 3/4",
        2: "2",
      };
      const key = Number(x.toFixed(2));
      return map[key] || (x ? String(x).replace(".", ",") : "");
    }

    function pickProfesional(m) {
      return (
        safeStr(m.profesionalNombre) ||
        safeStr(m.profesional) ||
        safeStr(m.profesionalName) ||
        safeStr(m.nombreProfesional) ||
        safeStr(m.profNombre) ||
        safeStr(m.usuarioNombre) ||
        safeStr(m.usuario?.nombre) ||
        safeStr(m.usuario?.name) ||
        ""
      );
    }

    function pickCodigo(m) {
      return (
        safeStr(m.codigo) ||
        safeStr(m.codModulo) ||
        safeStr(m.moduloCodigo) ||
        safeStr(m.nombreModulo) ||
        safeStr(m.moduloNombre) ||
        safeStr(m.modulo) ||
        safeStr(m.detalleCargo) ||
        safeStr(m.detalle) ||
        ""
      );
    }

    function pickDetallePadres(m) {
      return (
        safeStr(m.detallePadres) ||
        safeStr(m.detallePagoPadres) ||
        safeStr(m.detallePART) ||
        safeStr(m.detallePart) ||
        safeStr(m.detalle) ||
        ""
      );
    }

    function pickDetalleOS(m) {
      return (
        safeStr(m.detalleOS) ||
        safeStr(m.detallePagoOS) ||
        safeStr(m.detalleObraSocial) ||
        safeStr(m.detalle) ||
        ""
      );
    }

    // ----------------- Queries -----------------
    // ✅ movimientos en rango (para tabla)
    const periodFilterRango = (() => {
      if (desde && hasta) return { period: { $gte: desde, $lte: hasta } };
      if (desde && !hasta) return { period: { $gte: desde } };
      if (!desde && hasta) return { period: { $lte: hasta } }; // si solo period/hasta, respeta "hasta"
      return {}; // sin filtro
    })();

    const movsRango = await Movimiento.find({
      dni,
      areaId,
      ...periodFilterRango,
    })
      .sort({ period: 1, fecha: 1, createdAt: 1 })
      .lean();

    // ✅ acumulado hasta "hasta" (para totales/saldo como venías haciendo)
    const movsHasta = await Movimiento.find({
      dni,
      areaId,
      ...(hasta ? { period: { $lte: hasta } } : {}),
    })
      .sort({ period: 1, fecha: 1, createdAt: 1 })
      .lean();

    // ----------------- Totales (acumulado hasta) -----------------
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
    const totalPagado = pagadoOS + pagadoPART; // padres + OS
    const totalPagadoConAjustes = Number((totalPagado + ajustesMas - ajustesMenos).toFixed(2));
    const saldo = Number((totalCargos - totalPagadoConAjustes).toFixed(2));

    // ✅ DIF entre FACT y PAGADO (como el excel)
    const difFactPagado = Number((totalFacturado - totalPagadoConAjustes).toFixed(2));

    // ----------------- Tabla principal (líneas tipo excel) -----------------
    // Solo filas “de grilla”: CARGO + ajustes manuales si te aparecen como AJUSTE+/AJUSTE-
    const lineas = movsRango
      .filter((m) => ["CARGO", "AJUSTE+", "AJUSTE-"].includes(String(m.tipo || "")))
      .map((m) => {
        const mes = yyyymmFromMov(m) || "-";
        const cant = fmtCant(m.cantidad ?? m.cant ?? "");
        const codigo = pickCodigo(m);

        // profesional: si el movimiento no lo trae, intento cruzar con filasInfo por código (fallback)
        let profesional = pickProfesional(m);
        if (!profesional && codigo && Array.isArray(filasInfo) && filasInfo.length) {
          const hit =
            filasInfo.find((x) => safeStr(x.codigo) === codigo && safeStr(x.mes) === mes) ||
            filasInfo.find((x) => safeStr(x.codigo) === codigo) ||
            null;
          if (hit) profesional = safeStr(hit.profesional || hit.prof || hit.nombreProfesional || "");
        }

        const aPagar = Number(m.monto || 0);

        const pagPadres = parseNumberLike(m.pagPadres, 0);
        const detPadres = pickDetallePadres(m);

        const pagOS = tieneOS ? parseNumberLike(m.pagOS, 0) : 0;
        const detOS = tieneOS ? pickDetalleOS(m) : "";

        return {
          mes,
          cant,
          codigo,
          profesional,
          aPagar,
          pagPadres,
          detPadres,
          pagOS,
          detOS,
        };
      });

    // ----------------- Facturas (rango) -----------------
    const facturas = movsRango
      .filter((m) => m.tipo === "FACT")
      .map((m) => ({
        mes: yyyymmFromMov(m) || "-",
        nro: safeStr(m.nroRecibo || m.tipoFactura || m.nroFactura || m.numero || "-"),
        monto: Number(m.monto || 0),
        fecha:
          m.fecha
            ? new Date(m.fecha).toLocaleDateString("es-AR")
            : (safeStr(m.fechaStr) || ""),
      }))
      .sort((a, b) => String(a.mes).localeCompare(String(b.mes)));

    // ----------------- PDF (LANDSCAPE para que ENTRE) -----------------
    res.setHeader("Content-Type", "application/pdf");
    // ✅ descarga sin “tilde”: attachment
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="Extracto_${dni}_${(area.nombre || "area").replace(/\s+/g, "_")}${desde || hasta ? `_Rango_${desde || "inicio"}_${hasta || "fin"}` : ""}.pdf"`
    );

    const doc = new PDFDocument({
      size: "A4",
      layout: "landscape",
      margins: { top: 24, left: 24, right: 24, bottom: 24 },
      bufferPages: true,
    });

    // (evita cuelgues por headers tardíos)
    res.flushHeaders && res.flushHeaders();
    doc.pipe(res);

    // ----------------- Logo (robusto) -----------------
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
        doc.image(found, doc.page.margins.left, 10, { width: 150 });
        logoDrawn = true;
      }
    } catch (e) {
      console.error("No se pudo cargar el logo en PDF:", e);
    }

    // ----------------- Layout helpers -----------------
    const M = doc.page.margins;
    const pageW = doc.page.width;
    const pageH = doc.page.height;
    const contentW = pageW - M.left - M.right;

    const GREEN = "#97b85a";       // barra
    const GREEN_LIGHT = "#eaf3df"; // header de tablas
    const GRID = "#000000";

    const barH = 22;

    function drawTopBar(areaNombre, difValue) {
      const x = M.left;
      const y = doc.y;

      doc.save();
      doc.rect(x, y, contentW, barH).fill(GREEN);
      doc.fillColor("#000").font("Helvetica-Bold").fontSize(10);

      doc.text(`AREA: ${areaNombre}`, x, y + 6, { width: contentW * 0.65, align: "center" });

      doc.text(
        `DIF ENTRE FACT Y PAGADO  -$`,
        x + contentW * 0.65,
        y + 6,
        { width: contentW * 0.23, align: "left" }
      );

      doc.text(
        fmtARS(difValue).replace("$ ", ""), // en el excel va sin el "$ " repetido al lado del "-$"
        x + contentW * 0.88,
        y + 6,
        { width: contentW * 0.12, align: "right" }
      );

      doc.restore();
      doc.y = y + barH + 10;
    }

    function hline(x1, x2, y) {
      doc.save();
      doc.strokeColor(GRID).lineWidth(0.6);
      doc.moveTo(x1, y).lineTo(x2, y).stroke();
      doc.restore();
    }

    function vline(x, y1, y2) {
      doc.save();
      doc.strokeColor(GRID).lineWidth(0.6);
      doc.moveTo(x, y1).lineTo(x, y2).stroke();
      doc.restore();
    }

    function rect(x, y, w, h, fill = null) {
      doc.save();
      if (fill) doc.fillColor(fill).rect(x, y, w, h).fill();
      doc.strokeColor(GRID).lineWidth(0.6).rect(x, y, w, h).stroke();
      doc.restore();
    }

    function ellipsize(text, maxWidth, fontSize, bold = false) {
      const s = safeStr(text);
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(fontSize);
      if (doc.widthOfString(s) <= maxWidth) return s;
      let out = s;
      while (out.length > 0 && doc.widthOfString(out + "…") > maxWidth) out = out.slice(0, -1);
      return out ? out + "…" : "";
    }

    // ----------------- Encabezado -----------------
    doc.y = 18;
    doc.font("Helvetica-Bold").fontSize(14).fillColor("#000").text("Informe de estado de cuenta", M.left, doc.y);
    doc.moveDown(0.35);
    doc.font("Helvetica").fontSize(10).fillColor("#000").text(`${paciente.nombre || "-"} - DNI ${paciente.dni || "-"}`);
    doc.font("Helvetica").fontSize(9).fillColor("#333").text(`Área: ${area.nombre || "-"}`);
    if (desde || hasta) {
      doc.text(`Rango: ${desde || "(inicio)"} → ${hasta || "(hoy)"}`);
    }
    doc.moveDown(0.6);

    // barra verde “excel”
    drawTopBar(area.nombre || "-", difFactPagado);

    // ----------------- TABLA PRINCIPAL (full width) -----------------
    // ✅ si NO tiene OS, saco columnas OS y agrando “CODIGO” y “DETALLE (padres)”
    const cols = (() => {
      if (tieneOS) {
        return [
          { key: "mes", label: "MES", w: 70, align: "left" },
          { key: "cant", label: "CANT", w: 50, align: "center" },
          { key: "codigo", label: "CODIGO", w: 220, align: "left" },
          { key: "profesional", label: "PROFESIONAL", w: 140, align: "left" },
          { key: "aPagar", label: "A PAGAR", w: 80, align: "right" },
          { key: "pagPadres", label: "PAGADO POR PADRES", w: 105, align: "right" },
          { key: "detPadres", label: "DETALLE", w: 120, align: "left" },
          { key: "pagOS", label: "PAGADO POR O.S", w: 95, align: "right" },
          { key: "detOS", label: "DETALLE", w: 120, align: "left" },
        ];
      }
      return [
        { key: "mes", label: "MES", w: 75, align: "left" },
        { key: "cant", label: "CANT", w: 55, align: "center" },
        { key: "codigo", label: "CODIGO", w: 280, align: "left" },
        { key: "profesional", label: "PROFESIONAL", w: 160, align: "left" },
        { key: "aPagar", label: "A PAGAR", w: 90, align: "right" },
        { key: "pagPadres", label: "PAGADO", w: 105, align: "right" },
        { key: "detPadres", label: "DETALLE", w: 190, align: "left" },
      ];
    })();

    // ajuste para calzar EXACTO al ancho disponible (evita “cortado a la derecha”)
    const sumW = cols.reduce((a, c) => a + c.w, 0);
    const scale = contentW / sumW;
    cols.forEach((c) => (c.w = Math.floor(c.w * scale)));
    // corrige resto por redondeo
    const fixedSum = cols.reduce((a, c) => a + c.w, 0);
    cols[cols.length - 1].w += (contentW - fixedSum);

    const rowH = 14;
    const headH = 18;
    const fontBody = 8;     // ✅ más chico para que se lea el contenido completo
    const fontHead = 8;

    function drawMainHeader() {
      const x0 = M.left;
      const y0 = doc.y;

      rect(x0, y0, contentW, headH, GREEN_LIGHT);

      doc.font("Helvetica-Bold").fontSize(fontHead).fillColor("#000");

      let x = x0;
      for (const c of cols) {
        doc.text(c.label, x + 3, y0 + 5, { width: c.w - 6, align: "center", lineBreak: false });
        x += c.w;
        vline(x, y0, y0 + headH);
      }
      hline(x0, x0 + contentW, y0 + headH);
      doc.y = y0 + headH;
    }

    function drawMainRow(r) {
      const x0 = M.left;
      const y0 = doc.y;

      // page break (sin superponer)
      if (y0 + rowH > pageH - M.bottom - 110) {
        doc.addPage();
        doc.y = 18;

        // reheader
        doc.font("Helvetica-Bold").fontSize(14).fillColor("#000").text("Informe de estado de cuenta", M.left, doc.y);
        doc.moveDown(0.35);
        doc.font("Helvetica").fontSize(10).fillColor("#000").text(`${paciente.nombre || "-"} - DNI ${paciente.dni || "-"}`);
        doc.font("Helvetica").fontSize(9).fillColor("#333").text(`Área: ${area.nombre || "-"}`);
        if (desde || hasta) doc.text(`Rango: ${desde || "(inicio)"} → ${hasta || "(hoy)"}`);
        doc.moveDown(0.6);
        drawTopBar(area.nombre || "-", difFactPagado);

        drawMainHeader();
      }

      rect(x0, y0, contentW, rowH, "#eef6e9");

      doc.font("Helvetica").fontSize(fontBody).fillColor("#000");

      const cells = {
        mes: r.mes || "-",
        cant: r.cant || "",
        codigo: r.codigo || "",
        profesional: r.profesional || "",
        aPagar: fmtARS(r.aPagar),
        pagPadres: fmtARS(r.pagPadres),
        detPadres: r.detPadres || "",
        pagOS: fmtARS(r.pagOS),
        detOS: r.detOS || "",
      };

      let x = x0;
      for (const c of cols) {
        const raw = cells[c.key] ?? "";
        const isMoney = ["aPagar", "pagPadres", "pagOS"].includes(c.key);

        const text =
          c.key === "codigo" || c.key === "detPadres" || c.key === "detOS" || c.key === "profesional"
            ? ellipsize(raw, c.w - 6, fontBody, false)
            : raw;

        doc.text(
          text,
          x + 3,
          y0 + 4,
          { width: c.w - 6, align: c.align || (isMoney ? "right" : "left"), lineBreak: false }
        );

        x += c.w;
        vline(x, y0, y0 + rowH);
      }

      doc.y = y0 + rowH;
    }

    // header + rows
    drawMainHeader();

    if (!lineas.length) {
      doc.font("Helvetica").fontSize(9).fillColor("#555").text("Sin movimientos en el rango seleccionado.");
      doc.moveDown(0.6);
    } else {
      for (const r of lineas) drawMainRow(r);
      doc.moveDown(0.6);
    }

    // ----------------- FACTURAS (ABAJO, sin superponer) -----------------
    // si no entra, paso a nueva hoja para que queden juntas
    const needH = 18 + 14 + (facturas.length ? facturas.length * 14 : 18) + 10;
    if (doc.y + needH > pageH - M.bottom - 70) {
      doc.addPage();
      doc.y = 40;
    }

    doc.font("Helvetica-Bold").fontSize(10).fillColor("#000").text("FACTURAS");
    doc.moveDown(0.3);

    const fcols = [
      { key: "mes", label: "MES", w: Math.floor(contentW * 0.16), align: "left" },
      { key: "nro", label: "N FACTURA", w: Math.floor(contentW * 0.18), align: "left" },
      { key: "monto", label: "MONTO", w: Math.floor(contentW * 0.22), align: "right" },
      { key: "fecha", label: "FECHA", w: contentW - (Math.floor(contentW * 0.16) + Math.floor(contentW * 0.18) + Math.floor(contentW * 0.22)), align: "left" },
    ];

    function drawFactHeader() {
      const x0 = M.left;
      const y0 = doc.y;
      rect(x0, y0, contentW, headH, GREEN_LIGHT);

      doc.font("Helvetica-Bold").fontSize(fontHead).fillColor("#000");
      let x = x0;
      for (const c of fcols) {
        doc.text(c.label, x + 3, y0 + 5, { width: c.w - 6, align: "center", lineBreak: false });
        x += c.w;
        vline(x, y0, y0 + headH);
      }
      doc.y = y0 + headH;
    }

    function drawFactRow(f) {
      const x0 = M.left;
      const y0 = doc.y;

      if (y0 + rowH > pageH - M.bottom - 60) {
        doc.addPage();
        doc.y = 40;
        drawFactHeader();
      }

      rect(x0, y0, contentW, rowH, "#ffffff");
      doc.font("Helvetica").fontSize(fontBody).fillColor("#000");

      const cells = {
        mes: f.mes || "-",
        nro: safeStr(f.nro || "-"),
        monto: fmtARS(f.monto),
        fecha: safeStr(f.fecha || ""),
      };

      let x = x0;
      for (const c of fcols) {
        const raw = cells[c.key] ?? "";
        const text = (c.key === "nro" || c.key === "fecha")
          ? ellipsize(raw, c.w - 6, fontBody, false)
          : raw;

        doc.text(text, x + 3, y0 + 4, { width: c.w - 6, align: c.align, lineBreak: false });
        x += c.w;
        vline(x, y0, y0 + rowH);
      }

      doc.y = y0 + rowH;
    }

    drawFactHeader();

    if (!facturas.length) {
      doc.font("Helvetica").fontSize(9).fillColor("#555").text("Sin facturas registradas.");
      doc.moveDown(0.6);
    } else {
      for (const f of facturas) drawFactRow(f);
      doc.moveDown(0.6);
    }

    // ----------------- Totales (NEGRO, como tu captura) -----------------
    // caja central: total cargos / total pagado
    const yTotals = Math.min(doc.y + 10, pageH - M.bottom - 60);

    // si no entra, nueva página
    if (yTotals + 50 > pageH - M.bottom) {
      doc.addPage();
      doc.y = 60;
    }

    const boxH = 44;
    const boxW1 = Math.floor(contentW * 0.35);
    const boxW2 = Math.floor(contentW * 0.18);

    const xCenterBox = M.left + Math.floor((contentW - boxW1) / 2);
    rect(xCenterBox, doc.y, boxW1, boxH, null);

    // divisiones internas
    vline(xCenterBox + Math.floor(boxW1 * 0.35), doc.y, doc.y + boxH);
    hline(xCenterBox, xCenterBox + boxW1, doc.y + Math.floor(boxH / 2));

    doc.font("Helvetica-Bold").fontSize(9).fillColor("#000");
    doc.text("Total que debería\nhaber pagado", xCenterBox + 6, doc.y + 6, { width: Math.floor(boxW1 * 0.35) - 12, align: "left" });
    doc.text("Total que pago", xCenterBox + 6, doc.y + Math.floor(boxH / 2) + 6, { width: Math.floor(boxW1 * 0.35) - 12, align: "left" });

    doc.font("Helvetica-Bold").fontSize(10).fillColor("#000");
    doc.text(fmtARS(totalCargos), xCenterBox + Math.floor(boxW1 * 0.35) + 6, doc.y + 10, { width: boxW1 - Math.floor(boxW1 * 0.35) - 12, align: "right" });
    doc.text(fmtARS(totalPagadoConAjustes), xCenterBox + Math.floor(boxW1 * 0.35) + 6, doc.y + Math.floor(boxH / 2) + 10, { width: boxW1 - Math.floor(boxW1 * 0.35) - 12, align: "right" });

    // caja derecha: total facturado (como tu captura)
    const xRightBox = M.left + contentW - boxW2;
    rect(xRightBox, doc.y, boxW2, boxH, null);
    vline(xRightBox + Math.floor(boxW2 * 0.55), doc.y, doc.y + boxH);

    doc.font("Helvetica-Bold").fontSize(9).fillColor("#000");
    doc.text("Total que se\nle facturo", xRightBox + 6, doc.y + 10, { width: Math.floor(boxW2 * 0.55) - 12, align: "left" });

    doc.font("Helvetica-Bold").fontSize(10).fillColor("#000");
    doc.text(fmtARS(totalFacturado), xRightBox + Math.floor(boxW2 * 0.55) + 6, doc.y + 16, { width: boxW2 - Math.floor(boxW2 * 0.55) - 12, align: "right" });

    // ----------------- Final -----------------
    doc.end();
  } catch (err) {
    console.error("estado-de-cuenta PDF:", err);
    try {
      res.status(500).json({ error: "No se pudo generar el PDF" });
    } catch (_) {}
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


