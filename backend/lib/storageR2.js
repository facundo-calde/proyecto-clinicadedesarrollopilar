// lib/storageR2.js
const { PutObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { s3, buckets } = require("./r2Client");

// 🔗 Construir URL de archivo en R2
const buildURL = (bucket, key) =>
  `${process.env.R2_ENDPOINT}/${bucket}/${key}`;

// 📤 Subir archivo (buffer) a un bucket
async function uploadBuffer({ bucket, key, buffer, contentType }) {
  await s3.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: buffer,
    ContentType: contentType
  }));
  return buildURL(bucket, key);
}

// 🗑️ Borrar archivo de un bucket
async function deleteKey({ bucket, key }) {
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

module.exports = {
  uploadBuffer,
  deleteKey,
  buildURL,
  buckets // 👈 Exporta los nombres de buckets (pacientes, usuarios) para usarlos en controladores
};
