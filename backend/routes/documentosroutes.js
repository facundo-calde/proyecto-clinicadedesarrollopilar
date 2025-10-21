const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() }); // archivos en memoria (buffer)

const {
  agregarDocumento,
  obtenerDocumentos,
  eliminarDocumento
} = require('../controllers/documentoscontrollers');

// Agregar documento con archivo
// Se espera: req.file (archivo) + req.body (fecha, tipo, observaciones)
router.post('/:dni', upload.single("archivo"), agregarDocumento);

// Obtener documentos
router.get('/:dni', obtenerDocumentos);

// Eliminar documento por índice
router.delete('/:dni/:index', eliminarDocumento);

module.exports = router;
