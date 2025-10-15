// /js/config.js
(function (w) {
  // Ajustá si cambia tu dominio o puerto local
  const DEV_PORT   = 3000;
  const PROD_BASE  = "https://app.clinicadedesarrollopilar.com.ar";
  const DEV_HOSTS  = new Set(["localhost", "127.0.0.1", "0.0.0.0"]);
  const isDev      = DEV_HOSTS.has(location.hostname);

  // API base final SIEMPRE incluye /api
  const API_BASE = isDev ? `http://localhost:${DEV_PORT}/api`
                         : `${PROD_BASE}/api`;
  w.API_BASE = API_BASE; // por si querés usarlo a mano

  // --- Hook global a fetch: reescribe URLs de API ---
  const origFetch = w.fetch.bind(w);

  w.fetch = function (url, options) {
    try {
      // Solo strings (Request también se podría envolver, pero con esto alcanza)
      if (typeof url === "string") {
        const origin = location.origin;

        // Normalizamos todos los formatos comunes a la misma base:
        // 1) /api/xxx
        if (url.startsWith("/api/")) {
          url = API_BASE + url.slice(4); // conserva el path después de /api
        }
        // 2) http://localhost:3000/api/xxx  -> API_BASE
        else if (url.startsWith("http://localhost:3000/api/")) {
          url = API_BASE + url.slice("http://localhost:3000/api".length);
        }
        // 3) https://tu-dominio/api/xxx  -> API_BASE
        else if (url.startsWith(`${PROD_BASE}/api/`)) {
          url = API_BASE + url.slice(`${PROD_BASE}/api`.length);
        }
        // 4) ${API}/api/xxx donde API = window.location.origin
        else if (url.startsWith(origin + "/api/")) {
          url = API_BASE + url.slice((origin + "/api").length);
        }
      }

      // Agregamos token si existe (equivalente a tu fetchAuth)
      const token =
        localStorage.getItem("token") ||
        sessionStorage.getItem("token") || "";

      const opts = options ? { ...options } : {};
      const headers = new Headers(opts.headers || {});
      if (token && !headers.has("Authorization")) {
        headers.set("Authorization", `Bearer ${token}`);
      }

      // Si el body no es FormData, ponemos JSON por default cuando corresponde
      const isFormData = opts.body instanceof FormData;
      if (!isFormData && !headers.has("Content-Type") && opts.method && opts.method !== "GET") {
        headers.set("Content-Type", "application/json");
      }

      opts.headers = headers;
      opts.cache = opts.cache || "no-store";

      return origFetch(url, opts).then(async (res) => {
        if (res.status === 401) {
          // manejo centralizado de sesión
          localStorage.removeItem("token");
          localStorage.removeItem("usuario");
          // si querés redirigir:
          // location.replace("index.html");
        }
        return res;
      });
    } catch (e) {
      return origFetch(url, options);
    }
  };

  // Helper opcional por si querés usarlo
  w.apiFetch = async function apiFetch(path, options = {}) {
    const url = path.startsWith("/") ? (path.startsWith("/api/") ? path : `/api${path}`) : `/api/${path}`;
    const res = await w.fetch(url, options);
    const ct = res.headers.get("content-type") || "";
    return ct.includes("application/json") ? res.json() : res.text();
  };
})(window);

