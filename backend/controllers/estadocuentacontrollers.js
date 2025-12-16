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

    // ✅ rango: desde/hasta (YYYY-MM). Si viene period, equivale a desde=hasta=period
    const period = req.query.period ? toStr(req.query.period).trim() : null;
    let desde = req.query.desde ? toStr(req.query.desde).trim() : null;
    let hasta = req.query.hasta ? toStr(req.query.hasta).trim() : null;

    if (period && (!desde && !hasta)) {
      desde = period;
      hasta = period;
    }
    if (desde && !hasta) hasta = desde;
    if (hasta && !desde) desde = hasta;

    const isValidYYYYMM = (s) => typeof s === "string" && /^\d{4}-\d{2}$/.test(s);
    if (desde && !isValidYYYYMM(desde)) return res.status(400).json({ error: "desde inválido (YYYY-MM)" });
    if (hasta && !isValidYYYYMM(hasta)) return res.status(400).json({ error: "hasta inválido (YYYY-MM)" });
    if (desde && hasta && desde > hasta) return res.status(400).json({ error: "desde no puede ser mayor que hasta" });

    if (!areaId) return res.status(400).json({ error: "areaId es obligatorio" });

    const paciente = await Paciente.findOne({ dni }).lean();
    if (!paciente) return res.status(404).json({ error: "Paciente no encontrado" });

    const area = await Area.findById(areaId).lean();
    if (!area) return res.status(404).json({ error: "Área no encontrada" });

    const tieneOS = /obra social/i.test(paciente.condicionDePago || "");

    // ========= Helpers =========
    function fmtARS(n) {
      const num = Number(n || 0);
      return num.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    const yyyymmFromMov = (m) =>
      m.period ||
      (m.fecha ? new Date(m.fecha).toISOString().slice(0, 7) : "") ||
      "";

    const rangeFilter = () => {
      if (desde && hasta) return { period: { $gte: desde, $lte: hasta } };
      return {};
    };

    // ========= Datos =========
    // Movimientos del rango (para tabla izquierda de cargos / pagos)
    const movsRango = await Movimiento.find({
      dni,
      areaId,
      ...rangeFilter(),
    }).sort({ fecha: 1 }).lean();

    // Facturas: por defecto mostramos HASTA "hasta" (como el Excel de tu captura)
    const factFilter = {};
    if (hasta) factFilter.period = { $lte: hasta };

    const movsFact = await Movimiento.find({
      dni,
      areaId,
      tipo: "FACT",
      ...factFilter,
    }).sort({ fecha: 1 }).lean();

    // Cargos: filas de la tabla principal (Excel)
    const cargos = movsRango.filter((m) => m.tipo === "CARGO");

    // Normalizador defensivo (por si tus campos se llaman distinto)
    const pick = (obj, keys, def = "") => {
      for (const k of keys) {
        const v = obj && obj[k];
        if (v !== undefined && v !== null && String(v).trim() !== "") return v;
      }
      return def;
    };

    const filas = cargos.map((m) => {
      const mes = yyyymmFromMov(m) || "-";
      const cantidad = Number(pick(m, ["cantidad", "qty", "cant"], 1)) || 1;

      const codigo = pick(m, ["codigo", "moduloCodigo", "cod"], "");
      const descModulo = pick(m, ["descripcion", "desc", "moduloNombre", "modulo"], "");
      const codigoFinal = codigo && descModulo ? `${codigo}. ${descModulo}` : (codigo || descModulo || "-");

      const profesional = pick(m, ["profesionalNombre", "profesional", "usuarioNombre", "nombreProfesional"], "-");

      const aPagar = Number(m.monto || 0);

      // pagos embebidos en CARGO
      const pagPadres = parseNumberLike(m.pagPadres, 0);
      const detPadres = pick(m, ["detallePadres", "detallePagPadres", "detallePart", "detalle"], "");

      const pagOS = tieneOS ? parseNumberLike(m.pagOS, 0) : 0;
      const detOS = tieneOS ? pick(m, ["detalleOS", "detallePagOS", "detalleObraSocial"], "") : "";

      return {
        mes,
        cantidad,
        codigo: codigoFinal,
        profesional,
        aPagar,
        pagPadres,
        detPadres,
        pagOS,
        detOS,
      };
    });

    // Totales (como el Excel)
    const totalAPagar = filas.reduce((a, r) => a + Number(r.aPagar || 0), 0);
    const totalPadres = filas.reduce((a, r) => a + Number(r.pagPadres || 0), 0);
    const totalOS = tieneOS ? filas.reduce((a, r) => a + Number(r.pagOS || 0), 0) : 0;
    const totalPago = totalPadres + totalOS;

    const facturas = movsFact.map((m) => ({
      mes: yyyymmFromMov(m) || "-",
      nro: pick(m, ["nroFactura", "nroRecibo", "numero", "comprobante", "tipoFactura"], "-"),
      monto: Number(m.monto || 0),
      detalle: pick(m, ["detalle", "estado", "observaciones"], ""), // en tu excel dice PAGADA / IMPAGA
      fecha: m.fecha ? new Date(m.fecha).toLocaleDateString("es-AR") : "",
    }));

    const totalFacturado = facturas.reduce((a, f) => a + Number(f.monto || 0), 0);
    const difFactVsPagado = Number((totalFacturado - totalPago).toFixed(2));

    // ========= PDF (stream sin tildarse) =========
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="Extracto_${dni}_${(area.nombre || "area").replace(/\s+/g, "_")}${desde && hasta ? `_${desde}_a_${hasta}` : ""}.pdf"`
    );
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    // Landscape para calcar el excel (entra todo sin apretar)
    const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 28, compress: true });

    let closed = false;
    const safeEnd = () => {
      if (!closed) {
        closed = true;
        try { doc.end(); } catch (_) {}
      }
    };

    res.on("close", safeEnd);
    res.on("finish", () => { closed = true; });
    res.on("error", safeEnd);
    req.on("aborted", safeEnd);

    doc.on("error", (e) => {
      console.error("PDFKit error:", e);
      try { if (!res.headersSent) res.status(500).json({ error: "No se pudo generar el PDF" }); } catch (_) {}
      safeEnd();
    });

    doc.pipe(res);

    // ========= Dibujo tipo Excel =========
    const GREEN = "#9BBB59";      // banda excel
    const GRID = "#2a2a2a";       // bordes oscuros como tu captura
    const LIGHT_GRID = "#bfbfbf"; // líneas internas
    const HEADER_BG = "#D9EAD3";  // verde claro header de tabla
    const CELL_BG = "#EAF3E3";    // celda verdosa suave

    const pageW = doc.page.width;
    const pageH = doc.page.height;
    const left = doc.page.margins.left;
    const top = doc.page.margins.top;
    const right = pageW - doc.page.margins.right;

    // Banda superior
    const bandH = 26;
    doc.save();
    doc.rect(left, top, right - left, bandH).fill(GREEN);
    doc.fillColor("#000").fontSize(11).font("Helvetica-Bold");
    doc.text(`AREA: ${String(area.nombre || "-").toUpperCase()}`, left, top + 7, { width: right - left, align: "center" });
    doc.restore();

    // Texto dif arriba derecha (como tu excel)
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#000");
    doc.text(`DIF ENTRE FACT Y PAGADO   -$`, right - 260, top + 6, { width: 160, align: "right" });
    doc.text(fmtARS(difFactVsPagado), right - 95, top + 6, { width: 90, align: "right" });

    // Layout: 2 bloques (izq cargos / der facturas)
    const gap = 14;
    const blockTop = top + bandH + 10;
    const blockH = pageH - blockTop - 20;

    const leftW = Math.floor((right - left - gap) * 0.62);
    const rightW = (right - left - gap) - leftW;

    const leftX = left;
    const rightX = left + leftW + gap;

    // Helpers de tabla
    const cellText = (text, x, y, w, h, opts = {}) => {
      const pad = opts.pad ?? 3;
      const align = opts.align ?? "left";
      const fontSize = opts.fontSize ?? 8;
      const bold = !!opts.bold;
      const color = opts.color ?? "#000";

      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(fontSize).fillColor(color);
      doc.text(String(text ?? ""), x + pad, y + 3, {
        width: Math.max(0, w - pad * 2),
        height: Math.max(0, h - 6),
        align,
        ellipsis: true,
        lineBreak: false,
      });
    };

    const drawGridRect = (x, y, w, h, fillColor) => {
      if (fillColor) {
        doc.save();
        doc.rect(x, y, w, h).fill(fillColor);
        doc.restore();
      }
      doc.save();
      doc.lineWidth(1).strokeColor(GRID).rect(x, y, w, h).stroke();
      doc.restore();
    };

    const drawInnerV = (x, y1, y2) => {
      doc.save();
      doc.lineWidth(0.7).strokeColor(LIGHT_GRID).moveTo(x, y1).lineTo(x, y2).stroke();
      doc.restore();
    };

    const drawInnerH = (x1, x2, y) => {
      doc.save();
      doc.lineWidth(0.7).strokeColor(LIGHT_GRID).moveTo(x1, y).lineTo(x2, y).stroke();
      doc.restore();
    };

    // ====== BLOQUE IZQUIERDO (CARGOS) ======
    // Banda header de bloque (verde)
    const blockHeaderH = 22;
    drawGridRect(leftX, blockTop, leftW, blockHeaderH, GREEN);
    cellText("", leftX, blockTop, leftW, blockHeaderH);
    doc.font("Helvetica-Bold").fontSize(10).fillColor("#000");
    doc.text("", leftX, blockTop + 6);

    // Columnas como el excel
    // MES | CANTIDAD | CODIGO | PROFESIONAL | A PAGAR | PAGADO POR PADRES | DETALLE | (OS...) | (DETALLE...)
    const colDefsLeft = (() => {
      const base = [
        { key: "mes", label: "MES", w: 60, align: "left" },
        { key: "cantidad", label: "CANTIDAD", w: 60, align: "center" },
        { key: "codigo", label: "CODIGO", w: 190, align: "left" },
        { key: "profesional", label: "PROFESIONAL", w: 140, align: "left" },
        { key: "aPagar", label: "A PAGAR", w: 85, align: "right" },
        { key: "pagPadres", label: "PAGADO POR PADRES", w: 105, align: "right" },
        { key: "detPadres", label: "DETALLE", w: 130, align: "left" },
      ];

      if (tieneOS) {
        base.push(
          { key: "pagOS", label: "PAGADO POR O.S", w: 95, align: "right" },
          { key: "detOS", label: "DETALLE", w: 120, align: "left" }
        );
      } else {
        // Si no hay OS, ensanchamos el detalle para que quede prolijo
        base[6].w += 95 + 120;
      }

      // Ajuste final para que calce exacto al ancho del bloque
      const sumW = base.reduce((a, c) => a + c.w, 0);
      if (sumW !== leftW) base[2].w += (leftW - sumW); // sumo/resto en CODIGO
      return base;
    })();

    const headerYLeft = blockTop + blockHeaderH;
    const headRowH = 20;
    drawGridRect(leftX, headerYLeft, leftW, headRowH, HEADER_BG);

    // verticales + labels
    let cx = leftX;
    for (let i = 0; i < colDefsLeft.length; i++) {
      const c = colDefsLeft[i];
      if (i > 0) drawInnerV(cx, headerYLeft, headerYLeft + headRowH);
      cellText(c.label, cx, headerYLeft, c.w, headRowH, { bold: true, fontSize: 7.5, align: "center" });
      cx += c.w;
    }
    // borde outer ya hecho, pero hacemos rect completo
    doc.save(); doc.lineWidth(1).strokeColor(GRID).rect(leftX, headerYLeft, leftW, headRowH).stroke(); doc.restore();

    // filas
    const rowH = 18;
    let y = headerYLeft + headRowH;

    const maxRowsArea = Math.floor((blockTop + blockH - 90 - y) / rowH);
    const filasToDraw = filas.slice(0, Math.max(0, maxRowsArea)); // evita explosión si hay muchísimas

    for (const r of filasToDraw) {
      drawGridRect(leftX, y, leftW, rowH, CELL_BG);

      let x = leftX;
      for (let i = 0; i < colDefsLeft.length; i++) {
        const c = colDefsLeft[i];
        if (i > 0) drawInnerV(x, y, y + rowH);

        let val = r[c.key];
        if (c.key === "aPagar" || c.key === "pagPadres" || c.key === "pagOS") val = `$ ${fmtARS(val)}`;
        if (c.key === "cantidad") val = String(val ?? "");
        cellText(val ?? "", x, y, c.w, rowH, { align: c.align, fontSize: 8 });

        x += c.w;
      }

      doc.save(); doc.lineWidth(1).strokeColor(GRID).rect(leftX, y, leftW, rowH).stroke(); doc.restore();
      y += rowH;
    }

    // Totales (abajo izquierda como el excel)
    const totalsBoxY = y + 6;
    const totalsH = 60;

    // Caja de totales (con bordes más marcados)
    drawGridRect(leftX + Math.floor(leftW * 0.52), totalsBoxY, Math.floor(leftW * 0.18), totalsH, "#fff");
    drawGridRect(leftX + Math.floor(leftW * 0.70), totalsBoxY, Math.floor(leftW * 0.30), totalsH, "#fff");

    // Texto: "Total que deberia haber pagado" / "Total que pago"
    cellText("Total que deberia\nhaber pagado", leftX + Math.floor(leftW * 0.52), totalsBoxY, Math.floor(leftW * 0.18), totalsH, { fontSize: 8, align: "left", bold: true });
    cellText(`$ ${fmtARS(totalAPagar)}`, leftX + Math.floor(leftW * 0.70), totalsBoxY, Math.floor(leftW * 0.30), Math.floor(totalsH / 2), { fontSize: 9, align: "right", bold: true });

    const totalPagoLabel = "Total que pago";
    cellText(totalPagoLabel, leftX + Math.floor(leftW * 0.52), totalsBoxY + Math.floor(totalsH / 2), Math.floor(leftW * 0.18), Math.floor(totalsH / 2), { fontSize: 8, align: "left", bold: true });
    cellText(`$ ${fmtARS(totalPago)}`, leftX + Math.floor(leftW * 0.70), totalsBoxY + Math.floor(totalsH / 2), Math.floor(leftW * 0.30), Math.floor(totalsH / 2), { fontSize: 9, align: "right", bold: true });

    // ====== BLOQUE DERECHO (FACTURAS) ======
    // Banda header "FACTURAS"
    drawGridRect(rightX, blockTop, rightW, blockHeaderH, GREEN);
    doc.font("Helvetica-Bold").fontSize(10).fillColor("#000");
    doc.text("FACTURAS", rightX, blockTop + 6, { width: rightW, align: "center" });

    const headerYRight = blockTop + blockHeaderH;
    drawGridRect(rightX, headerYRight, rightW, headRowH, HEADER_BG);

    const colDefsRight = (() => {
      const base = [
        { key: "mes", label: "MES", w: 70, align: "left" },
        { key: "nro", label: "N FACTURA", w: 70, align: "left" },
        { key: "monto", label: "MONTO", w: 90, align: "right" },
        { key: "detalle", label: "DETALLE", w: 90, align: "left" },
        { key: "fecha", label: "FECHA", w: 70, align: "left" },
      ];
      const sumW = base.reduce((a, c) => a + c.w, 0);
      if (sumW !== rightW) base[3].w += (rightW - sumW); // ajusto DETALLE
      return base;
    })();

    cx = rightX;
    for (let i = 0; i < colDefsRight.length; i++) {
      const c = colDefsRight[i];
      if (i > 0) drawInnerV(cx, headerYRight, headerYRight + headRowH);
      cellText(c.label, cx, headerYRight, c.w, headRowH, { bold: true, fontSize: 7.5, align: "center" });
      cx += c.w;
    }
    doc.save(); doc.lineWidth(1).strokeColor(GRID).rect(rightX, headerYRight, rightW, headRowH).stroke(); doc.restore();

    // filas facturas
    y = headerYRight + headRowH;
    const maxRowsFact = Math.floor((blockTop + blockH - 90 - y) / rowH);
    const factToDraw = facturas.slice(0, Math.max(0, maxRowsFact));

    for (const f of factToDraw) {
      drawGridRect(rightX, y, rightW, rowH, "#fff");

      let x = rightX;
      for (let i = 0; i < colDefsRight.length; i++) {
        const c = colDefsRight[i];
        if (i > 0) drawInnerV(x, y, y + rowH);

        let val = f[c.key];
        if (c.key === "monto") val = `$ ${fmtARS(val)}`;

        cellText(val ?? "", x, y, c.w, rowH, { align: c.align, fontSize: 8 });
        x += c.w;
      }

      doc.save(); doc.lineWidth(1).strokeColor(GRID).rect(rightX, y, rightW, rowH).stroke(); doc.restore();
      y += rowH;
    }

    // Total facturado abajo derecha
    const totFactY = y + 6;
    const totFactH = 34;
    drawGridRect(rightX + Math.floor(rightW * 0.55), totFactY, Math.floor(rightW * 0.45), totFactH, "#fff");
    cellText("Total que se le facturo", rightX + Math.floor(rightW * 0.55), totFactY, Math.floor(rightW * 0.25), totFactH, { bold: true, fontSize: 8, align: "left" });
    cellText(`$ ${fmtARS(totalFacturado)}`, rightX + Math.floor(rightW * 0.80), totFactY, Math.floor(rightW * 0.20), totFactH, { bold: true, fontSize: 9, align: "right" });

    // Pie: rango
    doc.font("Helvetica").fontSize(8).fillColor("#444");
    const rangoTxt = (desde && hasta) ? `Rango: ${desde} a ${hasta}` : "Rango: (todos los periodos)";
    doc.text(rangoTxt, left, pageH - 18, { width: right - left, align: "left" });

    doc.end();
  } catch (err) {
    console.error("estado-de-cuenta PDF:", err);
    try {
      if (!res.headersSent) res.status(500).json({ error: "No se pudo generar el PDF" });
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


