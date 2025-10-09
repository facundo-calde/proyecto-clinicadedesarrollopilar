// ==========================
// 🔹 Manejo de sesión común
// ==========================
const token = localStorage.getItem("token");
const usuario = JSON.parse(localStorage.getItem("usuario") || "{}");

// Si no hay token → volver al login
if (!token) {
  window.location.href = "index.html";
}

// Mostrar nombre dinámico en la barra superior (si existe <strong id="userName">)
if (usuario && usuario.nombreApellido) {
  const userNameEl = document.getElementById("userName");
  if (userNameEl) userNameEl.textContent = usuario.nombreApellido;
}

// 🔹 Botón cerrar sesión (si existe <button id="btnLogout">)
const btnLogout = document.getElementById("btnLogout");
if (btnLogout) {
  btnLogout.addEventListener("click", () => {
    localStorage.removeItem("token");
    localStorage.removeItem("usuario");
    window.location.href = "index.html";
  });
}



