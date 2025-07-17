// pacientes.js

const API_URL = 'http://localhost:3000/api/pacientes';
document.getElementById('busquedaInput').addEventListener('input', async () => {
  const input = document.getElementById('busquedaInput').value.trim();
  const sugerencias = document.getElementById('sugerencias');
  sugerencias.innerHTML = '';

  if (input.length < 2) return;

  try {
    const res = await fetch(`${API_URL}?nombre=${encodeURIComponent(input)}`);
    const pacientes = await res.json();

    if (!Array.isArray(pacientes)) return;

    pacientes.forEach(p => {
      const li = document.createElement('li');
      li.textContent = `${p.nombre} - DNI ${p.dni ?? 'No registrado'}`;
      li.addEventListener('click', () => {
        document.getElementById('busquedaInput').value = p.nombre;
        sugerencias.innerHTML = '';
        renderFichaPaciente(p);
      });
      sugerencias.appendChild(li);
    });
  } catch (error) {
    console.error('Error cargando sugerencias', error);
  }
});



function renderFichaPaciente(p) {
  const container = document.getElementById('fichaPacienteContainer');
  container.innerHTML = `
    <div class="ficha-paciente">
      <div class="ficha-header">
        <h3>${p.nombre ?? 'Sin nombre'} - DNI ${p.dni ?? 'Sin DNI'}</h3>
      </div>

      <div class="ficha-columna">
        <div class="ficha-bloque ficha-simple">
          <p><strong>Abonado:</strong> ${p.abonado ?? 'sin datos'}</p>
          <p><strong>Estado:</strong> ${p.estado ?? 'sin datos'}</p>
        </div>

        <div class="ficha-bloque">
          <h4>Datos:</h4>
          <p><strong>Fecha de nacimiento:</strong> ${p.fechaNacimiento ?? 'sin datos'}</p>
          <p><strong>Colegio:</strong> ${p.colegio ?? 'sin datos'}</p>
          <p><strong>Curso / Nivel:</strong> ${p.curso ?? 'sin datos'}</p>
        </div>
      </div>

      <div class="ficha-bloque">
        <h4>Obra Social:</h4>
        <p><strong>Prestador:</strong> ${p.prestador ?? 'sin datos'}</p>
        <p><strong>Credencial:</strong> ${p.credencial ?? 'sin datos'}</p>
        <p><strong>Tipo:</strong> ${p.tipo ?? 'sin datos'}</p>
      </div>

      <div class="ficha-bloque">
        <h4>Padres / Tutores:</h4>
        <p><strong>Madre:</strong> ${p.madre ?? 'sin datos'}</p>
        <p><strong>Whatsapp Madre:</strong> ${p.whatsappMadre ?? '-'}</p>
        <p><strong>Padre:</strong> ${p.padre ?? 'sin datos'}</p>
        <p><strong>Whatsapp Padre:</strong> ${p.whatsappPadre ?? '-'}</p>
        <p><strong>Mail:</strong> ${p.mail ?? 'sin datos'}</p>
      </div>

      <div class="ficha-acciones">
  <button onclick="modificarPaciente('${p.dni}')" class="btn-modificar">✏️ Modificar</button>
  <button class="btn-secundario">Diagnósticos</button>
  <button class="btn-secundario">Documentos</button>
</div>

    </div>
  `;
}


async function modificarPaciente(dni) {
  try {
    const res = await fetch(`${API_URL}/${dni}`);
    const p = await res.json();

    Swal.fire({
      title: '<h3 style="font-family: Montserrat; font-weight: 600;">Modificar datos del paciente:</h3>',
      html: `
        <form id="formEditarPaciente" class="formulario-paciente">
          <div class="grid-form">
            <div class="columna">
              <label>Nombre y Apellido:</label>
              <input id="nombre" class="swal2-input" value="${p.nombre}">
              <label>Fecha de nacimiento:</label>
              <input id="fecha" class="swal2-input" type="date" value="${p.fechaNacimiento ?? ''}">
              <label>Colegio:</label>
              <input id="colegio" class="swal2-input" value="${p.colegio}">
              <label>Curso / Nivel:</label>
              <input id="curso" class="swal2-input" value="${p.curso}">
              <label>Madre:</label>
              <input id="madre" class="swal2-input" value="${p.madre}">
              <label>Whatsapp Madre:</label>
              <input id="wsmadre" class="swal2-input" value="${p.whatsappMadre}">
              <label>Mail:</label>
              <input id="mail" class="swal2-input" type="email" value="${p.mail}">
              <label>Padre:</label>
              <input id="padre" class="swal2-input" value="${p.padre}">
              <label>Whatsapp Padre:</label>
              <input id="wspadre" class="swal2-input" value="${p.whatsappPadre}">
              <label>Abonado:</label>
              <select id="abonado" class="swal2-select">
                <option ${p.abonado === 'Obra Social' ? 'selected' : ''}>Obra Social</option>
                <option ${p.abonado === 'Particular' ? 'selected' : ''}>Particular</option>
                <option ${p.abonado === 'Obra Social + Particular' ? 'selected' : ''}>Obra Social + Particular</option>
              </select>
              <label>Estado:</label>
              <select id="estado" class="swal2-select">
                <option ${p.estado === 'Alta' ? 'selected' : ''}>Alta</option>
                <option ${p.estado === 'Baja' ? 'selected' : ''}>Baja</option>
                <option ${p.estado === 'En espera' ? 'selected' : ''}>En espera</option>
              </select>
            </div>

            <div class="columna">
              <label style="font-weight:bold;">Selección de área:</label>
              <div class="areas-box">
                ${['Psicopedagogía', 'Fonoaudiología', 'Terapia Ocupacional', 'Atención Temprana', 'Habilidades Sociales']
                  .map(area => `
                    <label>
                      <input type="checkbox" value="${area}" ${p.areas?.includes(area) ? 'checked' : ''}> ${area}
                    </label>
                  `).join('')}
              </div>

              <div style="margin-top: 20px;">
                <label style="font-weight:bold;">Área:</label>
                <select id="areaSeleccionada" class="swal2-select" style="margin-bottom: 10px;">
                  <option>Psicopedagogía</option>
                  <option>Fonoaudiología</option>
                  <option>Terapia Ocupacional</option>
                  <option>Atención Temprana</option>
                  <option>Habilidades Sociales</option>
                </select>
                <label style="font-weight:bold;">Profesional:</label>
                <select id="profesionalSeleccionado" class="swal2-select" style="margin-bottom: 10px;">
                  <option>Seleccionar</option>
                </select>
                <button type="button" class="swal2-confirm swal2-styled" style="background-color:#f0f0f0; color:#333; border:1px solid #ccc; margin-bottom: 10px;">Confirmar</button>
              </div>

              <div class="plan-titulo">Plan seleccionado para el paciente:</div>
              <textarea id="planPaciente" rows="4" style="width:100%; border:1px solid #ccc; border-radius:5px; margin-top:5px; padding:10px;">${p.planPaciente ?? 'No hay datos seleccionados.'}</textarea>
            </div>
          </div>
        </form>
      `,
      width: '90%',
      customClass: {
        popup: 'swal-scrollable-form'
      },
      showCancelButton: true,
      confirmButtonText: 'Guardar',
      cancelButtonText: 'Cancelar',
      preConfirm: () => {
        return {
          nombre: document.getElementById('nombre').value,
          fechaNacimiento: document.getElementById('fecha').value,
          colegio: document.getElementById('colegio').value,
          curso: document.getElementById('curso').value,
          madre: document.getElementById('madre').value,
          whatsappMadre: document.getElementById('wsmadre').value,
          padre: document.getElementById('padre').value,
          whatsappPadre: document.getElementById('wspadre').value,
          mail: document.getElementById('mail').value,
          abonado: document.getElementById('abonado').value,
          estado: document.getElementById('estado').value,
          areas: [...document.querySelectorAll('.areas-box input:checked')].map(e => e.value),
          planPaciente: document.getElementById('planPaciente').value
        };
      }
    }).then(async result => {
      if (result.isConfirmed) {
        await fetch(`${API_URL}/${dni}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(result.value)
        });
        Swal.fire('✅ Cambios guardados', '', 'success');
        renderFichaPaciente({ ...p, ...result.value }); // actualiza visual
      }
    });
  } catch (err) {
    console.error(err);
    Swal.fire('Error al cargar paciente', '', 'error');
  }
}



