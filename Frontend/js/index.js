document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("loginForm");
  const API =
    location.hostname.includes("localhost") || location.hostname.includes("127.0.0.1")
      ? ""
      : `${location.protocol}//${location.host}`;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const usuario = document.getElementById("usuario").value.trim();
    const contrasena = document.getElementById("clave").value.trim();

    try {
      const res = await fetch(`${API}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuario, contrasena }),
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Error en el login");
        return;
      }

      localStorage.clear();
      localStorage.setItem("token", data.token);
      localStorage.setItem("usuario", JSON.stringify(data.user));

      // 👇 redirección correcta
      window.location.assign("/html/dashboard.html");
    } catch (err) {
      console.error("Error en login:", err);
      alert("Error de conexión con el servidor");
    }
  });
});
