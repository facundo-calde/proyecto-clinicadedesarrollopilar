// routes/estadocuentaroutes.js
const express = require("express");
const router = express.Router();

const {
  obtenerEstadoDeCuenta,
  actualizarEstadoDeCuenta,   // 👈 agregado
  crearMovimiento,
  eliminarMovimiento,
  generarExtractoPDF,
  getPorDni, // si no lo usás, eliminá esta línea y la ruta GET /:dni/movimientos
} = require("../controllers/estadocuentacontrollers");

const { generarCargosDelMes } = require("../jobs/generarCargos");

// Rutas específicas ANTES de "/:dni"

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

// PDF por área (opcional ?period=YYYY-MM)
router.get("/:dni/extracto", generarExtractoPDF);

// (Opcional) Listar movimientos por DNI (?areaId=...)
router.get("/:dni/movimientos", getPorDni);

// Registrar nuevo movimiento (pago, ajuste, etc.)
router.post("/:dni/movimientos", crearMovimiento);

// Eliminar movimiento por ID
router.delete("/movimientos/:movId", eliminarMovimiento);

// ✅ Actualizar estado de cuenta (líneas + facturas)
router.put("/:dni", actualizarEstadoDeCuenta);

// Estado general por paciente/área (?areaId=...&period=YYYY-MM)
router.get("/:dni", obtenerEstadoDeCuenta);

module.exports = router;
