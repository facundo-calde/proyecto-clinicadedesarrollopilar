const express = require("express");
const router = express.Router();
const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });

const {
  agregarDocumento,
  obtenerDocumentos,
  eliminarDocumento
} = require("../controllers/documentoscontrollers");

// tipo = "pacientes" o "usuarios"
// id = dni (pacientes) o _id (usuarios)

router.get("/:tipo/:id", obtenerDocumentos);
router.post("/:tipo/:id", upload.single("archivo"), agregarDocumento);
router.delete("/:tipo/:id/:index", eliminarDocumento);

module.exports = router;
