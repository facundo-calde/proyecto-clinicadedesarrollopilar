// controllers/estadocuentacontrollers.js
const mongoose = require("mongoose");
const PDFDocument = require("pdfkit");
const Paciente = require("../models/pacientes");
const Usuario  = require("../models/usuarios");
const Modulo   = require("../models/modulos");
const Area     = require("../models/area");
const Movimiento = require("../models/estadoDeCuentaMovimiento");

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

function getPrecioModulo(mod) {
  const cands = ["precio", "valor", "monto", "arancel", "importe", "tarifa"];
  for (const k of cands) {
    const v = mod?.[k];
    if (typeof v === "number") return v;
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
  const modAsig = Array.isArray(paciente.modulosAsignados) ? paciente.modulosAsignados : [];
  const list = modAsig.filter(m => {
    const a = m.areaId || m.area;
    if (!areaId) return true;
    if (!a) return false;
    return String(a) === String(areaId) || String(a?._id) === String(areaId);
  });

  const moduloIds = list.map(m => String(m.moduloId)).filter(Boolean);
  const profIds = [];
  for (const m of list) {
    const arr = Array.isArray(m.profesionales) ? m.profesionales
              : Array.isArray(m.coordinadoresExternos) ? m.coordinadoresExternos
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

  return list.map(item => {
    const modDoc = modById.get(String(item.moduloId)) || {};
    const numero = modDoc.numero ?? modDoc.codigo ?? modDoc.nombre ?? "—";
    const valorModulo = getPrecioModulo(modDoc);
    const cant = parseCantidad(item.cantidad ?? 1);
    const aPagar = Number((valorModulo * cant).toFixed(2));

    const roles = { profesional: [], coordinador: [], pasante: [], directora: [] };
    const listaProf = Array.isArray(item.profesionales)
      ? item.profesionales
      : Array.isArray(item.coordinadoresExternos)
      ? item.coordinadoresExternos
      : [];

    for (const pr of listaProf) {
      const u = userById.get(String(pr.profesionalId || pr.usuario || pr.usuarioId || pr._id));
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
    if (!paciente) return res.status(404).json({ error: "Paciente no encontrado" });

    const tieneOS = /obra social/i.test(paciente.condicionDePago || "");

    const filas = await buildFilasArea(paciente, areaId);

    const whereMov = {
      dni,
      ...(areaId ? { areaId: new mongoose.Types.ObjectId(areaId) } : {}),
      ...(period ? { period } : {}),
    };
    const movs = await Movimiento.find(whereMov).sort({ fecha: 1 }).lean();

    let pagadoOS = 0, pagadoPART = 0, cargos = 0, ajustesMas = 0, ajustesMenos = 0;
    for (const m of movs) {
      if (m.tipo === "OS") pagadoOS += m.monto;
      else if (m.tipo === "PART") pagadoPART += m.monto;
      else if (m.tipo === "CARGO") cargos += m.monto;
      else if (m.tipo === "AJUSTE+") ajustesMas += m.monto;
      else if (m.tipo === "AJUSTE-") ajustesMenos += m.monto;
    }

    if (!tieneOS) pagadoOS = 0;

    const totalAPagar = filas.reduce((s, f) => s + f.aPagar, 0);
    const totalPagado = pagadoOS + pagadoPART + ajustesMas - ajustesMenos;
    const saldo = Number((totalAPagar + cargos - totalPagado).toFixed(2));
    const estado = saldo <= 0 ? "PAGADO" : "PENDIENTE";

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
      totales: { aPagar: totalAPagar, pagadoOS, pagadoPART, cargos, ajustesMas, ajustesMenos, saldo, estado },
      movimientos: movs,
    });
  } catch (err) {
    console.error("estado-de-cuenta GET:", err);
    res.status(500).json({ error: "Error al obtener estado de cuenta" });
  }
};

// ----------------- POST /api/estado-de-cuenta/:dni/movimientos -----------------
const crearMovimiento = async (req, res) => {
  try {
    const dni = toStr(req.params.dni).trim();
    const paciente = await Paciente.findOne({ dni }).select("_id dni condicionDePago").lean();
    if (!paciente) return res.status(404).json({ error: "Paciente no encontrado" });

    const tieneOS = /obra social/i.test(paciente.condicionDePago || "");
    const { tipo, areaId, monto } = req.body || {};

    if (!areaId) return res.status(400).json({ error: "areaId es obligatorio" });
    if (typeof monto !== "number") return res.status(400).json({ error: "monto numérico es obligatorio" });

    if (tipo === "OS" && !tieneOS)
      return res.status(400).json({ error: "El paciente no tiene obra social. No se puede registrar pago OS." });

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

// ----------------- GET /api/estado-de-cuenta/:dni/extracto?areaId=... -----------------
async function generarExtractoPDF(req, res) {
  try {
    const dni = toStr(req.params.dni).trim();
    const areaId = toStr(req.query.areaId || "");
    const period = req.query.period ? toStr(req.query.period) : null;
    if (!areaId) return res.status(400).json({ error: "areaId es obligatorio" });

    const paciente = await Paciente.findOne({ dni }).lean();
    if (!paciente) return res.status(404).json({ error: "Paciente no encontrado" });
    const area = await Area.findById(areaId).lean();
    if (!area) return res.status(404).json({ error: "Área no encontrada" });

    const filas = await buildFilasArea(paciente, areaId);
    const movs = await Movimiento.find({
      dni, areaId,
      ...(period ? { period } : {})
    }).sort({ fecha: 1 }).lean();

    let pagadoOS = 0, pagadoPART = 0, cargos = 0, ajustesMas = 0, ajustesMenos = 0;
    for (const m of movs) {
      if (m.tipo === "OS") pagadoOS += m.monto;
      else if (m.tipo === "PART") pagadoPART += m.monto;
      else if (m.tipo === "CARGO") cargos += m.monto;
      else if (m.tipo === "AJUSTE+") ajustesMas += m.monto;
      else if (m.tipo === "AJUSTE-") ajustesMenos += m.monto;
    }

    const totalAPagar = filas.reduce((s, f) => s + f.aPagar, 0);
    const totalPagado = pagadoOS + pagadoPART + ajustesMas - ajustesMenos;
    const saldo = Number((totalAPagar + cargos - totalPagado).toFixed(2));
    const tieneOS = /obra social/i.test(paciente.condicionDePago || "");

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition",
      `inline; filename="Extracto_${dni}_${(area.nombre || "area").replace(/\s+/g,"_")}${period ? "_" + period : ""}.pdf"`);

    const doc = new PDFDocument({ margin: 40 });
    doc.pipe(res);

    // Header
    doc.fontSize(16).text("Clínica de Desarrollo Pilar", { align: "left" });
    doc.moveDown(0.2);
    doc.fontSize(12).fillColor("#666").text("Informe de estado de cuenta", { align: "left" });
    doc.moveDown();

    // Paciente
    doc.fillColor("#000").fontSize(13)
      .text(`${paciente.nombre || "-" } - DNI ${paciente.dni || "-"}`);
    doc.moveDown(0.2);
    doc.fontSize(11)
      .text(`Abonado: ${paciente.condicionDePago || "-" }   |   Estado: ${paciente.estado || "-" }`);
    if (period) doc.text(`Periodo: ${period}`);
    doc.moveDown(0.6);

    // Área
    doc.fontSize(12).fillColor("#000").text((area.nombre || "").toUpperCase(), { underline: true });
    doc.moveDown(0.3);

    // Tabla simple
    const colx = [40, 100, 160, 310, 430, 520]; // posiciones x
    const th = ["MES", "MÓDULO", "CANT.", "PROFESIONAL", "VALOR", "A PAGAR"];
    doc.fontSize(10).fillColor("#333");
    th.forEach((t, i) => doc.text(t, colx[i], doc.y, { continued: i < th.length - 1 }));
    doc.moveDown(0.2);
    doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor("#ccc").stroke();
    doc.moveDown(0.2);

    filas.forEach(f => {
      const profesional =
        (f.profesionales.profesional[0] ||
         f.profesionales.coordinador[0] ||
         f.profesionales.pasante[0] ||
         f.profesionales.directora[0] ||
         "-");
      const valor = `$ ${f.valorModulo.toLocaleString("es-AR")}`;
      const ap = `$ ${f.aPagar.toLocaleString("es-AR")}`;
      const row = [
        f.mes || "-",
        String(f.moduloNumero ?? "-"),
        String(f.cant),
        profesional,
        valor,
        ap
      ];
      row.forEach((t, i) => doc.text(t, colx[i], doc.y, { continued: i < row.length - 1 }));
      doc.moveDown(0.15);
    });

    doc.moveDown(0.5);
    doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor("#ccc").stroke();
    doc.moveDown(0.4);

    // Totales
    doc.fontSize(11).fillColor("#000")
      .text(`Total a pagar: $ ${totalAPagar.toLocaleString("es-AR")}`);
    doc.text(`Cargos: $ ${cargos.toLocaleString("es-AR")}`);
    if (tieneOS) doc.text(`Pago Obra Social: $ ${pagadoOS.toLocaleString("es-AR")}`);
    doc.text(`Pago Particular: $ ${pagadoPART.toLocaleString("es-AR")}`);
    if (ajustesMas || ajustesMenos)
      doc.text(`Ajustes: +$${ajustesMas.toLocaleString("es-AR")} / -$${ajustesMenos.toLocaleString("es-AR")}`);
    doc.text(`Saldo: $ ${saldo.toLocaleString("es-AR")}`);

    doc.moveDown(1);
    const leyendaOK = saldo <= 0
      ? `Informamos que, al día de la fecha, la cuenta del área de ${area.nombre} no registra deuda pendiente.`
      : `Informamos que, al día de la fecha, la cuenta del área de ${area.nombre} registra un saldo pendiente de $ ${saldo.toLocaleString("es-AR")}.`;
    doc.fontSize(9).fillColor("#666").text("OBSERVACIONES:", { underline: true });
    doc.moveDown(0.2);
    doc.text(leyendaOK, { align: "justify" });

    doc.end();
  } catch (err) {
    console.error("estado-de-cuenta PDF:", err);
    res.status(500).json({ error: "No se pudo generar el PDF" });
  }
}

module.exports = {
  obtenerEstadoDeCuenta,
  crearMovimiento,
  eliminarMovimiento,
  generarExtractoPDF,
  // exporto helpers si los necesitás en tests:
  __test__: { buildFilasArea, parseCantidad, getPrecioModulo }
};

