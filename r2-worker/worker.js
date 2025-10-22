export default {
  async fetch(request, env) {
    const cors = {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,HEAD,PUT,DELETE,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    };
    if (request.method === "OPTIONS") return new Response(null, cors);

    const url = new URL(request.url);
    const parts = url.pathname.replace(/^\/+/, "").split("/");
    const bucketSeg = (parts.shift() || "").toLowerCase();
    const key = decodeURIComponent(parts.join("/"));
    if (!bucketSeg || !key) return new Response("Falta bucket o key", { status: 400, ...cors });

    const map = { usuarios: env.R2_USUARIOS, pacientes: env.R2_PACIENTES };
    const bucket = map[bucketSeg];
    if (!bucket) return new Response("Bucket inválido", { status: 404, ...cors });

    try {
      switch (request.method) {
        case "GET": {
          const obj = await bucket.get(key);
          if (!obj) return new Response("No encontrado", { status: 404, ...cors });

          const headers = new Headers(cors.headers);
          const ct =
            obj.httpMetadata?.contentType ||
            obj.customMetadata?.contentType ||
            "application/octet-stream";
          headers.set("Content-Type", ct);
          headers.set("Cache-Control", "public, max-age=31536000, immutable");
          if (obj.size != null) headers.set("Content-Length", String(obj.size));

          return new Response(obj.body, { status: 200, headers });
        }

        case "HEAD": {
          const obj = await bucket.head(key); // solo metadatos
          if (!obj) return new Response("No encontrado", { status: 404, ...cors });

          const headers = new Headers(cors.headers);
          const ct =
            obj.httpMetadata?.contentType ||
            obj.customMetadata?.contentType ||
            "application/octet-stream";
          headers.set("Content-Type", ct);
          headers.set("Cache-Control", "public, max-age=31536000, immutable");
          if (obj.size != null) headers.set("Content-Length", String(obj.size));

          return new Response(null, { status: 200, headers });
        }

        case "PUT": {
          const ct = request.headers.get("content-type") || "application/octet-stream";
          const r = await bucket.put(key, request.body, { httpMetadata: { contentType: ct } });
          return new Response(JSON.stringify({ ok: true, key, version: r?.version }), {
            status: 200,
            headers: { ...cors.headers, "Content-Type": "application/json" },
          });
        }

        case "DELETE": {
          await bucket.delete(key);
          return new Response(null, { status: 204, ...cors });
        }

        default:
          return new Response("Método no permitido", { status: 405, ...cors });
      }
    } catch (e) {
      return new Response(`Error: ${e?.message || e}`, { status: 500, ...cors });
    }
  },
};

