document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("loginForm");

  // --- 👁️ Mostrar/ocultar contraseña ------------------------
  (function () {
    const input = document.getElementById("clave");
    if (!input) return;

    // Si ya está envuelto, no hacer nada
    if (input.parentElement && input.parentElement.classList.contains("password-field")) return;

    // Crear wrapper y meter el input adentro
    const wrap = document.createElement("div");
    wrap.className = "password-field";
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);

    // Crear botón ojito
    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = "togglePassword";
    btn.className = "toggle-password";
    btn.setAttribute("aria-label", "Mostrar u ocultar contraseña");
    btn.innerHTML = "👁️";
    wrap.appendChild(btn);

    btn.addEventListener("click", () => {
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      btn.innerHTML = show ? "🙈" : "👁️";
      btn.setAttribute("aria-label", show ? "Ocultar contraseña" : "Mostrar contraseña");
    });
  })();
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
