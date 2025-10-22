// backend/lib/storageR2.js
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const fetch = global.fetch || require("node-fetch"); // Node <18

const endpoint = process.env.R2_ENDPOINT;               // puede ser Workers.dev o cloudflarestorage
const workerURL = process.env.R2_WORKER_URL || "";      // si está, usamos Worker para PUT/DELETE
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

const buckets = {
  pacientes: process.env.R2_BUCKET_PACIENTES,
  usuarios:  process.env.R2_BUCKET_USUARIOS,
};

// ——— Cliente S3 (solo se usa si NO hay Worker) ———
let s3 = null;
if (!workerURL) {
  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error("Faltan variables de R2 (R2_ENDPOINT / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY)");
  }
  s3 = new S3Client({
    region: "auto",
    endpoint,
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
  });
}

// Normalizamos un “URL” interno para guardar en DB y poder extraer la key fácil después.
function makeInternalUrl(bucket, key) {
  // No tiene por qué ser público; solo lo guardamos para después borrar.
  return `https://r2.internal/${bucket}/${key}`;
}

/**
 * Sube un buffer a R2.
 * - Si hay R2_WORKER_URL => usa el Worker (PUT).
 * - Si no hay => usa SDK S3 directo.
 * Devuelve un string “url” (interna) con el patrón https://r2.internal/<bucket>/<key>
 */
async function uploadBuffer({ bucket, key, buffer, contentType }) {
  if (!bucket || !key) throw new Error("uploadBuffer: falta bucket o key");

  // Vía Worker
  if (workerURL) {
    const url = `${workerURL.replace(/\/+$/,"")}/${bucket}/${encodeURIComponent(key)}`;
    const r = await fetch(url, {
      method: "PUT",
      headers: { "content-type": contentType || "application/octet-stream" },
      body: buffer,
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      throw new Error(`Worker PUT ${r.status} ${txt}`);
    }
    return makeInternalUrl(bucket, key);
  }

  // Vía SDK S3 (Cloudflare R2 directo)
  await s3.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: buffer,
    ContentType: contentType || "application/octet-stream",
  }));
  return makeInternalUrl(bucket, key);
}

/**
 * Borra un objeto en R2.
 * - Si hay R2_WORKER_URL => DELETE al Worker.
 * - Si no hay => SDK S3 DeleteObject.
 */
async function deleteKey({ bucket, key }) {
  if (!bucket || !key) return;

  if (workerURL) {
    const url = `${workerURL.replace(/\/+$/,"")}/${bucket}/${encodeURIComponent(key)}`;
    const r = await fetch(url, { method: "DELETE" });
    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      throw new Error(`Worker DELETE ${r.status} ${txt}`);
    }
    return;
  }

  await (s3?.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })) || Promise.resolve());
}

module.exports = { uploadBuffer, deleteKey, buckets };
