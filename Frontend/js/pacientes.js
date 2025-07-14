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
  const html = `
    <div class="ficha-paciente">
      <h3>${p.nombre} - DNI ${p.dni ?? 'sin datos'}</h3>
      <p><strong>Madre:</strong> ${p.madre ?? 'sin datos'} (${p.whatsappMadre ?? '-'})</p>
      <p><strong>Padre:</strong> ${p.padre ?? 'sin datos'} (${p.whatsappPadre ?? '-'})</p>
      <p><strong>Email:</strong> ${p.mail ?? 'sin datos'}</p>
      <p><strong>Colegio:</strong> ${p.colegio ?? '-'} - <strong>Curso:</strong> ${p.curso ?? '-'}</p>
      <button onclick="modificarPaciente('${p.dni}')" class="btn-modificar">✏️ Modificar</button>
    </div>
  `;

  const container = document.getElementById('fichaPacienteContainer');
  container.innerHTML += html;
}

async function modificarPaciente(dni) {
  try {
    const res = await fetch(`${API_URL}/${dni}`);
    const paciente = await res.json();

    Swal.fire({
      title: 'Modificar paciente',
      html: `
        <input id="input-nombre" class="swal2-input" value="${paciente.nombre}" placeholder="Nombre">
        <input id="input-mail" class="swal2-input" value="${paciente.mail}" placeholder="Mail">
        <input id="input-curso" class="swal2-input" value="${paciente.curso}" placeholder="Curso">
      `,
      showCancelButton: true,
      confirmButtonText: 'Guardar',
      preConfirm: () => {
        const nombre = document.getElementById('input-nombre').value;
        const mail = document.getElementById('input-mail').value;
        const curso = document.getElementById('input-curso').value;
        if (!nombre || !mail) {
          Swal.showValidationMessage('Todos los campos son obligatorios');
          return false;
        }
        return { nombre, mail, curso };
      }
    }).then(async result => {
      if (result.isConfirmed) {
        const update = await fetch(`${API_URL}/${dni}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(result.value)
        });
        const actualizado = await update.json();
        Swal.fire('✅ Cambios guardados', '', 'success');
        renderFichaPaciente(actualizado);
      }
    });
  } catch (err) {
    console.error(err);
    Swal.fire('Error al cargar paciente', '', 'error');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('btnNuevoPaciente');
  if (btn) {
    btn.addEventListener('click', () => {
      Swal.fire({
        title: '<h3 style="font-family: Montserrat; font-weight: 600;">Cargar nuevo paciente</h3>',
        html: `
  <form id="formNuevoPaciente" class="formulario-paciente">
    <div class="grid-form">
      <div class="columna">
        <label>Nombre y Apellido:</label>
        <input id="nombre" class="swal2-input" type="text">
        <label>DNI:</label>
        <input id="dni" class="swal2-input" type="text">
        <label>Fecha de nacimiento:</label>
        <input id="fecha" class="swal2-input" type="date">
        <label>Colegio:</label>
        <input id="colegio" class="swal2-input" type="text">
        <label>Curso / Nivel:</label>
        <input id="curso" class="swal2-input" type="text">
        <label>Madre:</label>
        <input id="madre" class="swal2-input" type="text">
        <label>Whatsapp Madre:</label>
        <input id="wsmadre" class="swal2-input" type="text">
        <label>Padre:</label>
        <input id="padre" class="swal2-input" type="text">
        <label>Whatsapp Padre:</label>
        <input id="wspadre" class="swal2-input" type="text">
        <label>Mail:</label>
        <input id="mail" class="swal2-input" type="email">
      </div>
      <div class="columna">
        <label>Abonado:</label>
        <select id="abonado" class="swal2-select">
          <option value="">Seleccionar</option>
          <option>Obra Social</option>
          <option>Particular</option>
          <option>Obra Social + Particular</option>
        </select>
        <label>Estado:</label>
        <select id="estado" class="swal2-select">
          <option value="">Seleccionar</option>
          <option>Alta</option>
          <option>Baja</option>
          <option>En espera</option>
        </select>
        <label>Áreas:</label>
        <div class="areas-box">
          <label><input type="checkbox" value="Psicopedagogía"> Psicopedagogía</label>
          <label><input type="checkbox" value="Fonoaudiología"> Fonoaudiología</label>
          <label><input type="checkbox" value="Terapia Ocupacional"> Terapia Ocupacional</label>
          <label><input type="checkbox" value="Atención Temprana"> Atención Temprana</label>
          <label><input type="checkbox" value="Habilidades Sociales"> Habilidades Sociales</label>
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
        <div style="background-color:#cfe2ff; padding:6px; border-radius:5px; text-align:center; font-weight:bold;">Plan seleccionado para el paciente:</div>
        <textarea id="planPaciente" rows="4" style="width:100%; border:1px solid #ccc; border-radius:5px; margin-top:5px; padding:10px;">No hay datos seleccionados.</textarea>
      </div>
    </div>
  </form>
`,
        width: '80%',
        customClass: {
          popup: 'swal-scrollable-form'
        },
        showCancelButton: true,
        confirmButtonText: 'Guardar',
        cancelButtonText: 'Cancelar',
        preConfirm: () => {
          const nombre = document.getElementById('nombre').value;
          const mail = document.getElementById('mail').value;
          const dni = document.getElementById('dni').value;
          if (!nombre || !mail || !dni) {
            Swal.showValidationMessage('Nombre, mail y DNI son obligatorios');
            return false;
          }

          return {
            nombre,
            dni,
            fechaNacimiento: document.getElementById('fecha').value,
            colegio: document.getElementById('colegio').value,
            curso: document.getElementById('curso').value,
            madre: document.getElementById('madre').value,
            whatsappMadre: document.getElementById('wsmadre').value,
            padre: document.getElementById('padre').value,
            whatsappPadre: document.getElementById('wspadre').value,
            mail,
            abonado: document.getElementById('abonado').value,
            estado: document.getElementById('estado').value,
            areas: [...document.querySelectorAll('.areas-box input:checked')].map(e => e.value),
            planPaciente: document.getElementById('planPaciente').value
          };
        }
      }).then(async (result) => {
        if (result.isConfirmed) {
          try {
            const res = await fetch(`${API_URL}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(result.value)
            });
            if (!res.ok) throw new Error('Error al guardar');
            Swal.fire('✅ Paciente guardado con éxito', '', 'success');
          } catch (err) {
            Swal.fire('❌ Error al guardar', err.message, 'error');
          }
        }
      });
    });
  }
});


