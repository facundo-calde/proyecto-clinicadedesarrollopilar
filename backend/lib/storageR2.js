// backend/lib/storageR2.js
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const fetch = global.fetch || require("node-fetch"); // para Node <18

const endpoint = process.env.R2_ENDPOINT;          // puede ser workers.dev o cloudflarestorage
const workerURL = process.env.R2_WORKER_URL || ""; // si está, usamos Worker para PUT/DELETE
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

const buckets = {
  pacientes: process.env.R2_BUCKET_PACIENTES,
  usuarios:  process.env.R2_BUCKET_USUARIOS,
};

// Cliente S3 solo si NO usamos Worker
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

// mapear nombre REAL de bucket -> segmento de ruta que espera el Worker
function toRouteSegment(bucketName) {
  if (bucketName === buckets.usuarios)  return "usuarios";
  if (bucketName === buckets.pacientes) return "pacientes";
  return bucketName; // fallback
}

// URL “interna” para guardar en DB y después poder borrar fácil
function makeInternalUrl(bucket, key) {
  return `https://r2.internal/${bucket}/${key}`;
}

/**
 * Convierte URL interna (https://r2.internal/<bucket>/<key>)
 * a URL de visualización vía Worker (si R2_WORKER_URL está seteada).
 */
function toWorkerViewUrl(internalUrl) {
  try {
    if (!workerURL) return internalUrl;
    if (!internalUrl?.startsWith("https://r2.internal/")) return internalUrl;

    const rest = internalUrl.slice("https://r2.internal/".length);
    const slash = rest.indexOf("/");
    if (slash === -1) return internalUrl;

    const bucket = rest.slice(0, slash);
    const key = rest.slice(slash + 1);

    let seg = bucket;
    if (bucket === buckets.usuarios)  seg = "usuarios";
    if (bucket === buckets.pacientes) seg = "pacientes";

    return `${workerURL.replace(/\/+$/,"")}/${seg}/${encodeURIComponent(key)}`;
  } catch {
    return internalUrl;
  }
}

/**
 * Sube un buffer a R2.
 * - Si hay R2_WORKER_URL => usa el Worker (PUT).
 * - Si no hay => usa SDK S3 directo.
 * Devuelve string estilo https://r2.internal/<bucket>/<key>
 */
async function uploadBuffer({ bucket, key, buffer, contentType }) {
  if (!bucket || !key) throw new Error("uploadBuffer: falta bucket o key");

  if (workerURL) {
    const seg = toRouteSegment(bucket);
    const url = `${workerURL.replace(/\/+$/,"")}/${seg}/${encodeURIComponent(key)}`;
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
 * - Si hay R2_WORKER_URL => DELETE al Worker (si tu Worker soporta DELETE).
 * - Si no hay => SDK S3 DeleteObject.
 */
async function deleteKey({ bucket, key }) {
  if (!bucket || !key) return;

  if (workerURL) {
    const seg = toRouteSegment(bucket);
    const url = `${workerURL.replace(/\/+$/,"")}/${seg}/${encodeURIComponent(key)}`;
    const r = await fetch(url, { method: "DELETE" });
    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      throw new Error(`Worker DELETE ${r.status} ${txt}`);
    }
    return;
  }

  await (s3?.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })) || Promise.resolve());
}

module.exports = { uploadBuffer, deleteKey, buckets, toWorkerViewUrl };
