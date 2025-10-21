// backend/controllers/documentoscontrollers.js
const Paciente = require("../models/pacientes");
const Usuario  = require("../models/usuarios");
const { uploadBuffer, deleteKey, buckets } = require("../lib/storageR2");

// Helpers
function getModelAndBucket(tipo) {
  if (tipo === "pacientes") {
    return { Model: Paciente, bucket: buckets.pacientes, field: "documentosPersonales" };
  }
  if (tipo === "usuarios") {
    return { Model: Usuario, bucket: buckets.usuarios, field: "documentos" };
  }
  throw new Error("Tipo no soportado");
}

// =============================
// GET documentos
// =============================
const obtenerDocumentos = async (req, res) => {
  try {
    const { tipo, id } = req.params;
    const { Model, field } = getModelAndBucket(tipo);

    const entidad = await Model.findOne(tipo === "pacientes" ? { dni: id } : { _id: id });
    if (!entidad) return res.status(404).json({ error: `${tipo} no encontrado` });

    res.json(entidad[field] || []);
  } catch (err) {
    console.error("Error al obtener documentos:", err);
    res.status(500).json({ error: "Error al obtener documentos" });
  }
};

// =============================
// POST documento (con archivo)
// =============================
const agregarDocumento = async (req, res) => {
  try {
    const { tipo, id } = req.params;
    const { fecha, tipo: tipoDoc, observaciones } = req.body;
    const file = req.file;

    if (!file) return res.status(400).json({ error: "Archivo requerido" });

    const { Model, bucket, field } = getModelAndBucket(tipo);
    const entidad = await Model.findOne(tipo === "pacientes" ? { dni: id } : { _id: id });
    if (!entidad) return res.status(404).json({ error: `${tipo} no encontrado` });

    const key = `${id}/${Date.now()}_${file.originalname}`;
    const archivoURL = await uploadBuffer({
      bucket,
      key,
      buffer: file.buffer,
      contentType: file.mimetype
    });

    entidad[field] = entidad[field] || [];
    entidad[field].push({ fecha, tipo: tipoDoc, observaciones, archivoURL });
    await entidad.save();

    res.status(201).json(entidad[field]);
  } catch (err) {
    console.error("Error al agregar documento:", err);
    res.status(500).json({ error: "Error al agregar documento" });
  }
};

// =============================
// DELETE documento
// =============================
const eliminarDocumento = async (req, res) => {
  try {
    const { tipo, id, index } = req.params;
    const { Model, bucket, field } = getModelAndBucket(tipo);

    const entidad = await Model.findOne(tipo === "pacientes" ? { dni: id } : { _id: id });
    if (!entidad) return res.status(404).json({ error: `${tipo} no encontrado` });

    const i = Number(index);
    const lista = entidad[field] || [];
    const doc = lista[i];
    if (!doc) return res.status(404).json({ error: "Documento no encontrado" });

    if (doc.archivoURL) {
      const pivot = `/${bucket}/`;
      const pos = doc.archivoURL.indexOf(pivot);
      if (pos !== -1) {
        const key = doc.archivoURL.slice(pos + pivot.length);
        if (key) await deleteKey({ bucket, key });
      }
    }

    lista.splice(i, 1);
    entidad[field] = lista;
    await entidad.save();

    res.json({ ok: true });
  } catch (err) {
    console.error("Error al eliminar documento:", err);
    res.status(500).json({ error: "Error al eliminar documento" });
  }
};

module.exports = {
  obtenerDocumentos,
  agregarDocumento,
  eliminarDocumento
};
