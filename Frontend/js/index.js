document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("loginForm");

  // --- 👁️ Mostrar/ocultar contraseña ------------------------
  const passwordInput = document.getElementById("clave");
  if (passwordInput) {
    // Si no existe el botón, lo creo e inserto dentro de un contenedor
    let togglePassword = document.getElementById("togglePassword");
    if (!togglePassword) {
      togglePassword = document.createElement("button");
      togglePassword.type = "button";
      togglePassword.id = "togglePassword";
      togglePassword.className = "toggle-password";
      togglePassword.innerHTML = "👁️"; // icono inicial
      togglePassword.setAttribute("aria-label", "Mostrar u ocultar contraseña");

      // Insertar el botón justo después del input
      passwordInput.insertAdjacentElement("afterend", togglePassword);
    }

    togglePassword.addEventListener("click", () => {
      const isPassword = passwordInput.type === "password";
      passwordInput.type = isPassword ? "text" : "password";
      togglePassword.innerHTML = isPassword ? "🙈" : "👁️";
      togglePassword.setAttribute(
        "aria-label",
        isPassword ? "Ocultar contraseña" : "Mostrar contraseña"
      );
    });
  }
  // -----------------------------------------------------------

  if (!form) return;

  // --- 🔑 Manejo de login -----------------------------------
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const usuario = document.getElementById("usuario").value.trim();
    const contrasena = document.getElementById("clave").value.trim();

    if (!usuario || !contrasena) {
      alert("Completá usuario y contraseña");
      return;
    }

    try {
      // apiFetch devuelve un Response crudo (según config.js corregido)
      const res = await apiFetch(`/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuario, contrasena }),
      });

      // Detectamos el tipo de respuesta
      const ct = res.headers.get("content-type") || "";
      const data = ct.includes("application/json")
        ? await res.json()
        : { error: await res.text() };

      if (!res.ok || data.error) {
        alert(data.error || "Error en el login");
        return;
      }

      // Guardar sesión en localStorage
      localStorage.clear();
      localStorage.setItem("token", data.token);
      localStorage.setItem("usuario", JSON.stringify(data.user));

      // Redirección al dashboard
      window.location.assign("/html/dashboard.html");
    } catch (err) {
      console.error("Error en login:", err);
      alert("Error de conexión con el servidor");
    }
  });
});

