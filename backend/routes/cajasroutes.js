const express = require("express");
const router = express.Router();
const Caja = require("../models/cajas");

// GET /api/cajas -> todas las cajas con área y saldo
router.get("/", async (req, res) => {
  try {
    const cajas = await Caja.find({})
      .populate("area", "nombre")  // opcional
      .sort({ nombreArea: 1 })
      .lean();

    res.json(cajas);
  } catch (err) {
    console.error("GET /api/cajas:", err);
    res.status(500).json({ error: "No se pudieron obtener las cajas" });
  }
});

module.exports = router;
