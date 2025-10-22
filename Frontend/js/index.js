document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("loginForm");

  // --- 👁️ Mostrar/ocultar contraseña ------------------------
  (function () {
    const input = document.getElementById("clave");
    if (!input) return;

    // envolver el input si aún no lo está
    let wrap = input.closest(".password-field");
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.className = "password-field";
      input.parentNode.insertBefore(wrap, input);
      wrap.appendChild(input);
    }

    // crear/obtener botón
    let btn = wrap.querySelector("#togglePassword");
    if (!btn) {
      btn = document.createElement("button");
      btn.type = "button";                   // no envía el form
      btn.id = "togglePassword";
      btn.className = "toggle-password";
      btn.setAttribute("aria-label", "Mostrar u ocultar contraseña");
      btn.textContent = "👁️";
      wrap.appendChild(btn);
    }

    btn.addEventListener("click", (e) => {
      e.preventDefault(); // por si algún estilo lo toma como submit
      e.stopPropagation();
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      btn.textContent = show ? "🙈" : "👁️";
      btn.setAttribute("aria-pressed", String(show));
    });
  })();
  // -----------------------------------------------------------

  if (!form) return;

  // --- 🔑 Manejo de login -----------------------------------
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const usuario   = document.getElementById("usuario").value.trim();
    const contrasena = document.getElementById("clave").value.trim();

    if (!usuario || !contrasena) {
      alert("Completá usuario y contraseña");
      return;
    }

    try {
      const res = await apiFetch(`/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuario, contrasena }),
      });

      const ct = res.headers.get("content-type") || "";
      const data = ct.includes("application/json") ? await res.json() : { error: await res.text() };

      if (!res.ok || data.error) {
        alert(data.error || "Error en el login");
        return;
      }

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
