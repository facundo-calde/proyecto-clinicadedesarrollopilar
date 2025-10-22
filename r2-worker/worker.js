export default {
  async fetch(req, env) {
    // CORS
    if (req.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET,PUT,POST,DELETE,OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type,Authorization",
        },
      });
    }

    const url = new URL(req.url);
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length < 2) return new Response("Bad path", { status: 400 });

    const bucketName = parts[0];
    const key = decodeURIComponent(parts.slice(1).join("/"));

    let bucket;
    if (["usuarios","documentos-usuarios"].includes(bucketName)) {
      bucket = env.R2_USUARIOS;
    } else if (["pacientes","documentos-pacientes"].includes(bucketName)) {
      bucket = env.R2_PACIENTES;
    } else {
      return new Response("Bucket inválido", { status: 400 });
    }

    if (req.method === "PUT" || req.method === "POST") {
      const ct = req.headers.get("content-type") || "application/octet-stream";
      const body = await req.arrayBuffer();
      await bucket.put(key, body, { httpMetadata: { contentType: ct } });
      return new Response(JSON.stringify({ bucket: bucketName, key }), {
        status: 200, headers: { "content-type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    if (req.method === "GET") {
      const obj = await bucket.get(key);
      if (!obj) return new Response("Not found", { status: 404 });
      const headers = new Headers({
        "Access-Control-Allow-Origin": "*",
        "content-type": obj.httpMetadata?.contentType || "application/octet-stream",
        "cache-control": "private, max-age=0, no-store",
      });
      return new Response(obj.body, { status: 200, headers });
    }

    if (req.method === "DELETE") {
      await bucket.delete(key);
      return new Response(JSON.stringify({ ok: true }), {
        status: 200, headers: { "content-type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    return new Response("Method not allowed", { status: 405 });
  },
};
