export default {
  async fetch(req, env) {
    // CORS básico
    if (req.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET,PUT,POST,OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type,Authorization",
        },
      });
    }

    if (req.method !== "PUT" && req.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const url = new URL(req.url);
    const parts = url.pathname.split("/").filter(Boolean);

    if (parts.length < 2) {
      return new Response("Formato de URL inválido. Usa /usuarios/<key> o /pacientes/<key>", { status: 400 });
    }

    const bucketName = parts[0];
    const key = parts.slice(1).join("/");

    const ct = req.headers.get("content-type") || "application/octet-stream";
    const body = await req.arrayBuffer();

    let bucket;
    if (bucketName === "usuarios") bucket = env.R2_USUARIOS;
    else if (bucketName === "pacientes") bucket = env.R2_PACIENTES;
    else return new Response("Bucket inválido", { status: 400 });

    await bucket.put(key, body, { httpMetadata: { contentType: ct } });

    return new Response(JSON.stringify({ bucket: bucketName, key }), {
      status: 200,
      headers: { "content-type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  },
};
