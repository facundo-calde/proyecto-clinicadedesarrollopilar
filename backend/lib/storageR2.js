// lib/storageR2.js
const { PutObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { s3, buckets } = require("./r2Client");

const buildURL = (bucket, key) => `${process.env.R2_ENDPOINT}/${bucket}/${key}`;

async function uploadBuffer({ bucket, key, buffer, contentType }) {
  try {
    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType
    }));
    return buildURL(bucket, key);
  } catch (e) {
    console.error("R2 upload error:", {
      bucket, key, name: e.name, message: e.message, status: e.$metadata?.httpStatusCode
    });
    throw e;
  }
}

async function deleteKey({ bucket, key }) {
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  } catch (e) {
    console.error("R2 delete error:", { bucket, key, name: e.name, message: e.message });
    throw e;
  }
}

module.exports = { uploadBuffer, deleteKey, buildURL, buckets };
