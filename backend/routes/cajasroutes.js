// routes/cajasroutes.js
const express = require("express");
const router = express.Router();
const {
  listarCajas,
  listarMovimientosCaja,
} = require("../controllers/cajascontrollers");
const authMiddleware = require("../middleware/authMiddleware"); // el mismo que usás en el resto

// Todas las rutas de caja protegidas
router.get("/cajas", authMiddleware, listarCajas);
router.get("/cajas/:cajaId/movimientos", authMiddleware, listarMovimientosCaja);

module.exports = router;
