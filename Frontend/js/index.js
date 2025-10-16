// /js/index.js
document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("loginForm");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const usuario = document.getElementById("usuario").value.trim();
    const contrasena = document.getElementById("clave").value.trim();

    try {
      // apiFetch (en este commit) YA devuelve el cuerpo parseado (objeto JSON o string)
      const data = await apiFetch(`/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuario, contrasena }),
      });

      // Si viniera texto por algún motivo, intento parsearlo
      let payload = data;
      if (typeof payload === "string" && payload) {
        try { payload = JSON.parse(payload); } catch { /* dejamos string */ }
      }

      if (!payload || payload.error) {
        alert((payload && payload.error) || "Faltan credenciales");
        return;
      }

      localStorage.clear();
      localStorage.setItem("token", payload.token);
      localStorage.setItem("usuario", JSON.stringify(payload.user));

      window.location.assign("/html/dashboard.html");
    } catch (err) {
      console.error("Error en login:", err);
      alert("Error de conexión con el servidor");
    }
  });
});
