// routes/cajasroutes.js
const express = require("express");
const router = express.Router();

const mongoose = require("mongoose");
const Caja = require("../models/cajas");
const CajaMovimiento = require("../models/cajaMovimiento");

// ========================================
// GET /api/cajas -> todas las cajas con área y saldo
// (ESTO YA LO TENÍAS Y ANDABA)
// ========================================
router.get("/", async (req, res) => {
  try {
    const cajas = await Caja.find({})
      .populate("area", "nombre") // opcional
      .sort({ nombreArea: 1 })
      .lean();

    res.json(cajas);
  } catch (err) {
    console.error("GET /api/cajas:", err);
    res.status(500).json({ error: "No se pudieron obtener las cajas" });
  }
});

// ========================================
// GET /api/cajas/:cajaId/movimientos
// -> movimientos filtrados por mes y filtros opcionales
// ========================================
router.get("/:cajaId/movimientos", async (req, res) => {
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

    // ----- filtro por mes (YYYY-MM) -----
    if (mes) {
      const [y, m] = String(mes).split("-");
      const year = Number(y);
      const month = Number(m) - 1; // 0-based
      if (!Number.isNaN(year) && !Number.isNaN(month)) {
        const desde = new Date(year, month, 1, 0, 0, 0, 0);
        const hasta = new Date(year, month + 1, 1, 0, 0, 0, 0);
        q.fecha = { $gte: desde, $lt: hasta };
      }
    }

    // ----- filtros opcionales -----
    if (tipoMovimiento) q.tipoMovimiento = tipoMovimiento;
    if (categoria) q.categoria = categoria;
    if (formato) q.formato = formato;

    if (profesionalId && mongoose.Types.ObjectId.isValid(profesionalId)) {
      q.profesional = new mongoose.Types.ObjectId(profesionalId);
    }

    if (beneficiarioId && mongoose.Types.ObjectId.isValid(beneficiarioId)) {
      q.beneficiario = new mongoose.Types.ObjectId(beneficiarioId);
    }

    // ----- buscar movimientos -----
    const movimientos = await CajaMovimiento.find(q)
      .sort({ fecha: -1, createdAt: -1 })
      .lean();

    res.json(movimientos);
  } catch (err) {
    console.error("GET /api/cajas/:cajaId/movimientos:", err);
    res
      .status(500)
      .json({ error: "No se pudieron obtener los movimientos de caja" });
  }
});

module.exports = router;
