(() => {
  'use strict';

  // 🔐 sesión
  const token = localStorage.getItem('token');
  const usuario = (() => {
    try { return JSON.parse(localStorage.getItem('usuario') || 'null'); }
    catch { return null; }
  })();

  if (!token) {
    location.replace('index.html');
    return;
  }

  // 👤 usuario label
  const userLabel = document.getElementById('userLabel');
  if (userLabel) {
    const nombre = usuario?.nombre || usuario?.user || usuario?.email || 'Usuario';
    userLabel.innerHTML = `USUARIO: <strong>${nombre}</strong>`;
  }

  // 🚪 logout
  const btnLogout = document.getElementById('btnLogout');
  if (btnLogout) {
    btnLogout.addEventListener('click', () => {
      localStorage.removeItem('token');
      localStorage.removeItem('usuario');
      location.replace('index.html');
    });
  }

  // 📅 Google Calendar embed
  // Reemplazá TU_CALENDAR_ID por el real (o armalo desde config.js)
  const CALENDAR_ID = 'TU_CALENDAR_ID';
  const TZ = 'America/Argentina/Buenos_Aires';

  const frame = document.getElementById('gcalFrame');
  if (frame) {
    frame.src = `https://calendar.google.com/calendar/embed?src=${encodeURIComponent(CALENDAR_ID)}&ctz=${encodeURIComponent(TZ)}`;
  }
})();
