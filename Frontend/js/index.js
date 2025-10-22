document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("loginForm");

  // --- 👁️ Toggle de contraseña, posicionado exacto dentro del input ---
  (function () {
    const input = document.getElementById("clave");
    if (!input) return;

    const EYE_RIGHT_PX = 12;   // separación del borde derecho del INPUT
    const EYE_SIZE_PX  = 28;   // tamaño del botón
    const EXTRA_SPACE  = 28;   // margen extra para no tapar el texto/gestores

    // Envolver el input en un contenedor relativo si no existe
    let wrap = input.closest(".password-field");
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.className = "password-field";
      wrap.style.position = "relative";
      wrap.style.display  = "block";
      wrap.style.width    = "100%";
      input.parentNode.insertBefore(wrap, input);
      wrap.appendChild(input);
    }

    // Asegurar padding-right para que el texto no choque con el botón
    const needPr = EYE_RIGHT_PX + EYE_SIZE_PX + EXTRA_SPACE;
    const curPr  = parseInt(getComputedStyle(input).paddingRight || "0", 10);
    if (curPr < needPr) input.style.paddingRight = needPr + "px";

    // Crear el botón si no existe
    let btn = wrap.querySelector("#togglePassword");
    if (!btn) {
      btn = document.createElement("button");
      btn.id   = "togglePassword";
      btn.type = "button";
      btn.textContent = "👁️";
      btn.setAttribute("aria-label", "Mostrar u ocultar contraseña");

      Object.assign(btn.style, {
        position: "absolute",
        width: EYE_SIZE_PX + "px",
        height: EYE_SIZE_PX + "px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        background: "transparent",
        border: "0",
        padding: "0",
        margin: "0",
        lineHeight: "1",
        fontSize: "18px",
        color: "#475569",
        borderRadius: "6px",
        zIndex: "10",
        pointerEvents: "auto"
      });

      btn.addEventListener("mouseenter", () => (btn.style.background = "rgba(0,0,0,.06)"));
      btn.addEventListener("mouseleave", () => (btn.style.background = "transparent"));

      wrap.appendChild(btn);

      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const show = input.type === "password";
        input.type = show ? "text" : "password";
        btn.textContent = show ? "🙈" : "👁️";
        btn.setAttribute("aria-pressed", String(show));
        btn.setAttribute("aria-label", show ? "Ocultar contraseña" : "Mostrar contraseña");
      });
    }

    // Posicionamiento preciso: centrado vertical respecto del INPUT
    function positionEye() {
      const iRect = input.getBoundingClientRect();
      const wRect = wrap.getBoundingClientRect();
      const top  = iRect.top  - wRect.top + (iRect.height - EYE_SIZE_PX) / 2;
      const left = iRect.left - wRect.left + iRect.width - EYE_RIGHT_PX - EYE_SIZE_PX;

      btn.style.top  = Math.round(top)  + "px";
      btn.style.left = Math.round(left) + "px";
    }

    positionEye();
    // Reposicionar ante cambios de layout/zoom
    window.addEventListener("resize", positionEye);
    const ro = new ResizeObserver(positionEye);
    ro.observe(input);
    // algunas fuentes cargan tarde y cambian el alto
    window.addEventListener("load", positionEye);
  })();
  // ---------------------------------------------------------------------

  if (!form) return;

  // --- 🔑 Manejo de login -----------------------------------
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const usuario    = document.getElementById("usuario").value.trim();
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
