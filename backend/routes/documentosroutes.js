const express = require('express');
const router = express.Router();
const {
  agregarDocumento,
  obtenerDocumentos,
  eliminarDocumento
} = require('../controllers/documentoscontrollers');

// Agregar documento
router.post('/:dni', agregarDocumento);

// Obtener documentos
router.get('/:dni', obtenerDocumentos);

// Eliminar documento por índice
router.delete('/:dni/:index', eliminarDocumento);

module.exports = router;
