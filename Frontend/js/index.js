document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("loginForm");

  // 👁️ Toggle simple (ya está posicionado por CSS)
  (function () {
    const input = document.getElementById("clave");
    const btn   = document.getElementById("togglePassword");
    if (!input || !btn) return;

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      btn.textContent = show ? "🙈" : "👁️";
      btn.setAttribute("aria-pressed", String(show));
      btn.setAttribute("aria-label", show ? "Ocultar contraseña" : "Mostrar contraseña");
    });
  })();

  if (!form) return;

  // 🔑 Login
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const usuario    = document.getElementById("usuario").value.trim();
    const contrasena = document.getElementById("clave").value.trim();
    if (!usuario || !contrasena) return alert("Completá usuario y contraseña");

    try {
      const res = await apiFetch(`/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuario, contrasena }),
      });

      const ct = res.headers.get("content-type") || "";
      const data = ct.includes("application/json") ? await res.json()
                                                   : { error: await res.text() };

      if (!res.ok || data.error) return alert(data.error || "Error en el login");

      localStorage.clear();
      localStorage.setItem("token", data.token);
      localStorage.setItem("usuario", JSON.stringify(data.user));
      window.location.assign("/html/dashboard.html");
    } catch (err) {
      console.error("Error en login:", err);
      alert("Error de conexión con el servidor");
    }
  });
});

