document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("loginForm");

  // === Ojo de contraseña: posición exacta respecto al INPUT ===
(function () {
  const input = document.getElementById("clave");
  if (!input) return;

  const EYE_RIGHT_PX = 10;  // distancia al borde derecho del input
  const EYE_SIZE_PX  = 28;  // tamaño del botón
  const EXTRA_SPACE  = 34;  // padding extra dentro del input

  // Asegurar wrapper relativo
  let wrap = input.closest(".password-field");
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.style.position = "relative";
    wrap.style.display = "block";
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
  }

  // Aumentar padding-right del input para que no se tape
  const neededPadding = EYE_RIGHT_PX + EYE_SIZE_PX + EXTRA_SPACE;
  const currentPr = parseInt(getComputedStyle(input).paddingRight || "0", 10);
  input.style.paddingRight = Math.max(currentPr, neededPadding) + "px";

  // Crear botón (sin heredar estilos)
  let btn = wrap.querySelector("#togglePassword");
  if (!btn) {
    btn = document.createElement("button");
    btn.id = "togglePassword";
    btn.type = "button";
    btn.textContent = "👁️";
    btn.setAttribute("aria-label", "Mostrar u ocultar contraseña");

    // Estilos inline seguros
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
      zIndex: "9999",
      pointerEvents: "auto",
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

  // Posicionamiento preciso con client rects
  function positionEye() {
    const iRect = input.getBoundingClientRect();
    const wRect = wrap.getBoundingClientRect();

    const top = iRect.top - wRect.top + (iRect.height - EYE_SIZE_PX) / 2;
    const left = iRect.left - wRect.left + iRect.width - EYE_RIGHT_PX - EYE_SIZE_PX;

    btn.style.top = Math.round(top) + "px";
    btn.style.left = Math.round(left) + "px";

    // Reasegurar padding-right (por si cambia el layout)
    const prNow = parseInt(getComputedStyle(input).paddingRight || "0", 10);
    if (prNow < neededPadding) input.style.paddingRight = neededPadding + "px";
  }

  // Posicionar ahora y ante cambios
  positionEye();
  window.addEventListener("resize", positionEye);
  const ro = new ResizeObserver(positionEye);
  ro.observe(input);
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
