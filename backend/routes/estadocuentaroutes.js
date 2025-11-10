// routes/estadocuentaroutes.js
const express = require("express");
const router = express.Router();

const {
  obtenerEstadoDeCuenta,
  crearMovimiento,
  eliminarMovimiento,
  generarExtractoPDF,
} = require("../controllers/estadocuentacontrollers");

// Job manual para cargos mensuales
const { generarCargosDelMes } = require("../jobs/generarCargos");

// Estado general por paciente/área (opcional ?areaId=...&period=YYYY-MM)
router.get("/:dni", obtenerEstadoDeCuenta);

// Registrar nuevo movimiento (pago, ajuste, factura, etc.)
router.post("/:dni/movimientos", crearMovimiento);

// Eliminar movimiento por ID
router.delete("/movimientos/:movId", eliminarMovimiento);

// Generar PDF de extracto por área (opcional ?period=YYYY-MM)
router.get("/:dni/extracto", generarExtractoPDF);

// Forzar generación de cargos del mes (opcional body { period: "YYYY-MM" })
router.post("/generar-cargos", async (req, res) => {
  try {
    const { period } = req.body || {};
    const r = await generarCargosDelMes(period);
    res.json({ ok: true, ...r });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "No se pudieron generar cargos" });
  }
});

module.exports = router;
