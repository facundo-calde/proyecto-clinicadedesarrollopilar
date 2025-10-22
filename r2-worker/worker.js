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
    const ct = req.headers.get("content-type") || "application/octet-stream";

    const bucket =
      bucketName === "usuarios" ? env.R2_USUARIOS :
      bucketName === "pacientes" ? env.R2_PACIENTES : null;

    if (!bucket) return new Response("Bucket inválido", { status: 400 });

    if (req.method === "PUT" || req.method === "POST") {
      const body = await req.arrayBuffer();
      await bucket.put(key, body, { httpMetadata: { contentType: ct } });
      return new Response(JSON.stringify({ bucket: bucketName, key }), { status: 200, headers: { "content-type": "application/json", "Access-Control-Allow-Origin": "*" } });
    }

    if (req.method === "DELETE") {
      await bucket.delete(key);
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json", "Access-Control-Allow-Origin": "*" } });
    }

    return new Response("Method not allowed", { status: 405 });
  },
};
