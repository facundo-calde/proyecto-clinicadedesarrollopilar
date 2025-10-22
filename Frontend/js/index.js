document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("loginForm");

  // --- 👁️ Toggle de contraseña 100% via JS (sin CSS externo) ---
  (function () {
    const input = document.getElementById("clave");
    if (!input) return;

    // Parámetros de posición (ajustables)
    const EYE_RIGHT_PX = 10;    // separación del borde derecho
    const EYE_SIZE_PX  = 28;    // tamaño del botón
    const EXTRA_SPACE  = 30;    // espacio extra por si hay icono del password manager

    // Envolver si hace falta
    let wrap = input.closest(".password-field");
    if (!wrap) {
      wrap = document.createElement("div");
      // estilos inline del contenedor
      wrap.style.position = "relative";
      wrap.style.display  = "block";

      // insertar el wrapper y mover el input adentro
      input.parentNode.insertBefore(wrap, input);
      wrap.appendChild(input);
    }

    // Asegurar padding a la derecha para el ojo + extra
    const neededPadding = EYE_RIGHT_PX + EYE_SIZE_PX + EXTRA_SPACE;
    const currentPr = parseInt(getComputedStyle(input).paddingRight || "0", 10);
    const finalPr = Math.max(currentPr, neededPadding);
    input.style.paddingRight = finalPr + "px";

    // Crear u obtener botón
    let btn = wrap.querySelector("#togglePassword");
    if (!btn) {
      btn = document.createElement("button");
      btn.id = "togglePassword";
      btn.type = "button"; // no dispara submit

      // limpiar clases para que no herede .btn del sitio
      btn.className = "";

      // Estilos inline del botón (no depende de CSS)
      btn.style.position = "absolute";
      btn.style.right = EYE_RIGHT_PX + "px";
      btn.style.top = "50%";
      btn.style.transform = "translateY(-50%)";
      btn.style.width = EYE_SIZE_PX + "px";
      btn.style.height = EYE_SIZE_PX + "px";
      btn.style.display = "flex";
      btn.style.alignItems = "center";
      btn.style.justifyContent = "center";
      btn.style.cursor = "pointer";
      btn.style.background = "transparent";
      btn.style.border = "0";
      btn.style.padding = "0";
      btn.style.margin = "0";
      btn.style.lineHeight = "1";
      btn.style.fontSize = "18px";
      btn.style.color = "#475569";
      btn.style.borderRadius = "6px";
      btn.style.zIndex = "2";

      btn.setAttribute("aria-label", "Mostrar u ocultar contraseña");
      btn.textContent = "👁️";

      btn.addEventListener("mouseenter", () => { btn.style.background = "rgba(0,0,0,.06)"; });
      btn.addEventListener("mouseleave", () => { btn.style.background = "transparent"; });

      wrap.appendChild(btn);
    }

    // Comportamiento del botón
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      btn.textContent = show ? "🙈" : "👁️";
      btn.setAttribute("aria-pressed", String(show));
      btn.setAttribute("aria-label", show ? "Ocultar contraseña" : "Mostrar contraseña");
    });
  })();
  // --------------------------------------------------------------

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
      const res = await apiFetch(`/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuario, contrasena }),
      });

      const ct = res.headers.get("content-type") || "";
      const data = ct.includes("application/json")
        ? await res.json()
        : { error: await res.text() };

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
