const token = localStorage.getItem("token");
const usuario = JSON.parse(localStorage.getItem("usuario"));

// Si no hay token → volver al login
if (!token) {
  window.location.href = "index.html";
}

// Mostrar nombre del usuario en el botón
if (usuario && usuario.nombreApellido) {
  const userNameEl = document.getElementById("userName");
  if (userNameEl) userNameEl.textContent = usuario.nombreApellido;
}


// 🔹 Control de roles
if (usuario.rol === "Recepcionista") {
  // Solo ve PACIENTES
  document.querySelectorAll(".dashboard a").forEach(link => {
    if (link.textContent.trim() !== "PACIENTES") {
      link.style.display = "none";
    }
  });
} else if (usuario.rol === "Administrador") {
  // Ve todo, no hacemos nada
} else {
  // 🔐 Opcional: si no es ninguno de los dos roles, redirigir al login
  // window.location.href = "index.html";
}

// Ejemplo de request protegido
apiFetch(`/usuarios`, {

  headers: {
    "Authorization": "Bearer " + token
  }
})
  .then(res => res.json())
  .then(data => {
    console.log("Usuarios:", data);
  })
  .catch(err => console.error("Error:", err));

// 🔹 Botón cerrar sesión
document.getElementById("btnLogout").addEventListener("click", () => {
  localStorage.removeItem("token");
  localStorage.removeItem("usuario");
  window.location.href = "index.html";
});


