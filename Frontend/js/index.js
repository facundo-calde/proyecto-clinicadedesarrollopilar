document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("loginForm");

  // === Ojo de contraseña: posición exacta basada en el input ===
  (function () {
    const input = document.getElementById("clave");
    if (!input) return;

    const EYE_RIGHT_PX = 10;   // separación del borde derecho
    const EYE_SIZE_PX  = 28;   // tamaño del botón
    const EXTRA_SPACE  = 34;   // espacio extra por iconos del password manager

    // wrapper relativo
    let wrap = input.closest(".password-field");
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.style.position = "relative";
      wrap.style.display  = "block";
      // insertarlo justo antes del input y mover el input adentro
      input.parentNode.insertBefore(wrap, input);
      wrap.appendChild(input);
    }

    // asegurar padding-right suficiente
    const neededPadding = EYE_RIGHT_PX + EYE_SIZE_PX + EXTRA_SPACE;
    const currentPr = parseInt(getComputedStyle(input).paddingRight || "0", 10);
    input.style.paddingRight = Math.max(currentPr, neededPadding) + "px";

    // crear botón si no existe
    let btn = wrap.querySelector("#togglePassword");
    if (!btn) {
      btn = document.createElement("button");
      btn.id = "togglePassword";
      btn.type = "button";
      // estilos inline para que no herede .btn ni nada
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
        zIndex: "2",
        right: EYE_RIGHT_PX + "px"
      });
      btn.setAttribute("aria-label", "Mostrar u ocultar contraseña");
      btn.textContent = "👁️";
      wrap.appendChild(btn);

      btn.addEventListener("mouseenter", () => (btn.style.background = "rgba(0,0,0,.06)"));
      btn.addEventListener("mouseleave", () => (btn.style.background = "transparent"));

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

    // función que centra el ojo respecto del INPUT (no del wrapper)
    function positionEye() {
      const inputStyles = getComputedStyle(input);
      const topWithinWrap = input.offsetTop; // distancia desde el top del wrapper
      const inputHeight   = input.offsetHeight;

      // centro vertical del input menos la mitad del ojo
      const top = topWithinWrap + (inputHeight - EYE_SIZE_PX) / 2;

      btn.style.top = Math.round(top) + "px";
      // por si cambiaron bordes/padding, re-asegurar padding-right
      const prNow = parseInt(inputStyles.paddingRight || "0", 10);
      if (prNow < neededPadding) input.style.paddingRight = neededPadding + "px";
    }

    // posicionar ahora y cada vez que cambie el layout
    positionEye();
    window.addEventListener("resize", positionEye);
    // algunos navegadores cambian alto por zoom/tipografía
    const ro = new ResizeObserver(positionEye);
    ro.observe(input);
  })();
  // ============================================================

  if (!form) return;

  // --- Login ---
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const usuario = document.getElementById("usuario").value.trim();
    const contrasena = document.getElementById("clave").value.trim();
    if (!usuario || !contrasena) { alert("Completá usuario y contraseña"); return; }

    try {
      const res = await apiFetch(`/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuario, contrasena }),
      });

      const ct = res.headers.get("content-type") || "";
      const data = ct.includes("application/json") ? await res.json() : { error: await res.text() };

      if (!res.ok || data.error) { alert(data.error || "Error en el login"); return; }

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

