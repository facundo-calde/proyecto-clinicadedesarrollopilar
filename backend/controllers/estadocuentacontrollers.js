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

    // ---------- Helpers ----------
    const pick = (obj, keys, def = "") => {
      for (const k of keys) {
        const v = obj && obj[k];
        if (v !== undefined && v !== null && String(v).trim() !== "") return v;
      }
      return def;
    };

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

    const rangeFilter = () => {
      if (desde && hasta) return { period: { $gte: desde, $lte: hasta } };
      return {};
    };

    // ========= Datos =========
    const movsRango = await Movimiento.find({
      dni,
      areaId,
      ...rangeFilter(),
    })
      .sort({ fecha: 1 })
      .lean();

    const movsFact = await Movimiento.find({
      dni,
      areaId,
      tipo: "FACT",
      ...(hasta ? { period: { $lte: hasta } } : {}),
    })
      .sort({ fecha: 1 })
      .lean();

    // ========= Filas (tabla izquierda) =========
    const filas = movsRango
      .filter((m) => m.tipo === "CARGO")
      .map((m) => {
        const mes = yyyymmFromMov(m) || "-";
        const cantidad = Number(pick(m, ["cantidad", "qty", "cant"], 1)) || 1;

        const codigo = pick(m, ["codigo", "moduloCodigo", "cod"], "");
        const moduloNombre = pick(m, ["moduloNombre", "nombreModulo", "modulo", "descripcion", "desc"], "");
        const codigoFinal = codigo && moduloNombre ? `${codigo}. ${moduloNombre}` : (codigo || moduloNombre || "-");

        const profesional =
          pick(m, ["profesionalNombre", "profesional", "usuarioNombre", "nombreProfesional"], "") || "No aplica";

        const aPagar = Number(m.monto || 0);

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

    const totalAPagar = filas.reduce((a, r) => a + Number(r.aPagar || 0), 0);
    const totalPadres = filas.reduce((a, r) => a + Number(r.pagPadres || 0), 0);
    const totalOS = tieneOS ? filas.reduce((a, r) => a + Number(r.pagOS || 0), 0) : 0;
    const totalPago = totalPadres + totalOS;

    const facturas = movsFact
      .map((m) => ({
        mes: yyyymmFromMov(m) || "-",
        nro: pick(m, ["nroFactura", "nroRecibo", "numero", "comprobante", "tipoFactura"], "-"),
        monto: Number(m.monto || 0),
        detalle: pick(m, ["detalle", "estado", "observaciones"], ""),
        fecha: m.fecha ? new Date(m.fecha).toLocaleDateString("es-AR") : "",
      }))
      .sort((a, b) => String(a.mes).localeCompare(String(b.mes)));

    const totalFacturado = facturas.reduce((a, f) => a + Number(f.monto || 0), 0);
    const difFactVsPagado = Number((totalFacturado - totalPago).toFixed(2));

    // ========= PDF (stream estable) =========
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="Extracto_${dni}_${(area.nombre || "area").replace(/\s+/g, "_")}${desde && hasta ? `_${desde}_a_${hasta}` : ""}.pdf"`
    );
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 24, compress: true });

    let closed = false;
    const safeEnd = () => {
      if (!closed) {
        closed = true;
        try { doc.end(); } catch (_) {}
      }
    };

    req.on("aborted", safeEnd);
    res.on("close", safeEnd);
    res.on("error", safeEnd);

    doc.on("error", (e) => {
      console.error("PDFKit error:", e);
      try { if (!res.headersSent) res.status(500).json({ error: "No se pudo generar el PDF" }); } catch (_) {}
      safeEnd();
    });

    doc.pipe(res);

    // ---------- LOGO (opcional, no rompe) ----------
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
        doc.image(found, doc.page.margins.left, 14, { width: 150 });
        logoDrawn = true;
      }
    } catch (_) {}

    // ========= Dibujo tipo Excel (PROLIJO + CLIP + AUTO FIT) =========
    const GREEN = "#9BBB59";
    const GRID = "#2a2a2a";
    const LIGHT_GRID = "#bfbfbf";
    const HEADER_BG = "#D9EAD3";
    const CELL_BG = "#EAF3E3";

    const pageW = doc.page.width;
    const pageH = doc.page.height;
    const left = doc.page.margins.left;
    const top = doc.page.margins.top;
    const right = pageW - doc.page.margins.right;

    const bandH = 26;
    doc.save();
    doc.rect(left, top, right - left, bandH).fill(GREEN);
    doc.fillColor("#000").fontSize(11).font("Helvetica-Bold");
    doc.text(`AREA: ${String(area.nombre || "-").toUpperCase()}`, left, top + 7, {
      width: right - left,
      align: "center",
    });
    doc.restore();

    doc.font("Helvetica-Bold").fontSize(9).fillColor("#000");
    doc.text(`DIF ENTRE FACT Y PAGADO   -$`, right - 260, top + 6, { width: 160, align: "right" });
    doc.text(fmtARS(difFactVsPagado).replace("$ ", ""), right - 95, top + 6, { width: 90, align: "right" });

    const gap = 14;
    const blockTop = top + bandH + 12;
    const blockH = pageH - blockTop - 26;

    const leftW = Math.floor((right - left - gap) * 0.62);
    const rightW = (right - left - gap) - leftW;

    const leftX = left;
    const rightX = left + leftW + gap;

    const blockHeaderH = 22;
    const headRowH = 20;
    const rowH = 18;

    const scaleColsToFit = (cols, targetW) => {
      const sum = cols.reduce((a, c) => a + c.w, 0);
      if (sum <= 0) return cols;
      const ratio = targetW / sum;
      const out = cols.map((c) => ({ ...c, w: Math.max(30, Math.floor(c.w * ratio)) }));
      // ajuste por redondeo
      const sum2 = out.reduce((a, c) => a + c.w, 0);
      out[out.length - 1].w += (targetW - sum2);
      return out;
    };

    const drawOuter = (x, y, w, h, fillColor = null) => {
      if (fillColor) {
        doc.save();
        doc.rect(x, y, w, h).fill(fillColor);
        doc.restore();
      }
      doc.save();
      doc.lineWidth(1).strokeColor(GRID).rect(x, y, w, h).stroke();
      doc.restore();
    };

    const vLine = (x, y1, y2) => {
      doc.save();
      doc.lineWidth(0.7).strokeColor(LIGHT_GRID).moveTo(x, y1).lineTo(x, y2).stroke();
      doc.restore();
    };

    const cellText = (text, x, y, w, h, opts = {}) => {
      const pad = opts.pad ?? 3;
      const align = opts.align ?? "left";
      const fontSize = opts.fontSize ?? 7.6;
      const bold = !!opts.bold;
      const color = opts.color ?? "#000";

      // ✅ CLIP por celda: nada se sale del rect
      doc.save();
      doc.rect(x, y, w, h).clip();

      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(fontSize).fillColor(color);
      doc.text(String(text ?? ""), x + pad, y + 4, {
        width: Math.max(0, w - pad * 2),
        height: Math.max(0, h - 8),
        align,
        ellipsis: true,
        lineBreak: false,
      });

      doc.restore();
    };

    // ===== Bloque IZQ header =====
    drawOuter(leftX, blockTop, leftW, blockHeaderH, GREEN);

    // ===== Tabla IZQ: columnas (auto-fit al bloque) =====
    let colDefsLeft = [
      { key: "mes", label: "MES", w: 70, align: "left" },
      { key: "cantidad", label: "CANT", w: 55, align: "center" },
      { key: "codigo", label: "CODIGO", w: 200, align: "left" },
      { key: "profesional", label: "PROFESIONAL", w: 140, align: "left" },
      { key: "aPagar", label: "A PAGAR", w: 85, align: "right" },
      { key: "pagPadres", label: "PAGADO POR PADRES", w: 110, align: "right" },
      { key: "detPadres", label: "DETALLE", w: 150, align: "left" },
    ];

    if (tieneOS) {
      colDefsLeft.push(
        { key: "pagOS", label: "PAGADO POR O.S", w: 105, align: "right" },
        { key: "detOS", label: "DETALLE", w: 150, align: "left" }
      );
    } else {
      colDefsLeft.find(c => c.key === "detPadres").w += 255; // agrando detalle si no hay OS
    }

    colDefsLeft = scaleColsToFit(colDefsLeft, leftW);

    const headerYLeft = blockTop + blockHeaderH;
    drawOuter(leftX, headerYLeft, leftW, headRowH, HEADER_BG);

    let x = leftX;
    for (let i = 0; i < colDefsLeft.length; i++) {
      const c = colDefsLeft[i];
      if (i > 0) vLine(x, headerYLeft, headerYLeft + headRowH);
      cellText(c.label, x, headerYLeft, c.w, headRowH, { bold: true, fontSize: 7.2, align: "center" });
      x += c.w;
    }

    // filas IZQ
    let y = headerYLeft + headRowH;
    const maxYLeft = blockTop + blockH - 88; // deja lugar a totales

    for (const r of filas) {
      if (y + rowH > maxYLeft) break;

      drawOuter(leftX, y, leftW, rowH, CELL_BG);

      let xx = leftX;
      for (let i = 0; i < colDefsLeft.length; i++) {
        const c = colDefsLeft[i];
        if (i > 0) vLine(xx, y, y + rowH);

        let val = r[c.key];
        if (c.key === "aPagar" || c.key === "pagPadres" || c.key === "pagOS") val = fmtARS(val);
        if (c.key === "cantidad") val = String(val ?? "");

        cellText(val ?? "", xx, y, c.w, rowH, { align: c.align, fontSize: 7.4 });
        xx += c.w;
      }

      y += rowH;
    }

    // ===== Totales abajo IZQ =====
    const totalsBoxY = blockTop + blockH - 70;
    const totalsH = 60;

    const tX1 = leftX + Math.floor(leftW * 0.55);
    const tW1 = Math.floor(leftW * 0.15);
    const tX2 = tX1 + tW1;
    const tW2 = leftX + leftW - tX2;

    drawOuter(tX1, totalsBoxY, tW1, totalsH, "#fff");
    drawOuter(tX2, totalsBoxY, tW2, totalsH, "#fff");

    cellText("Total que deberia\nhaber pagado", tX1, totalsBoxY, tW1, Math.floor(totalsH / 2), { bold: true, fontSize: 7.6 });
    cellText(fmtARS(totalAPagar), tX2, totalsBoxY, tW2, Math.floor(totalsH / 2), { bold: true, fontSize: 8.2, align: "right" });

    cellText("Total que pago", tX1, totalsBoxY + Math.floor(totalsH / 2), tW1, Math.floor(totalsH / 2), { bold: true, fontSize: 7.6 });
    cellText(fmtARS(totalPago), tX2, totalsBoxY + Math.floor(totalsH / 2), tW2, Math.floor(totalsH / 2), { bold: true, fontSize: 8.2, align: "right" });

    // ===== Bloque DERECHO (FACTURAS) =====
    drawOuter(rightX, blockTop, rightW, blockHeaderH, GREEN);
    doc.font("Helvetica-Bold").fontSize(10).fillColor("#000");
    doc.text("FACTURAS", rightX, blockTop + 6, { width: rightW, align: "center" });

    const headerYRight = blockTop + blockHeaderH;

    let colDefsRight = [
      { key: "mes", label: "MES", w: 70, align: "left" },
      { key: "nro", label: "N FACTURA", w: 80, align: "left" },
      { key: "monto", label: "MONTO", w: 90, align: "right" },
      { key: "detalle", label: "DETALLE", w: 90, align: "left" },
      { key: "fecha", label: "FECHA", w: 70, align: "left" },
    ];
    colDefsRight = scaleColsToFit(colDefsRight, rightW);

    drawOuter(rightX, headerYRight, rightW, headRowH, HEADER_BG);

    x = rightX;
    for (let i = 0; i < colDefsRight.length; i++) {
      const c = colDefsRight[i];
      if (i > 0) vLine(x, headerYRight, headerYRight + headRowH);
      cellText(c.label, x, headerYRight, c.w, headRowH, { bold: true, fontSize: 7.2, align: "center" });
      x += c.w;
    }

    y = headerYRight + headRowH;
    const maxYRight = blockTop + blockH - 60;

    for (const f of facturas) {
      if (y + rowH > maxYRight) break;

      drawOuter(rightX, y, rightW, rowH, "#fff");

      let xx = rightX;
      for (let i = 0; i < colDefsRight.length; i++) {
        const c = colDefsRight[i];
        if (i > 0) vLine(xx, y, y + rowH);

        let val = f[c.key];
        if (c.key === "monto") val = fmtARS(val);

        cellText(val ?? "", xx, y, c.w, rowH, { align: c.align, fontSize: 7.4 });
        xx += c.w;
      }

      y += rowH;
    }

    // total facturado
    const totFactY = blockTop + blockH - 42;
    const totFactH = 34;
    const fx1 = rightX + Math.floor(rightW * 0.55);
    const fw1 = Math.floor(rightW * 0.25);
    const fx2 = fx1 + fw1;
    const fw2 = rightX + rightW - fx2;

    drawOuter(fx1, totFactY, fw1, totFactH, "#fff");
    drawOuter(fx2, totFactY, fw2, totFactH, "#fff");

    cellText("Total que se le facturo", fx1, totFactY, fw1, totFactH, { bold: true, fontSize: 7.6 });
    cellText(fmtARS(totalFacturado), fx2, totFactY, fw2, totFactH, { bold: true, fontSize: 8.2, align: "right" });

    // pie: rango
    doc.font("Helvetica").fontSize(8).fillColor("#444");
    const rangoTxt = (desde && hasta) ? `Rango: ${desde} a ${hasta}` : "Rango: (todos los periodos)";
    doc.text(rangoTxt, left, pageH - 16, { width: right - left, align: "left" });

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


