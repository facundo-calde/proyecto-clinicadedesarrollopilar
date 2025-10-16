// /js/config.js
(function (w) {
  "use strict";

  // Ajustá si cambia tu dominio o puerto local
  const DEV_PORT  = 3000;
  const PROD_BASE = "https://app.clinicadedesarrollopilar.com.ar";
  const DEV_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0"]);
  const isDev     = DEV_HOSTS.has(location.hostname);

  // API base final SIEMPRE incluye /api
  const API_BASE = isDev ? `http://localhost:${DEV_PORT}/api`
                         : `${PROD_BASE}/api`;
  w.API_BASE = API_BASE; // por si querés usarlo a mano

  // --- Hook global a fetch: reescribe URLs de API y agrega token ---
  const origFetch = w.fetch.bind(w);

  w.fetch = function (url, options) {
    try {
      if (typeof url === "string") {
        const origin = location.origin;

        // Normalizamos formatos comunes a la misma base:
        if (url.startsWith("/api/")) {
          url = API_BASE + url.slice(4);
        } else if (url.startsWith("http://localhost:3000/api/")) {
          url = API_BASE + url.slice("http://localhost:3000/api".length);
        } else if (url.startsWith(`${PROD_BASE}/api/`)) {
          url = API_BASE + url.slice(`${PROD_BASE}/api`.length);
        } else if (url.startsWith(origin + "/api/")) {
          url = API_BASE + url.slice((origin + "/api").length);
        }
      }

      const opts = options ? { ...options } : {};
      const headers = new Headers(opts.headers || {});

      // Token (equivalente a fetchAuth)
      const token =
        localStorage.getItem("token") ||
        sessionStorage.getItem("token") ||
        "";
      if (token && !headers.has("Authorization")) {
        headers.set("Authorization", `Bearer ${token}`);
      }

      // Content-Type JSON solo si hay body, no es FormData, y no viene seteado
      const hasBody     = opts.body != null;
      const isFormData  = typeof FormData !== "undefined" && opts.body instanceof FormData;
      const method      = (opts.method || "GET").toUpperCase();

      if (hasBody && !isFormData && method !== "GET" && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
      }

      opts.headers = headers;
      if (!opts.cache) opts.cache = "no-store";

      return origFetch(url, opts).then((res) => {
        if (res.status === 401) {
          // manejo centralizado de sesión
          localStorage.removeItem("token");
          localStorage.removeItem("usuario");
          // Podés redirigir si querés:
          // location.replace("/index.html");
        }
        return res; // devolvemos Response crudo
      });
    } catch (_) {
      // Si algo falla en el hook, delegamos al fetch original sin tocar nada
      return origFetch(url, options);
    }
  };

  // Helper: devuelve Response crudo (para que cada módulo decida .json() o .text())
  w.apiFetch = function apiFetch(path, options = {}) {
    const url = path.startsWith("/")
      ? (path.startsWith("/api/") ? path : `/api${path}`)
      : `/api/${path}`;
    return w.fetch(url, options);
  };

  // Helper opcional si querés parsear directamente JSON
  w.apiFetchJson = async function apiFetchJson(path, options = {}) {
    const res = await w.apiFetch(path, options);
    const ct = res.headers.get("content-type") || "";
    if (!res.ok) {
      // Intentá extraer error legible
      const payload = ct.includes("application/json") ? await res.json().catch(() => ({})) : await res.text();
      const msg = (payload && payload.error) || payload?.message || `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return ct.includes("application/json") ? res.json() : res.text();
  };
})(window);

