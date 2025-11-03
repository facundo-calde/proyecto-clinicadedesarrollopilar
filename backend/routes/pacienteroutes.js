// backend/routes/pacientesroutes.js
const express = require('express');
const router = express.Router();

const {
  // Lectura / CRUD base
  listarPacientes,
  buscarPaciente,
  obtenerPorDNI,
  crearPaciente,
  actualizarPaciente,

  // Documentos personales (metadata R2)
  agregarDocumento,
  actualizarDocumento,
  eliminarDocumento,

  // Diagnósticos (metadata R2)
  agregarDiagnostico,
  actualizarDiagnostico,
  eliminarDiagnostico
} = require('../controllers/pacientescontrollers');

// 🔧 IMPORT CORRECTO (plural + C mayúscula)
const { authMiddleware } = require('../controllers/usuariosControllers');

// ─────────────────────────────────────────────
// Rutas de lectura (no requieren token)
// ─────────────────────────────────────────────

// Listado inicial (ej: /api/pacientes?limit=20&sort=nombre|created)
router.get('/', listarPacientes);

// Búsqueda explícita por nombre/dni (ej: /api/pacientes/buscar?nombre=juan)
router.get('/buscar', buscarPaciente);

// Obtener un paciente por DNI (poner después de /buscar para no colisionar)
router.get('/:dni', obtenerPorDNI);

// ─────────────────────────────────────────────
// Rutas de escritura (requieren token)
// ─────────────────────────────────────────────

// Crear/actualizar paciente
router.post('/', authMiddleware, crearPaciente);
router.put('/:dni', authMiddleware, actualizarPaciente);

// ─────────────────────────────────────────────
// Documentos personales (metadata, NO archivos binarios)
// Frontend sube a R2 (Worker) y acá solo se persiste/elimina metadata.
// Endpoints aceptan JSON: { fecha, tipo, observaciones, archivoKey, archivoURL }
// ─────────────────────────────────────────────
router.post('/:dni/documentos', authMiddleware, agregarDocumento);

// Actualiza por id, y si no hay :id permite fallback con ?index=#
// (el controlador maneja ambos casos)
router.put('/:dni/documentos/:id?', authMiddleware, actualizarDocumento);

// Elimina por id, y si no hay :id permite fallback con ?index=#
router.delete('/:dni/documentos/:id?', authMiddleware, eliminarDocumento);

// ─────────────────────────────────────────────
// Diagnósticos (informes) – misma lógica que Documentos
// JSON: { fecha, area, observaciones, archivoKey, archivoURL }
// ─────────────────────────────────────────────
router.post('/:dni/diagnosticos', authMiddleware, agregarDiagnostico);
router.put('/:dni/diagnosticos/:id?', authMiddleware, actualizarDiagnostico);
router.delete('/:dni/diagnosticos/:id?', authMiddleware, eliminarDiagnostico);

module.exports = router;
