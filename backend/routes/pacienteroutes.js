// backend/routes/pacientesroutes.js
const express = require('express');
const router = express.Router();

const {
  listarPacientes,   // ← nuevo
  buscarPaciente,
  obtenerPorDNI,
  crearPaciente,
  actualizarPaciente
} = require('../controllers/pacientescontrollers');

// 🔧 IMPORT CORRECTO (plural + C mayúscula)
const { authMiddleware } = require('../controllers/usuariosControllers');

// ─────────────────────────────────────────────
// Rutas de lectura
// ─────────────────────────────────────────────

// Listado inicial (con ?limit=20, etc.)
router.get('/', listarPacientes);

// Búsqueda explícita por nombre/dni (ej: /api/pacientes/buscar?nombre=juan)
router.get('/buscar', buscarPaciente);

// Obtener por DNI
router.get('/:dni', obtenerPorDNI);

// ─────────────────────────────────────────────
// Escrituras (requieren token)
// ─────────────────────────────────────────────
router.post('/', authMiddleware, crearPaciente);
router.put('/:dni', authMiddleware, actualizarPaciente);

module.exports = router;

