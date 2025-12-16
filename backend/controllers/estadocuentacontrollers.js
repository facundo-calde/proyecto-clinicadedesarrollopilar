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

    const dni = toStr(req.params.dni).trim();
    const areaId = toStr(req.query.areaId || "").trim();

    // compat: period (viejo) + desde/hasta (nuevo)
    const period = req.query.period ? toStr(req.query.period).trim() : null;
    const desdeQ = req.query.desde ? toStr(req.query.desde).trim() : null;
    const hastaQ = req.query.hasta ? toStr(req.query.hasta).trim() : null;

    const desde = desdeQ || null;
    const hasta = hastaQ || period || null;

    if (!areaId) return res.status(400).json({ error: "areaId es obligatorio" });

    const paciente = await Paciente.findOne({ dni }).lean();
    if (!paciente) return res.status(404).json({ error: "Paciente no encontrado" });

    const area = await Area.findById(areaId).lean();
    if (!area) return res.status(404).json({ error: "Área no encontrada" });

    // ✅ Regla real según tu modelo (enum con "Obra Social ...")
    const condicion = String(paciente.condicionDePago || "");
    const tieneOS = condicion.includes("Obra Social");

    // ===== Movimientos por rango =====
    // - si viene desde/hasta => [$gte,$lte]
    // - si solo period => hasta = period
    const periodFilter =
      desde && hasta ? { period: { $gte: desde, $lte: hasta } } :
      hasta ? { period: { $lte: hasta } } :
      {};

    const movsRango = await Movimiento.find({
      dni,
      areaId,
      ...periodFilter,
    }).sort({ fecha: 1 }).lean();

    // ---------- Helpers ----------
    function fmtARS(n) {
      const num = Number(n || 0);
      return `$ ${num.toLocaleString("es-AR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
    }

    const fmtCant = (n) => {
      const v = Number(n || 0);
      if (v === 0.25) return "1/4";
      if (v === 0.5) return "1/2";
      if (v === 0.75) return "3/4";
      if (v === 1) return "1";
      return v ? String(v) : "";
    };

    const yyyymmFromMov = (m) =>
      m.period ||
      (m.fecha ? new Date(m.fecha).toISOString().slice(0, 7) : "") ||
      "";

    const getProfesional = (m) =>
      String(
        m.profesionalNombre ||
        m.profesionalName ||
        m.nombreProfesional ||
        (m.profesional && m.profesional.nombre) ||
        m.profesional ||
        ""
      ).trim();

    const getCodigoModulo = (m) =>
      String(
        m.codigoModulo ||
        m.codigo ||
        m.moduloCodigo ||
        ""
      ).trim();

    const getModuloNombre = (m) =>
      String(
        m.moduloNombre ||
        m.nombreModulo ||
        m.modulo ||
        m.detalleModulo ||
        ""
      ).trim();

    // ===== Totales (como tu lógica original, pero sobre movsRango) =====
    let cargos = 0,
      pagadoPART = 0,
      pagadoOS = 0,
      ajustesMas = 0,
      ajustesMenos = 0,
      totalFacturado = 0;

    for (const m of movsRango) {
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
    const totalPagado = pagadoPART + pagadoOS;
    const saldo = Number(
      (totalCargos - (totalPagado + ajustesMas - ajustesMenos)).toFixed(2)
    );

    // ===== FACTURAS (del rango) =====
    const facturas = movsRango
      .filter((m) => m.tipo === "FACT")
      .map((m) => ({
        mes: yyyymmFromMov(m) || "-",
        nro: m.nroRecibo || m.nroFactura || m.tipoFactura || "-",
        monto: Number(m.monto || 0),
        fecha: m.fecha ? new Date(m.fecha) : null,
      }))
      .sort((a, b) => String(a.mes).localeCompare(String(b.mes)));

    // ===== FILAS TABLA PRINCIPAL (tipo Excel) =====
    // Querés: MES / CANT / CODIGO / PROFESIONAL / A PAGAR / PAGADO POR PADRES / DETALLE / (OS + DETALLE si aplica)
    const filas = movsRango
      .filter((m) => m.tipo === "CARGO") // en tu excel son las líneas de cargos/módulos
      .map((m) => ({
        mes: yyyymmFromMov(m),
        cant: fmtCant(m.cantidad),
        codigo: `${getCodigoModulo(m)} ${getModuloNombre(m)}`.trim(),
        profesional: getProfesional(m),
        aPagar: Number(m.monto || 0),
        pagPadres: parseNumberLike(m.pagPadres, 0),
        detPadres: String(m.detallePadres || m.detalle || m.detallePago || "").trim(),
        pagOS: parseNumberLike(m.pagOS, 0),
        detOS: String(m.detalleOS || m.detalleObraSocial || "").trim(),
      }));

    // ---------- PDF ----------
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="Extracto_${dni}_${(area.nombre || "area")
        .replace(/\s+/g, "_")}${hasta ? "_" + hasta : ""}.pdf"`
    );
    res.setHeader("Cache-Control", "no-store");

    const doc = new PDFDocument({ size: "A4", margin: 28 }); // portrait como tu base
    doc.pipe(res);

    const pageLeft = doc.page.margins.left;
    const pageRight = doc.page.width - doc.page.margins.right;
    const pageBottom = doc.page.height - doc.page.margins.bottom;

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
        doc.image(found, pageLeft, 18, { width: 170 });
        logoDrawn = true;
      }
    } catch (_) {}

    doc.y = logoDrawn ? 70 : 40;

    // ---------- HEADER ----------
    doc.fillColor("#000").font("Helvetica-Bold").fontSize(13).text("Informe de estado de cuenta");
    doc.moveDown(0.4);
    doc.font("Helvetica").fontSize(10).fillColor("#000").text(`${paciente.nombre || "-"} - DNI ${paciente.dni || "-"}`);
    doc.fontSize(9).fillColor("#444").text(`Área: ${area.nombre || "-"}`);
    if (desde || hasta) doc.text(`Rango: ${desde || "inicio"} → ${hasta || "actual"}`);
    doc.moveDown(0.6);

    // ---------- BARRA VERDE TÍTULO ÁREA (como tu captura) ----------
    const barY = doc.y;
    doc.save();
    doc.rect(pageLeft, barY, pageRight - pageLeft, 22).fill("#9BBB59");
    doc.restore();
    doc.fillColor("#000").font("Helvetica-Bold").fontSize(10);
    doc.text(`AREA: ${area.nombre.toUpperCase()}`, pageLeft, barY + 6, {
      width: pageRight - pageLeft,
      align: "center",
    });

    // DIF arriba a la derecha (como excel)
    doc.fontSize(9).font("Helvetica-Bold");
    doc.text(`DIF ENTRE FACT Y PAGADO -$`, pageRight - 230, barY + 6, { width: 160, align: "left" });
    doc.text(fmtARS(Math.abs(saldo)), pageRight - 70, barY + 6, { width: 70, align: "right" });

    doc.y = barY + 32;

    // ---------- TABLA PRINCIPAL (IZQUIERDA) ----------
    const startX = pageLeft;
    const rowH = 16;

    // ancho disponible para la tabla principal (dejamos hueco a la derecha SOLO si querés; acá NO, porque FACTURAS va abajo)
    const tableW = pageRight - pageLeft;

    // columnas base tipo excel (con DETALLE PADRES)
    // y OS sólo si corresponde
    const cols = [
      { key: "mes", label: "MES", w: 55, align: "left" },
      { key: "cant", label: "CANT", w: 40, align: "center" },
      { key: "codigo", label: "CODIGO", w: 150, align: "left" },
      { key: "profesional", label: "PROFESIONAL", w: 100, align: "left" },
      { key: "aPagar", label: "A PAGAR", w: 60, align: "right" },
      { key: "pagPadres", label: "PAGADO", w: 70, align: "right" },
      { key: "detPadres", label: "DETALLE", w: 85, align: "left" },
    ];

    if (tieneOS) {
      cols.push(
        { key: "pagOS", label: "PAGADO O.S", w: 70, align: "right" },
        { key: "detOS", label: "DETALLE", w: 85, align: "left" }
      );
    }

    // Ajuste fino para que entre EXACTO en A4 portrait
    // Si sobra o falta por 1-2px, lo corregimos al último
    let wSum = cols.reduce((a, c) => a + c.w, 0);
    if (wSum !== tableW) {
      const diff = tableW - wSum;
      cols[cols.length - 1].w += diff; // corrige en la última
    }

    const drawTableHeader = () => {
      const y = doc.y;
      let x = startX;

      doc.font("Helvetica-Bold").fontSize(8).fillColor("#000");
      for (const c of cols) {
        doc.save();
        doc.rect(x, y, c.w, rowH).fill("#D9EAD3");
        doc.restore();
        doc.rect(x, y, c.w, rowH).stroke();
        doc.text(c.label, x + 2, y + 4, { width: c.w - 4, align: "center" });
        x += c.w;
      }
      doc.y = y + rowH;
    };

    const drawRow = (r) => {
      // salto de página: repetimos barra de área + header de tabla
      if (doc.y + rowH > pageBottom) {
        doc.addPage();
        doc.y = 40;

        // barra de área en nuevas páginas (para que se mantenga estilo)
        const by = doc.y;
        doc.save();
        doc.rect(pageLeft, by, pageRight - pageLeft, 22).fill("#9BBB59");
        doc.restore();
        doc.fillColor("#000").font("Helvetica-Bold").fontSize(10);
        doc.text(`AREA: ${area.nombre.toUpperCase()}`, pageLeft, by + 6, {
          width: pageRight - pageLeft,
          align: "center",
        });
        doc.y = by + 32;

        drawTableHeader();
      }

      const y = doc.y;
      let x = startX;

      doc.font("Helvetica").fontSize(7.8).fillColor("#000"); // un toque más chico para legibilidad
      const cells = {
        mes: r.mes || "-",
        cant: r.cant || "",
        codigo: r.codigo || "",
        profesional: r.profesional || "",
        aPagar: fmtARS(r.aPagar),
        pagPadres: fmtARS(r.pagPadres),
        detPadres: r.detPadres || "",
        pagOS: tieneOS ? fmtARS(r.pagOS) : "",
        detOS: tieneOS ? (r.detOS || "") : "",
      };

      for (const c of cols) {
        doc.rect(x, y, c.w, rowH).stroke();

        doc.text(String(cells[c.key] ?? ""), x + 2, y + 3, {
          width: c.w - 4,
          align: c.align,
          lineBreak: false,
          ellipsis: true,
        });

        x += c.w;
      }

      doc.y = y + rowH;
    };

    drawTableHeader();

    for (const r of filas) drawRow(r);

    // ====== BLOQUE FACTURAS ABAJO (SIN PARTIR EN DOS HOJAS SIN SENTIDO) ======
    const drawFacturasHeader = () => {
      doc.font("Helvetica-Bold").fontSize(10).fillColor("#000").text("FACTURAS");
      doc.moveDown(0.3);

      const y = doc.y;
      let x = startX;

      const fcols = [
        { key: "mes", label: "MES", w: 70, align: "left" },
        { key: "nro", label: "N FACTURA", w: 70, align: "left" },
        { key: "monto", label: "MONTO", w: 120, align: "right" },
        { key: "fecha", label: "FECHA", w: 80, align: "left" },
      ];

      // ajustar último para calzar
      let sum = fcols.reduce((a, c) => a + c.w, 0);
      const diff = (pageRight - pageLeft) - sum;
      fcols[fcols.length - 1].w += diff;

      doc.font("Helvetica-Bold").fontSize(8).fillColor("#000");
      for (const c of fcols) {
        doc.save();
        doc.rect(x, y, c.w, rowH).fill("#D9EAD3");
        doc.restore();
        doc.rect(x, y, c.w, rowH).stroke();
        doc.text(c.label, x + 2, y + 4, { width: c.w - 4, align: "center" });
        x += c.w;
      }

      doc.y = y + rowH;
      return fcols;
    };

    const drawFacturaRow = (f, fcols) => {
      if (doc.y + rowH > pageBottom) {
        doc.addPage();
        doc.y = 40;

        // barra de área en nuevas páginas
        const by = doc.y;
        doc.save();
        doc.rect(pageLeft, by, pageRight - pageLeft, 22).fill("#9BBB59");
        doc.restore();
        doc.fillColor("#000").font("Helvetica-Bold").fontSize(10);
        doc.text(`AREA: ${area.nombre.toUpperCase()}`, pageLeft, by + 6, {
          width: pageRight - pageLeft,
          align: "center",
        });
        doc.y = by + 32;

        // re-dibujar header de facturas (para que no quede “verde suelto”)
        fcols = drawFacturasHeader();
      }

      const y = doc.y;
      let x = startX;

      doc.font("Helvetica").fontSize(8).fillColor("#000");
      const cells = {
        mes: f.mes || "-",
        nro: String(f.nro || "-"),
        monto: fmtARS(f.monto),
        fecha: f.fecha ? f.fecha.toLocaleDateString("es-AR") : "",
      };

      for (const c of fcols) {
        doc.rect(x, y, c.w, rowH).stroke();
        doc.text(String(cells[c.key] ?? ""), x + 2, y + 3, {
          width: c.w - 4,
          align: c.align,
          lineBreak: false,
          ellipsis: true,
        });
        x += c.w;
      }

      doc.y = y + rowH;
      return fcols;
    };

    // antes de empezar FACTURAS: si no entra header + al menos 3 filas, mandamos TODO a la próxima hoja
    const minFactRows = Math.min(3, facturas.length);
    const needH = 10 + rowH + (minFactRows * rowH) + 10; // título + header + filas
    if (doc.y + 20 + needH > pageBottom) {
      doc.addPage();
      doc.y = 40;

      const by = doc.y;
      doc.save();
      doc.rect(pageLeft, by, pageRight - pageLeft, 22).fill("#9BBB59");
      doc.restore();
      doc.fillColor("#000").font("Helvetica-Bold").fontSize(10);
      doc.text(`AREA: ${area.nombre.toUpperCase()}`, pageLeft, by + 6, {
        width: pageRight - pageLeft,
        align: "center",
      });
      doc.y = by + 32;
    } else {
      doc.moveDown(1);
    }

    let fcols = drawFacturasHeader();
    if (!facturas.length) {
      doc.font("Helvetica").fontSize(9).fillColor("#666").text("Sin facturas registradas.");
    } else {
      for (const f of facturas) {
        fcols = drawFacturaRow(f, fcols);
      }
    }

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


