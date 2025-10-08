document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("loginForm");

  // Detectar automáticamente si está en producción o en local
  const API =
    window.location.hostname.includes("localhost") || window.location.hostname.includes("127.0.0.1")
      ? "http://localhost:3000"
      : "https://app.clinicadedesarrollopilar.com.ar";

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const usuario = document.getElementById("usuario").value.trim();
    const contrasena = document.getElementById("clave").value.trim();

    try {
      const res = await fetch(`${API}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuario, contrasena }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Error en el login");
        return;
      }

      // 🧹 Limpiar storage viejo
      localStorage.clear();

      // 🔑 Guardar token y usuario actual
      localStorage.setItem("token", data.token);
      localStorage.setItem("usuario", JSON.stringify(data.user));

      // 👉 Verificación (para debug, borrar después si no lo necesitás)
      console.log("Usuario logueado:", data.user);

      // Redirigir al dashboard
      window.location.href = "dashboard.html";
    } catch (err) {
      console.error("Error en login:", err);
      alert("Error de conexión con el servidor");
    }
  });
});

