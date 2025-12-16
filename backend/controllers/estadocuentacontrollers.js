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

// ----------------- GET /api/estado-de-cuenta/:dni/extracto?areaId=...&desde=YYYY-MM&hasta=YYYY-MM -----------------
// (si mandás solo period=YYYY-MM, lo usa como hasta)
async function generarExtractoPDF(req, res) {
  try {
    const fs = require("fs");
    const path = require("path");
    const PDFDocument = require("pdfkit");

    const dni = toStr(req.params.dni).trim();
    const areaId = toStr(req.query.areaId || "").trim();

    const period = req.query.period ? toStr(req.query.period).trim() : null;
    const desde = req.query.desde ? toStr(req.query.desde).trim() : null;
    const hasta = req.query.hasta ? toStr(req.query.hasta).trim() : (period || null);

    if (!areaId) return res.status(400).json({ error: "areaId es obligatorio" });

    const paciente = await Paciente.findOne({ dni }).lean();
    if (!paciente) return res.status(404).json({ error: "Paciente no encontrado" });

    const area = await Area.findById(areaId).lean();
    if (!area) return res.status(404).json({ error: "Área no encontrada" });

    // ✅ según tu enum real
    const condicion = String(paciente.condicionDePago || "");
    const tieneOS = condicion.includes("Obra Social");

    // ---------------- Helpers ----------------
    function fmtARS(n) {
      const num = Number(n || 0);
      return `$ ${num.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    function fmtCant(n) {
      const v = Number(n || 0);
      if (v === 0.25) return "1/4";
      if (v === 0.5) return "1/2";
      if (v === 0.75) return "3/4";
      if (v === 1) return "1";
      // fallback: si te llega 2, 1.25, etc.
      return v ? String(v).replace(".", ",") : "";
    }

    const yyyymmFromMov = (m) =>
      m.period || (m.fecha ? new Date(m.fecha).toISOString().slice(0, 7) : "") || "";

    const getProfesional = (m) =>
      String(
        m.profesionalNombre ||
          m.profesionalName ||
          m.nombreProfesional ||
          (m.profesional && m.profesional.nombre) ||
          m.profesional ||
          ""
      ).trim();

    const getCodigo = (m) =>
      String(m.codigoModulo || m.codigo || m.moduloCodigo || m.codigoMov || "").trim();

    const getModuloNombre = (m) =>
      String(m.moduloNombre || m.nombreModulo || m.modulo || m.descripcion || "").trim();

    const getDetallePadres = (m) =>
      String(m.detallePadres || m.detallePagoPadres || m.detallePago || m.detalle || "").trim();

    const getDetalleOS = (m) =>
      String(m.detalleOS || m.detalleObraSocial || m.detallePagoOS || "").trim();

    const parseN = (v) => {
      if (v === null || v === undefined) return 0;
      if (typeof v === "number") return v;
      const s = String(v).replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "");
      const n = Number(s);
      return Number.isFinite(n) ? n : 0;
    };

    // ---------------- Query movimientos por rango ----------------
    const periodFilter =
      desde && hasta ? { period: { $gte: desde, $lte: hasta } } :
      hasta ? { period: { $lte: hasta } } :
      {}; // sin rango => todo

    // ✅ pedimos todo lo que necesitás para el PDF (si tenés muchos, esto igual va ok con .lean())
    const movs = await Movimiento.find({
      dni,
      areaId,
      ...periodFilter,
    })
      .sort({ fecha: 1 })
      .lean();

    // ---------------- Totales (igual tu lógica) ----------------
    let pagadoOS = 0, pagadoPART = 0, cargos = 0, ajustesMas = 0, ajustesMenos = 0, totalFacturado = 0;

    for (const m of movs) {
      const monto = Number(m.monto || 0);

      if (m.tipo === "CARGO") {
        cargos += monto;
        pagadoPART += parseN(m.pagPadres);
        pagadoOS += parseN(m.pagOS);
      } else if (m.tipo === "OS") pagadoOS += monto;
      else if (m.tipo === "PART") pagadoPART += monto;
      else if (m.tipo === "AJUSTE+") ajustesMas += monto;
      else if (m.tipo === "AJUSTE-") ajustesMenos += monto;
      else if (m.tipo === "FACT") totalFacturado += monto;
    }

    if (!tieneOS) pagadoOS = 0;

    const totalDeberia = cargos;
    const totalPago = pagadoPART + pagadoOS + ajustesMas - ajustesMenos;

    // (si lo querés “saldo” como en tu resumen, dejalo igual)
    const difFactPagado = Number((totalFacturado - totalPago).toFixed(2));

    // ---------------- Filas (tabla izquierda) ----------------
    const filas = movs
      .filter((m) => m.tipo === "CARGO")
      .map((m) => ({
        mes: yyyymmFromMov(m),
        cant: fmtCant(m.cantidad),
        codigo: `${getCodigo(m)} ${getModuloNombre(m)}`.replace(/\s+/g, " ").trim(),
        profesional: getProfesional(m),
        aPagar: Number(m.monto || 0),
        pagPadres: parseN(m.pagPadres),
        detPadres: getDetallePadres(m),
        pagOS: parseN(m.pagOS),
        detOS: getDetalleOS(m),
      }));

    // ---------------- Facturas (tabla derecha) ----------------
    const facturas = movs
      .filter((m) => m.tipo === "FACT")
      .map((m) => ({
        mes: yyyymmFromMov(m) || "-",
        nro: String(m.nroRecibo || m.nroFactura || m.tipoFactura || "-"),
        monto: Number(m.monto || 0),
        fecha: m.fecha ? new Date(m.fecha) : null,
      }))
      .sort((a, b) => String(a.mes).localeCompare(String(b.mes)));

    const fmtFecha = (d) => {
      if (!d || !(d instanceof Date) || isNaN(d)) return "";
      const dd = String(d.getDate()).padStart(2, "0");
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const yy = d.getFullYear();
      return `${dd}/${mm}/${yy}`;
    };

    // ---------------- PDF headers ----------------
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="Extracto_${dni}_${(area.nombre || "area").replace(/\s+/g, "_")}${hasta ? "_" + hasta : ""}.pdf"`
    );
    res.setHeader("Cache-Control", "no-store");

    const doc = new PDFDocument({ size: "A4", margin: 24 });
    doc.pipe(res);

    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const top = doc.page.margins.top;
    const bottom = doc.page.height - doc.page.margins.bottom;
    const fullW = right - left;

    // ---------------- util: texto que entra (baja fuente y si no entra recorta) ----------------
    function fitText(text, x, y, w, opts = {}) {
      const {
        align = "left",
        minSize = 6,
        maxSize = 8,
        bold = false,
        color = "#000",
        pad = 2,
      } = opts;

      const t = (text ?? "").toString();
      const fontName = bold ? "Helvetica-Bold" : "Helvetica";

      doc.fillColor(color).font(fontName);

      // 1) intentá bajar fuente hasta que entra en una línea
      let size = maxSize;
      while (size >= minSize) {
        doc.fontSize(size);
        const tw = doc.widthOfString(t);
        if (tw <= (w - pad * 2)) break;
        size -= 0.25;
      }

      // 2) si aún no entra, recortá con …
      doc.fontSize(Math.max(size, minSize));
      let out = t;
      const maxW = w - pad * 2;

      if (doc.widthOfString(out) > maxW) {
        const ell = "…";
        while (out.length > 0 && doc.widthOfString(out + ell) > maxW) {
          out = out.slice(0, -1);
        }
        out = out.length ? out + ell : "";
      }

      doc.text(out, x + pad, y + 3, { width: w - pad * 2, align, lineBreak: false });
    }

    // ---------------- LOGO (robusto) ----------------
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
        doc.image(found, left, 12, { width: 160 });
        logoDrawn = true;
      }
    } catch {}

    doc.y = logoDrawn ? 60 : top;

    // ---------------- Header texto ----------------
    doc.fillColor("#000").font("Helvetica-Bold").fontSize(13).text("Informe de estado de cuenta");
    doc.moveDown(0.3);
    doc.font("Helvetica").fontSize(10).text(`${paciente.nombre || "-"} - DNI ${paciente.dni || "-"}`);
    doc.fontSize(9).fillColor("#444").text(`Área: ${area.nombre || "-"}`);
    if (desde || hasta) doc.text(`Rango: ${desde || "inicio"} → ${hasta || "actual"}`);
    doc.moveDown(0.6);

    // ---------------- Barra verde (igual a captura, SIN pisarse) ----------------
    const barY = doc.y;
    const barH = 22;
    doc.save();
    doc.rect(left, barY, fullW, barH).fill("#9BBB59"); // verde tipo Excel
    doc.restore();

    // área centrada
    doc.fillColor("#000").font("Helvetica-Bold").fontSize(10);
    doc.text(`AREA: ${String(area.nombre || "").toUpperCase()}`, left, barY + 6, { width: fullW, align: "center" });

    // dif a la derecha (caja fija)
    const difBoxW = 250;
    const difX = right - difBoxW;
    doc.fillColor("#000").font("Helvetica-Bold").fontSize(9);
    doc.text(`DIF ENTRE FACT Y PAGADO - $`, difX, barY + 6, { width: difBoxW - 80, align: "right" });
    doc.text(fmtARS(difFactPagado), difX + (difBoxW - 80), barY + 6, { width: 80, align: "right" });

    doc.y = barY + barH + 12;

    // ---------------- Layout 2 tablas (igual captura) ----------------
    const gap = 14;
    const factW = 230; // fija (como captura)
    const leftW = fullW - factW - gap;

    const leftX = left;
    const factX = left + leftW + gap;

    // ---------------- Estilos de tabla ----------------
    const rowH = 16;
    const headerH = 18;

    function drawTableHeader(x, y, w, title) {
      // barra superior verde del bloque
      doc.save();
      doc.rect(x, y, w, headerH).fill("#9BBB59");
      doc.restore();
      doc.fillColor("#000").font("Helvetica-Bold").fontSize(9);
      doc.text(title, x, y + 5, { width: w, align: "center" });

      // banda header columnas
      const y2 = y + headerH;
      doc.save();
      doc.rect(x, y2, w, headerH).fill("#DDEED6");
      doc.restore();
      return y2;
    }

    function hline(x, y, w) {
      doc.save();
      doc.strokeColor("#000").lineWidth(0.6);
      doc.moveTo(x, y).lineTo(x + w, y).stroke();
      doc.restore();
    }
    function vline(x, y, h) {
      doc.save();
      doc.strokeColor("#000").lineWidth(0.6);
      doc.moveTo(x, y).lineTo(x, y + h).stroke();
      doc.restore();
    }

    // ---------------- Tabla IZQUIERDA (igual a captura) ----------------
    // Columnas: MES | CANT | CODIGO | PROFESIONAL | A PAGAR | PAGADO | DETALLE | PAGADO OS | DETALLE OS
    // (OS columnas siempre existen, pero si no tieneOS quedan vacías)
    const L = [
      { key: "mes",       label: "MES",        w: 46,  align: "left"  },
      { key: "cant",      label: "CANT",       w: 38,  align: "center"},
      { key: "codigo",    label: "CODIGO",     w: 92,  align: "left"  },
      { key: "prof",      label: "PROFESIONAL",w: 64,  align: "left"  },
      { key: "apagar",    label: "A PAGAR",    w: 42,  align: "right" },
      { key: "pagadoP",   label: "PAGADO...",  w: 48,  align: "right" },
      { key: "detP",      label: "DETALLE",    w: 56,  align: "left"  },
      { key: "pagadoOS",  label: "PAGADO...",  w: 48,  align: "right" },
      { key: "detOS",     label: "DETALLE",    w: 56,  align: "left"  },
    ];

    // Ajuste: si por redondeo no da exacto, corregimos a CODIGO (para que no se corte nunca)
    const sumLW = L.reduce((a, c) => a + c.w, 0);
    if (sumLW !== leftW) {
      const diff = leftW - sumLW;
      L[2].w += diff; // CODIGO absorbe el ajuste
    }

    const leftTopY = doc.y;
    let yCols = drawTableHeader(leftX, leftTopY, leftW, ""); // bloque sin título, como tu captura
    // títulos columnas
    let cx = leftX;
    doc.fillColor("#000").font("Helvetica-Bold").fontSize(7);
    for (const c of L) {
      doc.text(c.label, cx, yCols + 5, { width: c.w, align: c.align });
      cx += c.w;
    }
    // grilla header
    hline(leftX, yCols, leftW);
    hline(leftX, yCols + headerH, leftW);
    cx = leftX;
    for (let i = 0; i <= L.length; i++) {
      vline(cx, yCols, headerH);
      if (i < L.length) cx += L[i].w;
    }

    let yRow = yCols + headerH;

    // filas
    doc.font("Helvetica").fillColor("#000");

    for (const r of filas) {
      // paginado: si no entra la próxima fila, nueva hoja y rehacemos header de tabla izquierda
      if (yRow + rowH > bottom - 110) {
        doc.addPage();
        doc.y = top;
        // barra verde repetida (solo AREA centrada, como screenshot)
        const by = doc.y;
        doc.save(); doc.rect(left, by, fullW, barH).fill("#9BBB59"); doc.restore();
        doc.fillColor("#000").font("Helvetica-Bold").fontSize(10);
        doc.text(`AREA: ${String(area.nombre || "").toUpperCase()}`, left, by + 6, { width: fullW, align: "center" });
        doc.y = by + barH + 12;

        // rehacer tabla izquierda en nueva página
        const ny = doc.y;
        yCols = drawTableHeader(leftX, ny, leftW, "");
        cx = leftX;
        doc.fillColor("#000").font("Helvetica-Bold").fontSize(7);
        for (const c of L) {
          doc.text(c.label, cx, yCols + 5, { width: c.w, align: c.align });
          cx += c.w;
        }
        hline(leftX, yCols, leftW);
        hline(leftX, yCols + headerH, leftW);
        cx = leftX;
        for (let i = 0; i <= L.length; i++) {
          vline(cx, yCols, headerH);
          if (i < L.length) cx += L[i].w;
        }
        yRow = yCols + headerH;
      }

      // fondo de fila
      doc.save();
      doc.rect(leftX, yRow, leftW, rowH).fill("#EAF4E2");
      doc.restore();

      // celdas (fitText para que entre TODO)
      const cells = {
        mes: r.mes || "",
        cant: r.cant || "",
        codigo: r.codigo || "",
        prof: r.profesional || "",
        apagar: fmtARS(r.aPagar),
        pagadoP: fmtARS(r.pagPadres),
        detP: r.detPadres || "",
        pagadoOS: tieneOS ? fmtARS(r.pagOS) : "",
        detOS: tieneOS ? (r.detOS || "") : "",
      };

      cx = leftX;
      for (const c of L) {
        const isMoney = ["apagar", "pagadoP", "pagadoOS"].includes(c.key);
        const text = cells[c.key];

        // tamaños: texto largo baja más, plata un poco menos
        fitText(
          text,
          cx,
          yRow,
          c.w,
          {
            align: c.align,
            maxSize: isMoney ? 7.5 : 8,
            minSize: isMoney ? 6.5 : 6,
            bold: false,
            color: "#000",
          }
        );
        cx += c.w;
      }

      // bordes fila
      hline(leftX, yRow, leftW);
      hline(leftX, yRow + rowH, leftW);
      cx = leftX;
      for (let i = 0; i <= L.length; i++) {
        vline(cx, yRow, rowH);
        if (i < L.length) cx += L[i].w;
      }

      yRow += rowH;
    }

    // ---------------- Tabla FACTURAS (derecha, igual captura) ----------------
    // Siempre en 1ra página al lado, SIN superponerse (si no entra completa, continúa en página nueva)
    const F = [
      { key: "mes",   label: "MES",       w: 56, align: "left"  },
      { key: "nro",   label: "N FACTURA", w: 56, align: "left"  },
      { key: "monto", label: "MONTO",     w: 76, align: "right" },
      { key: "fecha", label: "FECHA",     w: 42, align: "left"  },
    ];
    const sumFW = F.reduce((a, c) => a + c.w, 0);
    if (sumFW !== factW) F[2].w += (factW - sumFW); // monto absorbe

    let fy = leftTopY + headerH; // empieza alineada con el header de la izquierda
    // título FACTURAS
    fy = drawTableHeader(factX, leftTopY, factW, "FACTURAS");

    // títulos cols fact
    cx = factX;
    doc.fillColor("#000").font("Helvetica-Bold").fontSize(7);
    for (const c of F) {
      doc.text(c.label, cx, fy + 5, { width: c.w, align: c.align });
      cx += c.w;
    }
    hline(factX, fy, factW);
    hline(factX, fy + headerH, factW);
    cx = factX;
    for (let i = 0; i <= F.length; i++) {
      vline(cx, fy, headerH);
      if (i < F.length) cx += F[i].w;
    }
    fy = fy + headerH;

    for (const f of facturas) {
      // si no entra al lado, sigue en página nueva (solo facturas)
      if (fy + rowH > bottom - 110) {
        doc.addPage();
        doc.y = top;

        const by = doc.y;
        doc.save(); doc.rect(left, by, fullW, barH).fill("#9BBB59"); doc.restore();
        doc.fillColor("#000").font("Helvetica-Bold").fontSize(10);
        doc.text(`AREA: ${String(area.nombre || "").toUpperCase()}`, left, by + 6, { width: fullW, align: "center" });
        doc.y = by + barH + 12;

        const ny = doc.y;
        let hdr = drawTableHeader(left, ny, fullW, "FACTURAS");
        cx = left;
        doc.fillColor("#000").font("Helvetica-Bold").fontSize(7);
        for (const c of F) {
          doc.text(c.label, cx, hdr + 5, { width: c.w, align: c.align });
          cx += c.w;
        }
        hline(left, hdr, fullW);
        hline(left, hdr + headerH, fullW);
        cx = left;
        for (let i = 0; i <= F.length; i++) {
          vline(cx, hdr, headerH);
          if (i < F.length) cx += F[i].w;
        }

        factX = left; // (no se usa después, solo para claridad mental)
        fy = hdr + headerH;
      }

      doc.save();
      doc.rect((typeof factX === "number" ? factX : left), fy, (typeof factW === "number" ? factW : fullW), rowH).fill("#fff");
      doc.restore();

      const fCells = {
        mes: f.mes,
        nro: f.nro,
        monto: fmtARS(f.monto),
        fecha: fmtFecha(f.fecha),
      };

      // ojo: si facturas siguió a página nueva ocupa fullW pero F mantiene w; entonces usamos baseX/baseW según página
      const baseX = (typeof factX === "number" ? factX : left);
      const baseW = (typeof factW === "number" ? factW : fullW);

      cx = baseX;
      for (const c of F) {
        fitText(fCells[c.key], cx, fy, c.w, { align: c.align, maxSize: 8, minSize: 6.5 });
        cx += c.w;
      }

      hline(baseX, fy, baseW);
      hline(baseX, fy + rowH, baseW);
      cx = baseX;
      for (let i = 0; i <= F.length; i++) {
        vline(cx, fy, rowH);
        if (i < F.length) cx += F[i].w;
      }

      fy += rowH;
    }

    // ---------------- Totales abajo (como tu captura) ----------------
    // Los pinto en negro, sin verde raro
    const boxY = Math.min(Math.max(yRow + 18, bottom - 95), bottom - 95);

    function drawTotalBox(x, y, w, h, label, value) {
      doc.save();
      doc.rect(x, y, w, h).strokeColor("#000").lineWidth(0.8).stroke();
      doc.restore();

      // divisor vertical (como tu screenshot)
      const divX = x + Math.floor(w * 0.38);
      doc.save();
      doc.strokeColor("#000").lineWidth(0.8);
      doc.moveTo(divX, y).lineTo(divX, y + h).stroke();
      doc.restore();

      doc.fillColor("#000").font("Helvetica-Bold").fontSize(8);
      doc.text(label, x + 6, y + 10, { width: divX - x - 10, align: "left" });

      doc.fillColor("#000").font("Helvetica-Bold").fontSize(9);
      doc.text(value, divX + 6, y + 18, { width: x + w - (divX + 12), align: "right" });
    }

    // caja central grande (debería / pagó)
    const midW = 240;
    const midX = left + Math.floor((fullW - midW) / 2);

    // 2 filas en una caja (como tu captura)
    const bigH = 62;
    doc.save();
    doc.rect(midX, boxY, midW, bigH).strokeColor("#000").lineWidth(0.8).stroke();
    doc.restore();

    // división vertical
    const divX = midX + Math.floor(midW * 0.38);
    doc.save();
    doc.strokeColor("#000").lineWidth(0.8);
    doc.moveTo(divX, boxY).lineTo(divX, boxY + bigH).stroke();
    // división horizontal
    doc.moveTo(midX, boxY + bigH / 2).lineTo(midX + midW, boxY + bigH / 2).stroke();
    doc.restore();

    doc.fillColor("#000").font("Helvetica-Bold").fontSize(8);
    doc.text("Total que deberia\nhaber pagado", midX + 6, boxY + 8, { width: divX - midX - 10 });
    doc.text("Total que pago", midX + 6, boxY + bigH / 2 + 10, { width: divX - midX - 10 });

    doc.fillColor("#000").font("Helvetica-Bold").fontSize(9);
    doc.text(fmtARS(totalDeberia), divX + 6, boxY + 18, { width: midX + midW - (divX + 12), align: "right" });
    doc.text(fmtARS(totalPago), divX + 6, boxY + bigH / 2 + 18, { width: midX + midW - (divX + 12), align: "right" });

    // caja derecha: total facturado (como tu captura)
    drawTotalBox(right - 140, boxY + 14, 140, 40, "Total que se\nle facturo", fmtARS(totalFacturado));

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


