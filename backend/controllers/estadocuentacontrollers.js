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

// 🟢 NUEVO: modelos de caja
const Caja = require("../models/cajas");
const CajaMovimiento = require("../models/cajaMovimiento");

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

    // -----------------------------
    // CALCULAR DELTAS PARA CAJA
    // -----------------------------
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

    // Movimientos CARGO anteriores en esos periodos (para deltas)
    const prevCargos = await Movimiento.find(deleteFilterCargos).lean();

    let prevPadres = 0;
    let prevOS = 0;
    for (const m of prevCargos) {
      prevPadres += parseNumberLike(m.pagPadres, 0);
      prevOS += parseNumberLike(m.pagOS, 0);
    }

    // Totales nuevos desde las líneas del modal
    let newPadres = 0;
    let newOS = 0;
    for (const l of lineasValidas) {
      newPadres += parseNumberLike(l.pagPadres, 0);
      newOS += parseNumberLike(l.pagOS, 0);
    }

    const deltaPadres = newPadres - prevPadres;
    const deltaOS = newOS - prevOS;
    const deltaTotal = deltaPadres + deltaOS;

    // ---- limpiamos lo que vamos a regenerar (CARGO + FACT) ----
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
        const pagOS = parseNumberLike(l.pagOS, 0);

        // si está totalmente vacía no la guardamos
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
          monto: montoCargo, // puede ser 0
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

      // 🔑 clave única por línea
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

    // 🟢 ACTUALIZAR CAJA POR ÁREA (si hay área y hay delta)
    if (areaId && (deltaPadres !== 0 || deltaOS !== 0)) {
      let caja = await Caja.findOne({ area: areaId });
      if (!caja) {
        caja = await Caja.create({
          area: areaId,
          nombreArea: area?.nombre || "Área sin nombre",
          saldoPadres: 0,
          saldoOS: 0,
          saldoTotal: 0,
        });
      }

      await Caja.updateOne(
        { _id: caja._id },
        {
          $inc: {
            saldoPadres: deltaPadres,
            saldoOS: deltaOS,
            saldoTotal: deltaTotal,
          },
          $set: { ultimoMovimiento: new Date() },
        }
      );

      await CajaMovimiento.create({
        caja: caja._id,
        area: areaId,
        fecha: new Date(),
        tipoMovimiento: deltaTotal >= 0 ? "INGRESO" : "EGRESO",
        categoria:
          deltaPadres && deltaOS
            ? "AMBOS"
            : deltaPadres
            ? "PADRES"
            : deltaOS
            ? "OS"
            : "MANUAL",
        origen: "ESTADO_CUENTA",
        pacienteDni: dni,
        pacienteNombre: paciente.nombre,
        concepto: "Actualización desde estado de cuenta",
        montoPadres: deltaPadres,
        montoOS: deltaOS,
        montoTotal: deltaTotal,
        usuario: req.user ? req.user._id : undefined,
      });
    }

    return res.json({
      ok: true,
      inserted: docsToInsert.length,
      deltaPadres,
      deltaOS,
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

    // Compat: si viene period, lo usamos como desde=hasta=period
    const period = req.query.period ? toStr(req.query.period).trim() : null;
    const desdeQ = req.query.desde ? toStr(req.query.desde).trim() : null;
    const hastaQ = req.query.hasta ? toStr(req.query.hasta).trim() : null;

    const desde = period || desdeQ || null;
    const hasta = period || hastaQ || null;

    if (!areaId) return res.status(400).json({ error: "areaId es obligatorio" });

    const paciente = await Paciente.findOne({ dni }).lean();
    if (!paciente) return res.status(404).json({ error: "Paciente no encontrado" });

    const area = await Area.findById(areaId).lean();
    if (!area) return res.status(404).json({ error: "Área no encontrada" });

    // ✅ según tu schema (enum), esto es lo correcto
    const condicion = String(paciente.condicionDePago || "Particular");
    const tieneOS = /obra\s*social/i.test(condicion) && !/^particular$/i.test(condicion);

    // (no rompe nada: si ya la usabas para otras cosas, la dejamos)
    try { await buildFilasArea(paciente, areaId); } catch (_) {}

    // ---------------- Helpers ----------------
    function fmtARS(n) {
      const num = Number(n || 0);
      return `$ ${num.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    function fmtFecha(d) {
      if (!d) return "";
      const dt = new Date(d);
      if (Number.isNaN(dt.getTime())) return String(d);
      const dd = String(dt.getDate()).padStart(2, "0");
      const mm = String(dt.getMonth() + 1).padStart(2, "0");
      const yy = dt.getFullYear();
      return `${dd}/${mm}/${yy}`;
    }

    const yyyymmFromMov = (m) =>
      m.period || (m.fecha ? new Date(m.fecha).toISOString().slice(0, 7) : "") || "";

    const inRange = (p, d, h) => {
      const dd = d || "1900-01";
      const hh = h || "9999-12";
      return p >= dd && p <= hh;
    };

    function formatCantidad(q) {
      const n = Number(q);
      if (!n) return "1";
      const eps = 1e-9;
      if (Math.abs(n - 0.25) < eps) return "1/4";
      if (Math.abs(n - 0.5) < eps) return "1/2";
      if (Math.abs(n - 0.75) < eps) return "3/4";
      if (Math.abs(n - 1) < eps) return "1";
      if (Math.abs(n - 1.25) < eps) return "1 + 1/4";
      if (Math.abs(n - 1.5) < eps) return "1 + 1/2";
      if (Math.abs(n - 1.75) < eps) return "1 + 3/4";
      if (Math.abs(n - 2) < eps) return "2";
      return String(n).replace(".", ",");
    }

    function safeTxt(v) {
      return String(v ?? "").replace(/\s+/g, " ").trim();
    }

    // ---------------- Movimientos ----------------
    // Para “saldo / resumen”: acumulado hasta "hasta" (si no hay hasta => todo)
    const qAcum = { dni, areaId };
    if (hasta) qAcum.period = { $lte: hasta };

    const movsAcum = await Movimiento.find(qAcum).sort({ fecha: 1 }).lean();

    // Para “tabla”: rango desde/hasta (si no hay => todo)
    const qRango = { dni, areaId };
    if (desde && hasta) qRango.period = { $gte: desde, $lte: hasta };
    else if (desde && !hasta) qRango.period = { $gte: desde };
    else if (!desde && hasta) qRango.period = { $lte: hasta };

    const movsRango = await Movimiento.find(qRango).sort({ fecha: 1 }).lean();

    // ---------------- Totales (acumulados hasta "hasta") ----------------
    let pagadoOS = 0, pagadoPART = 0, cargos = 0, ajustesMas = 0, ajustesMenos = 0, totalFacturado = 0;

    for (const m of movsAcum) {
      const monto = Number(m.monto || 0);

      if (m.tipo === "CARGO") {
        cargos += monto;
        pagadoPART += parseNumberLike(m.pagPadres, 0);
        pagadoOS += parseNumberLike(m.pagOS, 0);
      } else if (m.tipo === "OS") pagadoOS += monto;
      else if (m.tipo === "PART") pagadoPART += monto;
      else if (m.tipo === "AJUSTE+") ajustesMas += monto;
      else if (m.tipo === "AJUSTE-") ajustesMenos -= Math.abs(monto) ? monto : 0;
      else if (m.tipo === "FACT") totalFacturado += monto;
    }

    if (!tieneOS) pagadoOS = 0;

    const totalCargos = cargos;
    const totalPagado = pagadoOS + pagadoPART;
    const totalPagadoConAjustes = totalPagado + ajustesMas - ajustesMenos;
    const saldo = Number((totalCargos - totalPagadoConAjustes).toFixed(2));
    const difFactPag = Number((totalFacturado - totalPagadoConAjustes).toFixed(2));

    // ---------------- Filas (detalle estilo Excel) ----------------
    const filas = movsRango
      .filter((m) => m.tipo === "CARGO")
      .map((m) => {
        const mes = yyyymmFromMov(m) || "-";
        const cantNum =
          m.cantidad ??
          m.qty ??
          m.cant ??
          m.cantidadModulo ??
          1;

        const codigo =
          safeTxt(m.codigo || m.cod || m.moduloCodigo || "") ||
          safeTxt(m.moduloNombre || m.modulo || m.detalleCargo || "") ||
          safeTxt(m.descripcion || "");

        const profesional =
          safeTxt(m.profesionalNombre || m.profesional || m.usuarioNombre || m.usuario || "") ||
          safeTxt(m.nombreProfesional || "");

        const aPagar = Number(m.monto || 0);

        const pagPadres = parseNumberLike(m.pagPadres, 0);
        const detPadres = safeTxt(m.detallePadres || m.detPadres || m.detalle || m.detallePago || "");

        const pagOS = parseNumberLike(m.pagOS, 0);
        const detOS = safeTxt(m.detalleOS || m.detOs || m.detalleObraSocial || "");

        return {
          mes,
          cant: formatCantidad(cantNum),
          codigo,
          profesional,
          aPagar,
          pagPadres,
          detPadres,
          pagOS,
          detOS,
        };
      });

    // ---------------- Facturas (del rango) ----------------
    const facturas = movsRango
      .filter((m) => m.tipo === "FACT")
      .map((m) => ({
        mes: yyyymmFromMov(m) || "-",
        nro: safeTxt(m.nroRecibo || m.nroFactura || m.tipoFactura || "-"),
        monto: Number(m.monto || 0),
        fecha: fmtFecha(m.fecha || m.createdAt || m.fechaFactura),
      }))
      .sort((a, b) => String(a.mes).localeCompare(String(b.mes)));

    // ---------------- PDF headers ----------------
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="Extracto_${dni}_${(area.nombre || "area").replace(/\s+/g, "_")}${desde || hasta ? `_${desde || "INI"}-${hasta || "FIN"}` : ""}.pdf"`
    );

    const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 28 });
    doc.pipe(res);

    const pageLeft = doc.page.margins.left;
    const pageRight = doc.page.width - doc.page.margins.right;
    const pageTop = doc.page.margins.top;
    const pageBottom = doc.page.height - doc.page.margins.bottom;
    const pageW = pageRight - pageLeft;

    // ---------------- Logo ----------------
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
        doc.image(found, pageLeft, 14, { width: 170 });
        logoDrawn = true;
      }
    } catch (e) {
      console.error("No se pudo cargar el logo en PDF:", e);
    }

    doc.y = logoDrawn ? 64 : pageTop;

    // ---------------- Header texto ----------------
    doc.fontSize(14).fillColor("#000").text("Informe de estado de cuenta", pageLeft, doc.y);
    doc.moveDown(0.35);

    doc.fontSize(11).fillColor("#000").text(`${paciente.nombre || "-"} - DNI ${paciente.dni || "-"}`);
    doc.fontSize(10).fillColor("#444").text(`Área: ${area.nombre || "-"}`);
    const rangoTxt =
      desde || hasta
        ? `Rango: ${desde || "(inicio)"} a ${hasta || "(fin)"}`
        : "Rango: (todos los periodos)";
    doc.fontSize(9).fillColor("#444").text(rangoTxt);
    doc.moveDown(0.6);

    const green = "#9BBB59";
    const greenLight = "#EAF2E1";
    const stroke = "#000";

    function drawTopBar() {
      const barH = 22;
      const y = doc.y;
      doc.save();
      doc.rect(pageLeft, y, pageW, barH).fill(green);
      doc.fillColor("#000").fontSize(10).font("Helvetica-Bold");
      doc.text(`AREA: ${area.nombre || "-"}`, pageLeft, y + 6, { width: pageW, align: "center" });

      const rightTxt = `DIF ENTRE FACT Y PAGADO -$`;
      const rightVal = fmtARS(Math.abs(difFactPag));
      doc.font("Helvetica-Bold").fontSize(9).fillColor("#000");
      doc.text(rightTxt, pageLeft, y + 6, { width: pageW - 90, align: "right" });
      doc.text(rightVal, pageRight - 85, y + 6, { width: 85, align: "right" });
      doc.restore();

      doc.y = y + barH + 10;
    }

    drawTopBar();

    const rowH = 14;
    const headerH = 18;

    let cols = [
      { key: "mes", label: "MES", w: 58, align: "left" },
      { key: "cant", label: "CANT", w: 44, align: "center" },
      { key: "codigo", label: "CODIGO", w: 200, align: "left" },
      { key: "profesional", label: "PROFESIONAL", w: 130, align: "left" },
      { key: "aPagar", label: "A PAGAR", w: 78, align: "right" },
      { key: "pagPadres", label: "PAGADO POR\nPADRES", w: 90, align: "right" },
      { key: "detPadres", label: "DETALLE", w: 110, align: "left" },
    ];

    if (tieneOS) {
      cols = cols.concat([
        { key: "pagOS", label: "PAGADO POR\nO.S", w: 80, align: "right" },
        { key: "detOS", label: "DETALLE", w: 110, align: "left" },
      ]);
    }

    const sumW = cols.reduce((a, c) => a + c.w, 0);
    if (sumW > pageW) {
      const ratio = pageW / sumW;
      cols = cols.map((c) => ({ ...c, w: Math.max(38, Math.floor(c.w * ratio)) }));
      const newSum = cols.reduce((a, c) => a + c.w, 0);
      const diff = pageW - newSum;
      cols[cols.length - 1].w += diff;
    } else if (sumW < pageW) {
      const extra = pageW - sumW;
      const idxCodigo = cols.findIndex((c) => c.key === "codigo");
      if (idxCodigo >= 0) cols[idxCodigo].w += Math.floor(extra * 0.6);
      const idxDet = cols.findIndex((c) => c.key === "detPadres");
      if (idxDet >= 0) cols[idxDet].w += extra - Math.floor(extra * 0.6);
    }

    function drawTableHeader() {
      const y = doc.y;

      doc.save();
      doc.rect(pageLeft, y, pageW, headerH).fill(green);
      doc.restore();

      doc.font("Helvetica-Bold").fontSize(7.5).fillColor("#000");

      let x = pageLeft;
      for (const c of cols) {
        doc
          .save()
          .rect(x, y, c.w, headerH)
          .stroke(stroke)
          .restore();

        doc.text(c.label, x + 4, y + 4, {
          width: c.w - 8,
          align: c.align,
          lineBreak: true,
        });
        x += c.w;
      }

      doc.y = y + headerH;
    }

    function drawRow(r) {
      if (doc.y + rowH > pageBottom - 20) {
        doc.addPage();
        doc.y = pageTop;
        drawTopBar();
        drawTableHeader();
      }

      const y = doc.y;

      doc.save();
      doc.rect(pageLeft, y, pageW, rowH).fill(greenLight);
      doc.restore();

      doc.font("Helvetica").fontSize(8.2).fillColor("#000");

      const cell = {
        mes: r.mes || "-",
        cant: r.cant || "1",
        codigo: r.codigo || "",
        profesional: r.profesional || "",
        aPagar: fmtARS(r.aPagar),
        pagPadres: fmtARS(r.pagPadres),
        detPadres: r.detPadres || "",
        pagOS: tieneOS ? fmtARS(r.pagOS) : undefined,
        detOS: tieneOS ? (r.detOS || "") : undefined,
      };

      let x = pageLeft;
      for (const c of cols) {
        doc.save().rect(x, y, c.w, rowH).stroke(stroke).restore();

        const txt = cell[c.key] ?? "";
        doc.text(txt, x + 4, y + 3, {
          width: c.w - 8,
          align: c.align,
          lineBreak: false,
          ellipsis: true,
        });

        x += c.w;
      }

      doc.y = y + rowH;
    }

    drawTableHeader();

    if (!filas.length) {
      doc.fontSize(9).fillColor("#666").text("Sin movimientos en el rango seleccionado.");
    } else {
      for (const r of filas) drawRow(r);
    }

    // FACTURAS
    doc.addPage();
    doc.y = pageTop;
    drawTopBar();

    doc.font("Helvetica-Bold").fontSize(10).fillColor("#000").text("FACTURAS", pageLeft, doc.y);
    doc.moveDown(0.5);

    const fCols = [
      { key: "mes", label: "MES", w: 90, align: "left" },
      { key: "nro", label: "N FACTURA", w: 120, align: "left" },
      { key: "monto", label: "MONTO", w: 180, align: "right" },
      { key: "fecha", label: "FECHA", w: 120, align: "left" },
    ];

    const fSum = fCols.reduce((a, c) => a + c.w, 0);
    if (fSum !== pageW) {
      const diff = pageW - fSum;
      fCols[2].w += Math.floor(diff * 0.6);
      fCols[1].w += diff - Math.floor(diff * 0.6);
    }

    const fHeaderH = 18;
    const fRowH = 14;

    function drawFHeader() {
      const y = doc.y;
      doc.save();
      doc.rect(pageLeft, y, pageW, fHeaderH).fill(green);
      doc.restore();

      doc.font("Helvetica-Bold").fontSize(8).fillColor("#000");

      let x = pageLeft;
      for (const c of fCols) {
        doc.save().rect(x, y, c.w, fHeaderH).stroke(stroke).restore();
        doc.text(c.label, x + 4, y + 5, { width: c.w - 8, align: c.align });
        x += c.w;
      }
      doc.y = y + fHeaderH;
    }

    function drawFRow(f) {
      const y = doc.y;

      if (y + fRowH > pageBottom - 120) return false;

      doc.save();
      doc.rect(pageLeft, y, pageW, fRowH).fill(greenLight);
      doc.restore();

      doc.font("Helvetica").fontSize(8.2).fillColor("#000");

      const cell = {
        mes: f.mes || "-",
        nro: String(f.nro || "-"),
        monto: fmtARS(f.monto),
        fecha: f.fecha || "",
      };

      let x = pageLeft;
      for (const c of fCols) {
        doc.save().rect(x, y, c.w, fRowH).stroke(stroke).restore();
        doc.text(cell[c.key] ?? "", x + 4, y + 3, {
          width: c.w - 8,
          align: c.align,
          lineBreak: false,
          ellipsis: true,
        });
        x += c.w;
      }

      doc.y = y + fRowH;
      return true;
    }

    drawFHeader();

    if (!facturas.length) {
      doc.fontSize(9).fillColor("#666").text("Sin facturas registradas.");
    } else {
      for (const f of facturas) {
        const ok = drawFRow(f);
        if (!ok) break;
      }
    }

    doc.moveDown(1.2);

    const boxH = 46;
    const boxW = 240;
    const boxY = Math.min(doc.y, pageBottom - boxH - 20);
    const midX = pageLeft + Math.floor((pageW - boxW) / 2);

    doc.save().rect(midX, boxY, boxW, boxH).stroke(stroke).restore();
    doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#000");
    doc.text("Total que deberia\nhaber pagado", midX + 8, boxY + 6, { width: 130 });
    doc.text("Total que pago", midX + 8, boxY + 28, { width: 130 });

    doc.font("Helvetica-Bold").fontSize(9).fillColor("#000");
    doc.text(fmtARS(totalCargos), midX + 140, boxY + 12, { width: boxW - 150, align: "right" });
    doc.text(fmtARS(totalPagadoConAjustes), midX + 140, boxY + 30, { width: boxW - 150, align: "right" });

    const boxW2 = 180;
    const rightX = pageRight - boxW2;

    doc.save().rect(rightX, boxY + 10, boxW2, 32).stroke(stroke).restore();
    doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#000");
    doc.text("Total que se\nle facturo", rightX + 8, boxY + 16, { width: 90 });
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#000");
    doc.text(fmtARS(totalFacturado), rightX + 95, boxY + 24, { width: boxW2 - 100, align: "right" });

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


