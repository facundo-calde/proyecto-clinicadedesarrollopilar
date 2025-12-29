// controllers/cajascontrollers.js
const mongoose = require("mongoose");
const Caja = require("../models/cajas");
const CajaMovimiento = require("../models/cajaMovimiento");

// 👉 GET /api/cajas
// Lista todas las cajas con sus saldos
const listarCajas = async (req, res) => {
  try {
    const cajas = await Caja.find().lean().sort({ nombreArea: 1 });
    res.json(cajas);
  } catch (err) {
    console.error("Error al listar cajas:", err);
    res.status(500).json({ error: "No se pudieron obtener las cajas" });
  }
};

// 👉 GET /api/cajas/:cajaId/movimientos
// Devuelve los movimientos de una caja, aplicando filtros opcionales
const listarMovimientosCaja = async (req, res) => {
  try {
    const { cajaId } = req.params;
    const {
      mes,               // YYYY-MM
      tipoMovimiento,    // INGRESO / EGRESO
      categoria,         // PADRES / OS / AMBOS / MANUAL
      formato,           // EFECTIVO / TRANSFERENCIA / MP / OTRO
      profesionalId,
      beneficiarioId,
    } = req.query;

    if (!mongoose.Types.ObjectId.isValid(cajaId)) {
      return res.status(400).json({ error: "cajaId inválido" });
    }

    const q = { caja: new mongoose.Types.ObjectId(cajaId) };

    // Filtro por mes (YYYY-MM → rango de fecha)
    if (mes) {
      const [y, m] = mes.split("-");
      const year = Number(y);
      const month = Number(m) - 1; // 0-11
      if (!Number.isNaN(year) && !Number.isNaN(month)) {
        const desde = new Date(year, month, 1, 0, 0, 0, 0);
        const hasta = new Date(year, month + 1, 1, 0, 0, 0, 0);
        q.fecha = { $gte: desde, $lt: hasta };
      }
    }

    if (tipoMovimiento) q.tipoMovimiento = tipoMovimiento;
    if (categoria) q.categoria = categoria;
    if (formato) q.formato = formato;
    if (profesionalId && mongoose.Types.ObjectId.isValid(profesionalId)) {
      q.profesional = new mongoose.Types.ObjectId(profesionalId);
    }
    if (beneficiarioId && mongoose.Types.ObjectId.isValid(beneficiarioId)) {
      q.beneficiario = new mongoose.Types.ObjectId(beneficiarioId);
    }

    const movimientos = await CajaMovimiento.find(q)
      .sort({ fecha: -1, createdAt: -1 })
      .lean();

    res.json(movimientos);
  } catch (err) {
    console.error("Error al listar movimientos de caja:", err);
    res
      .status(500)
      .json({ error: "No se pudieron obtener los movimientos de caja" });
  }
};

module.exports = {
  listarCajas,
  listarMovimientosCaja,
};
