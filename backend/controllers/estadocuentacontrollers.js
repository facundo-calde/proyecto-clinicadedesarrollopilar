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
    const dni = toStr(req.params.dni).trim();
    const areaIdStr = toStr(req.query.areaId || "").trim();

    const period = req.query.period ? toStr(req.query.period).trim() : null; // YYYY-MM
    const desde = req.query.desde ? toStr(req.query.desde).trim() : null;    // YYYY-MM
    const hasta = req.query.hasta ? toStr(req.query.hasta).trim() : null;    // YYYY-MM

    if (!areaIdStr) return res.status(400).json({ error: "areaId es obligatorio" });

    const paciente = await Paciente.findOne({ dni }).lean();
    if (!paciente) return res.status(404).json({ error: "Paciente no encontrado" });

    const area = await Area.findById(areaIdStr).lean();
    if (!area) return res.status(404).json({ error: "Área no encontrada" });

    const tieneOS = /obra social/i.test(paciente.condicionDePago || "");

    // ===== helpers =====
    const fmtARS = (n) => {
      const num = Number(n || 0);
      return `$ ${num.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    const periodoDeMov = (m) => {
      return (
        m.period ||
        m.periodo ||
        (m.fecha ? new Date(m.fecha).toISOString().slice(0, 7) : "")
      );
    };

    const inRange = (p) => {
      if (!p) return false;
      if (period) return p === period;
      if (desde && p < desde) return false;
      if (hasta && p > hasta) return false;
      return true;
    };

    // ===== traer movimientos =====
    const where = {
      dni,
      areaId: new mongoose.Types.ObjectId(areaIdStr),
    };

    // Si viene period -> filtramos directo por DB
    if (period) where.period = period;
    // Si vienen desde/hasta no filtramos por DB porque algunos movs pueden no tener `period` (viejos),
    // filtramos luego por JS usando fecha/period.
    const movsRaw = await Movimiento.find(where).sort({ fecha: 1 }).lean();

    // Filtrar por rango si aplica (cuando no hay `period` fijo)
    const movs = (!period && (desde || hasta))
      ? movsRaw.filter((m) => inRange(periodoDeMov(m)))
      : movsRaw;

    // ===== agrupar por mes (estado de cuenta) =====
    // Queremos: MES | Debería pagar | Pagó Padres | Pagó OS | Total pagado | Saldo mes
    const mesesMap = new Map();

    const getMesRow = (mes) => {
      if (!mesesMap.has(mes)) {
        mesesMap.set(mes, {
          mes,
          cargos: 0,
          pagoPadres: 0,
          pagoOS: 0,
          ajustesMas: 0,
          ajustesMenos: 0,
        });
      }
      return mesesMap.get(mes);
    };

    for (const m of movs) {
      const mes = periodoDeMov(m);
      if (!mes) continue;

      const row = getMesRow(mes);
      const monto = Number(m.monto || 0) || 0;

      if (m.tipo === "CARGO") {
        row.cargos += monto;

        // pagos “anidados” dentro del cargo
        row.pagoPadres += parseNumberLike(m.pagPadres, 0);
        row.pagoOS += parseNumberLike(m.pagOS, 0);
      } else if (m.tipo === "PART") {
        row.pagoPadres += monto;
      } else if (m.tipo === "OS") {
        row.pagoOS += monto;
      } else if (m.tipo === "AJUSTE+") {
        row.ajustesMas += monto;
      } else if (m.tipo === "AJUSTE-") {
        row.ajustesMenos += monto;
      }
    }

    // si no tiene OS -> no mostramos/contamos OS
    if (!tieneOS) {
      for (const row of mesesMap.values()) row.pagoOS = 0;
    }

    const meses = Array.from(mesesMap.values()).sort((a, b) => (a.mes > b.mes ? 1 : -1));

    // ===== totales generales =====
    let totalCargos = 0;
    let totalPagadoPadres = 0;
    let totalPagadoOS = 0;
    let totalAjustesMas = 0;
    let totalAjustesMenos = 0;

    for (const r of meses) {
      totalCargos += r.cargos;
      totalPagadoPadres += r.pagoPadres;
      totalPagadoOS += r.pagoOS;
      totalAjustesMas += r.ajustesMas;
      totalAjustesMenos += r.ajustesMenos;
    }

    const totalPagado = totalPagadoPadres + totalPagadoOS + totalAjustesMas - totalAjustesMenos;
    const saldo = Number((totalCargos - totalPagado).toFixed(2));

    // ===== facturas (mes, nro, monto, estado) =====
    const facturas = movs
      .filter((m) => m.tipo === "FACT")
      .map((m) => ({
        mes: periodoDeMov(m) || "",
        nro: m.nroRecibo || m.tipoFactura || "",
        monto: Number(m.monto || 0) || 0,
        estado: (m.estado || "PENDIENTE").toUpperCase(),
      }))
      .sort((a, b) => (a.mes > b.mes ? 1 : -1));

    const totalFacturado = facturas.reduce((acc, f) => acc + (Number(f.monto) || 0), 0);

    // ===== PDF =====
    const periodoTxt = period
      ? `_${period}`
      : (desde || hasta)
        ? `_${desde || "inicio"}_a_${hasta || "hoy"}`
        : "";

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="Extracto_${dni}_${(area.nombre || "area").replace(/\s+/g, "_")}${periodoTxt}.pdf"`
    );

    const doc = new PDFDocument({ margin: 40, size: "A4" });
    doc.pipe(res);

    // ===== LOGO =====
    // Usamos process.cwd() para evitar líos de rutas cuando PM2 corre desde /backend
    const logoRel = path.join("frontend", "img", "fc885963d690a6787ca787cf208cdd25_1778x266_fit.png");
    const logoPath = path.resolve(process.cwd(), logoRel);

    let headerTopY = 40;

    if (fs.existsSync(logoPath)) {
      try {
        doc.image(logoPath, 40, 25, { width: 170 });
        headerTopY = 90;
      } catch (e) {
        console.error("No se pudo renderizar el logo en PDF:", e);
      }
    } else {
      console.warn("Logo no encontrado en:", logoPath);
    }

    // ===== HEADER =====
    doc.y = headerTopY;
    doc.fontSize(14).fillColor("#000").text("Informe de estado de cuenta", { align: "left" });
    doc.moveDown(0.4);

    doc.fontSize(11).fillColor("#000").text(`${paciente.nombre || "-"} - DNI ${paciente.dni || "-"}`);
    doc.fontSize(10).fillColor("#444").text(`Área: ${area.nombre || "-"}`);
    if (period) doc.text(`Periodo: ${period}`);
    if (!period && (desde || hasta)) doc.text(`Periodo: ${desde || "—"} a ${hasta || "—"}`);
    doc.moveDown(0.6);

    // ===== RESUMEN =====
    doc
      .fontSize(12)
      .fillColor(saldo <= 0 ? "#0a7a36" : "#b00020")
      .text(`SALDO ACTUAL: ${fmtARS(saldo)}`);

    doc.moveDown(0.2);
    doc.fontSize(10).fillColor("#000");
    doc.text(`Debería pagar (cargos): ${fmtARS(totalCargos)}`);
    doc.text(`Pagó Padres: ${fmtARS(totalPagadoPadres)}`);
    if (tieneOS) doc.text(`Pagó Obra Social: ${fmtARS(totalPagadoOS)}`);
    doc.text(`Total pagado (Padres + O.S. + ajustes): ${fmtARS(totalPagado)}`);
    doc.text(`Total facturado: ${fmtARS(totalFacturado)}`);

    if (totalAjustesMas || totalAjustesMenos) {
      doc.text(`Ajustes: +${fmtARS(totalAjustesMas)} / -${fmtARS(totalAjustesMenos)}`);
    }

    doc.moveDown(0.6);
    doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor("#ddd").stroke();
    doc.moveDown(0.6);

    // ===== TABLA ESTADO DE CUENTA (por MES) =====
    doc.fontSize(11).fillColor("#000").text("ESTADO DE CUENTA (por mes)", { underline: true });
    doc.moveDown(0.35);

    // Columnas
    const col = {
      mes: 40,
      deberia: 115,
      padres: 255,
      os: 365,
      total: 455,
      saldo: 535,
    };

    const rowH = 16;

    const printHeaderRow = () => {
      doc.fontSize(8).fillColor("#333");
      doc.text("MES", col.mes, doc.y, { width: 60 });
      doc.text("DEBERÍA PAGAR", col.deberia, doc.y, { width: 120, align: "right" });
      doc.text("PAGÓ PADRES", col.padres, doc.y, { width: 100, align: "right" });
      doc.text("PAGÓ O.S.", col.os, doc.y, { width: 80, align: "right" });
      doc.text("TOTAL PAGADO", col.total, doc.y, { width: 80, align: "right" });
      doc.text("SALDO", col.saldo, doc.y, { width: 60, align: "right" });
      doc.moveDown(0.3);
      doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor("#eee").stroke();
      doc.moveDown(0.2);
    };

    printHeaderRow();

    doc.fontSize(9).fillColor("#000");

    if (!meses.length) {
      doc.fontSize(9).fillColor("#666").text("Sin movimientos en el periodo seleccionado.");
      doc.moveDown(0.6);
    } else {
      for (const r of meses) {
        // salto de página si hace falta
        if (doc.y > 760) {
          doc.addPage();
          printHeaderRow();
          doc.fontSize(9).fillColor("#000");
        }

        const totalPagMes = (r.pagoPadres + r.pagoOS + r.ajustesMas - r.ajustesMenos);
        const saldoMes = Number((r.cargos - totalPagMes).toFixed(2));

        doc.text(r.mes || "-", col.mes, doc.y, { width: 60 });
        doc.text(fmtARS(r.cargos), col.deberia, doc.y, { width: 120, align: "right" });
        doc.text(fmtARS(r.pagoPadres), col.padres, doc.y, { width: 100, align: "right" });
        doc.text(tieneOS ? fmtARS(r.pagoOS) : "$ 0,00", col.os, doc.y, { width: 80, align: "right" });
        doc.text(fmtARS(totalPagMes), col.total, doc.y, { width: 80, align: "right" });
        doc.text(fmtARS(saldoMes), col.saldo, doc.y, { width: 60, align: "right" });

        doc.y += rowH;
      }

      doc.moveDown(0.4);
    }

    doc.moveDown(0.4);
    doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor("#ddd").stroke();
    doc.moveDown(0.6);

    // ===== TABLA FACTURAS =====
    doc.fontSize(11).fillColor("#000").text("FACTURAS", { underline: true });
    doc.moveDown(0.35);

    const fx = { mes: 40, nro: 140, monto: 300, estado: 430 };

    const printFactHeader = () => {
      doc.fontSize(9).fillColor("#333");
      doc.text("MES", fx.mes, doc.y, { width: 80 });
      doc.text("N°", fx.nro, doc.y, { width: 120 });
      doc.text("MONTO", fx.monto, doc.y, { width: 100, align: "right" });
      doc.text("ESTADO", fx.estado, doc.y, { width: 120 });
      doc.moveDown(0.3);
      doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor("#eee").stroke();
      doc.moveDown(0.2);
    };

    printFactHeader();

    if (!facturas.length) {
      doc.fontSize(9).fillColor("#666").text("Sin facturas registradas.");
      doc.moveDown(0.6);
    } else {
      doc.fontSize(9).fillColor("#000");
      for (const f of facturas) {
        if (doc.y > 760) {
          doc.addPage();
          printFactHeader();
          doc.fontSize(9).fillColor("#000");
        }

        doc.text(f.mes || "-", fx.mes, doc.y, { width: 80 });
        doc.text(String(f.nro || "-"), fx.nro, doc.y, { width: 120 });
        doc.text(fmtARS(f.monto), fx.monto, doc.y, { width: 100, align: "right" });
        doc.text((f.estado || "PENDIENTE").toUpperCase(), fx.estado, doc.y, { width: 120 });

        doc.y += rowH;
      }
      doc.moveDown(0.6);
    }

    // ===== OBSERVACIONES =====
    doc.moveDown(0.4);
    doc.fontSize(9).fillColor("#666").text("OBSERVACIONES:", { underline: true });
    doc.moveDown(0.2);

    const leyenda =
      saldo <= 0
        ? `Al día de la fecha, la cuenta del área de ${area.nombre} no registra deuda pendiente.`
        : `Al día de la fecha, la cuenta del área de ${area.nombre} registra un saldo pendiente de ${fmtARS(saldo)}.`;

    doc.text(leyenda, { align: "justify" });

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


