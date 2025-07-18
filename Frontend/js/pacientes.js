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
  <button onclick="verDiagnosticos('${p.dni}')" class="btn-secundario">Diagnósticos</button>
  <button onclick="verDocumentos('${p.dni}')" class="btn-secundario">Documentos</button>
</div>

    </div>
  `;

  // 👉 Escuchar clic en botón Documentos
  document.querySelector('.btn-documentos')?.addEventListener('click', e => {
    const dni = e.currentTarget.dataset.dni;
    if (dni) verDocumentosPaciente(dni);
  });
}


async function modificarPaciente(dni) {
  try {
    const res = await fetch(`${API_URL}/${dni}`);
    const p = await res.json();

    let fechaBaja = p.fechaBaja ?? null;
    let motivoBaja = p.motivoBaja ?? null;

    const { isConfirmed } = await Swal.fire({
      title: '<h3 style="font-family: Montserrat; font-weight: 600;">Modificar datos del paciente:</h3>',
      html: `
        <form id="formEditarPaciente" class="formulario-paciente">
          <div class="grid-form">
            <div class="columna">
              <label>Nombre y Apellido:</label>
              <input id="nombre" class="swal2-input" value="${p.nombre}">
              <label>DNI:</label>
              <input id="dniInput" class="swal2-input" value="${p.dni}">
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
                <select id="areaSeleccionada" class="swal2-select">
                  <option>Psicopedagogía</option>
                  <option>Fonoaudiología</option>
                  <option>Terapia Ocupacional</option>
                  <option>Atención Temprana</option>
                  <option>Habilidades Sociales</option>
                </select>
                <label style="font-weight:bold;">Profesional:</label>
                <select id="profesionalSeleccionado" class="swal2-select">
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
      cancelButtonText: 'Cancelar'
    });

    if (!isConfirmed) return;

    const estadoElegido = document.getElementById('estado')?.value;

    if (estadoElegido === 'Baja') {
      const baja = await Swal.fire({
        title: 'Registrar baja del paciente',
        html: `
          <div style="display: flex; flex-direction: column; gap: 10px;">
            <label>Fecha:</label>
            <input type="date" id="fechaBaja" class="swal2-input">
            <label>Motivo:</label>
            <input type="text" id="motivoBaja" class="swal2-input">
          </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'Guardar',
        cancelButtonText: 'Cancelar',
        preConfirm: () => {
          const fecha = document.getElementById('fechaBaja')?.value;
          const motivo = document.getElementById('motivoBaja')?.value;
          if (!fecha || !motivo) {
            Swal.showValidationMessage('Completá todos los campos');
            return false;
          }
          return { fecha, motivo };
        }
      });

      if (!baja.isConfirmed) return;

      fechaBaja = baja.value.fecha;
      motivoBaja = baja.value.motivo;
    }

    if (estadoElegido === 'Alta') {
      let modulos = [];
      try {
        const resModulos = await fetch('/api/modulos');
        if (resModulos.ok) modulos = await resModulos.json();
      } catch (e) {
        console.warn('No se pudieron cargar los módulos:', e);
      }

      let contenidoAlta = modulos.length > 0 ? modulos.map((m, i) => `
        <div style="border:1px solid #ccc; padding:10px; margin-bottom:10px; border-radius:6px;">
          <b>${i + 1} - ${m.nombre}</b><br>
          <label>Módulo:</label>
          <select class="swal2-select">
            <option value="${m.codigo}">${m.codigo}</option>
          </select>
          <label>Cantidad:</label>
          <select class="swal2-select">
            ${[0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map(c => `<option>${c}</option>`).join('')}
          </select>
          <label>Año:</label>
          <select class="swal2-select">
            ${[2025, 2026].map(a => `<option>${a}</option>`).join('')}
          </select>
        </div>
      `).join('') : '<p style="color:red;">⚠️ No hay módulos cargados aún.</p>';

      await Swal.fire({
        title: 'Asignar módulos al paciente',
        html: `<div style="max-height: 300px; overflow-y: auto">${contenidoAlta}</div>`,
        confirmButtonText: 'Guardar',
        cancelButtonText: 'Cancelar',
        showCancelButton: true
      });
    }

    const data = {
      nombre: document.getElementById('nombre')?.value,
      dni: document.getElementById('dniInput')?.value,
      fechaNacimiento: document.getElementById('fecha')?.value,
      colegio: document.getElementById('colegio')?.value,
      curso: document.getElementById('curso')?.value,
      madre: document.getElementById('madre')?.value,
      whatsappMadre: document.getElementById('wsmadre')?.value,
      padre: document.getElementById('padre')?.value,
      whatsappPadre: document.getElementById('wspadre')?.value,
      mail: document.getElementById('mail')?.value,
      abonado: document.getElementById('abonado')?.value,
      estado: estadoElegido,
      areas: [...document.querySelectorAll('.areas-box input:checked')].map(e => e.value),
      planPaciente: document.getElementById('planPaciente')?.value,
      fechaBaja,
      motivoBaja
    };

    await fetch(`${API_URL}/${dni}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    Swal.fire('✅ Cambios guardados', '', 'success');
    renderFichaPaciente({ ...p, ...data, nombre: data.nombre, dni: data.dni });
    // 🔹 Borra la ficha del paciente
document.getElementById('fichaPacienteContainer').innerHTML = '';
    document.getElementById('busquedaInput').value = ''; // 🔹 Limpia la búsqueda


  } catch (err) {
    console.error(err);
    Swal.fire('❌ Error al cargar paciente', '', 'error');
  }
}







document.getElementById('btnNuevoPaciente').addEventListener('click', () => {
  Swal.fire({
    title: '<h3 style="font-family: Montserrat; font-weight: 600;">Cargar nuevo paciente:</h3>',
    html: `
      <form id="formNuevoPaciente" class="formulario-paciente">
        <div class="grid-form">
          <div class="columna">
            <label>Nombre y Apellido:</label>
            <input id="nombre" class="swal2-input">
            <label>DNI:</label>
            <input id="dni" class="swal2-input">
            <label>Fecha de nacimiento:</label>
            <input id="fecha" class="swal2-input" type="date">
            <label>Colegio:</label>
            <input id="colegio" class="swal2-input">
            <label>Curso / Nivel:</label>
            <input id="curso" class="swal2-input">
            <label>Madre:</label>
            <input id="madre" class="swal2-input">
            <label>Whatsapp Madre:</label>
            <input id="wsmadre" class="swal2-input">
            <label>Mail:</label>
            <input id="mail" class="swal2-input" type="email">
            <label>Padre:</label>
            <input id="padre" class="swal2-input">
            <label>Whatsapp Padre:</label>
            <input id="wspadre" class="swal2-input">
            <label>Abonado:</label>
            <select id="abonado" class="swal2-select">
              <option>Obra Social</option>
              <option>Particular</option>
              <option>Obra Social + Particular</option>
            </select>
            <label>Estado:</label>
            <select id="estado" class="swal2-select">
              <option>Alta</option>
              <option>Baja</option>
              <option>En espera</option>
            </select>
          </div>

          <div class="columna">
            <label style="font-weight:bold;">Selección de área:</label>
            <div class="areas-box">
              ${['Psicopedagogía', 'Fonoaudiología', 'Terapia Ocupacional', 'Atención Temprana', 'Habilidades Sociales']
        .map(area => `
                  <label>
                    <input type="checkbox" value="${area}"> ${area}
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
            <textarea id="planPaciente" rows="4" style="width:100%; border:1px solid #ccc; border-radius:5px; margin-top:5px; padding:10px;"></textarea>
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
      const nombre = document.getElementById('nombre').value.trim();
      const dni = document.getElementById('dni').value.trim();
      const fechaNacimiento = document.getElementById('fecha').value;
      const madre = document.getElementById('madre').value.trim();
      const padre = document.getElementById('padre').value.trim();
      const whatsappMadre = document.getElementById('wsmadre').value.trim();
      const whatsappPadre = document.getElementById('wspadre').value.trim();
      const mail = document.getElementById('mail').value.trim();

      const dniRegex = /^\d{7,8}$/;
      const mailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const wspRegex = /^\d{10,15}$/;

      if (!fechaNacimiento || !dni || !madre || !padre || !whatsappMadre || !whatsappPadre || !mail) {
        Swal.showValidationMessage('⚠️ Todos los campos obligatorios deben estar completos.');
        return false;
      }

      if (!dniRegex.test(dni)) {
        Swal.showValidationMessage('⚠️ El DNI debe tener entre 7 y 8 dígitos numéricos.');
        return false;
      }

      if (!mailRegex.test(mail)) {
        Swal.showValidationMessage('⚠️ El mail ingresado no es válido.');
        return false;
      }

      if (!wspRegex.test(whatsappMadre) || !wspRegex.test(whatsappPadre)) {
        Swal.showValidationMessage('⚠️ Los WhatsApp deben contener solo números (10 a 15 dígitos).');
        return false;
      }

      return {
        nombre,
        dni,
        fechaNacimiento,
        colegio: document.getElementById('colegio').value.trim(),
        curso: document.getElementById('curso').value.trim(),
        madre,
        whatsappMadre,
        padre,
        whatsappPadre,
        mail,
        abonado: document.getElementById('abonado').value,
        estado: document.getElementById('estado').value,
        areas: [...document.querySelectorAll('.areas-box input:checked')].map(e => e.value),
        planPaciente: document.getElementById('planPaciente').value.trim()
      };
    }

  }).then(async result => {
    if (result.isConfirmed) {
      try {
        const response = await fetch(API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(result.value)
        });

        if (!response.ok) throw new Error('No se pudo guardar');

        const nuevoPaciente = await response.json();
        Swal.fire('✅ Paciente cargado con éxito', '', 'success');
        renderFichaPaciente(nuevoPaciente);
      } catch (error) {
        console.error('Error al guardar el nuevo paciente', error);
        Swal.fire('❌ Error al guardar', '', 'error');
      }
    }
  });
});

async function verDocumentos(dni) {
  try {
    const res = await fetch(`${API_URL}/${dni}`);
    const paciente = await res.json();
    const documentos = paciente.documentosPersonales ?? [];


    const htmlTabla = documentos.length
      ? documentos.map((doc, i) => `
        <tr>
          <td>${doc.fecha}</td>
          <td>${doc.tipo}</td>
          <td>${doc.observaciones ?? '-'}</td>
          <td><a href="${doc.archivoURL}" target="_blank" title="Ver archivo"><i class="fa fa-file-pdf"></i></a></td>
          <td>
            <button onclick="editarDocumento('${dni}', ${i})"><i class="fa fa-pen"></i></button>
            <button onclick="eliminarDocumento('${dni}', ${i})"><i class="fa fa-trash"></i></button>
          </td>
        </tr>
      `).join('')
      : `<tr><td colspan="5" style="text-align:center;">No hay documentos cargados.</td></tr>`;

    await Swal.fire({
      title: `<h3 style="font-family:Montserrat;">Documentos personales - DNI ${dni}</h3>`,
      html: `
  <button onclick="agregarDocumento('${dni}')" class="swal2-confirm" style="margin-bottom: 10px;">➕ Agregar documento</button>
  <table style="width:100%; font-size: 14px; text-align: left;">
    <thead>
      <tr><th>Fecha</th><th>Tipo</th><th>Observaciones</th><th>Ver adjuntos</th><th>Modificar</th></tr>
    </thead>
    <tbody>${htmlTabla}</tbody>
  </table>
`
      ,
      width: '70%',
      showCancelButton: true,
      showConfirmButton: false,
      cancelButtonText: 'Cerrar'
    });
  } catch (e) {
    console.error('Error al mostrar documentos:', e);
    Swal.fire('❌ Error al cargar documentos', '', 'error');
  }
}


async function agregarDocumento(dni) {
  const { value: formValues, isConfirmed } = await Swal.fire({
    title: 'Agregar nuevo documento',
    html: `
      <div style="display: flex; flex-direction: column; gap: 10px;">
        <label>Fecha:</label>
        <input type="date" id="docFecha" class="swal2-input">

        <label>Tipo:</label>
        <input type="text" id="docTipo" class="swal2-input" placeholder="Ej: DNI, Autorización, Carnet OS...">

        <label>Observaciones:</label>
        <textarea id="docObs" class="swal2-textarea" placeholder="Opcional"></textarea>

        <label>Archivo adjunto (PDF o imagen):</label>
        <input type="file" id="docArchivo" class="swal2-file" accept=".pdf,image/*">
      </div>
    `,
    showCancelButton: true,
    confirmButtonText: 'Guardar',
    cancelButtonText: 'Cancelar',
    preConfirm: async () => {
      const fecha = document.getElementById('docFecha').value;
      const tipo = document.getElementById('docTipo').value;
      const observaciones = document.getElementById('docObs').value;
      const archivo = document.getElementById('docArchivo').files[0];

      if (!fecha || !tipo || !archivo) {
        Swal.showValidationMessage('Todos los campos excepto observaciones son obligatorios');
        return false;
      }

      // Simulación de subida de archivo
      const archivoURL = await simularSubidaArchivo(archivo);

      return { fecha, tipo, observaciones, archivoURL };
    }
  });

  if (!isConfirmed || !formValues) return;

  try {
    // Traer paciente actual
    const res = await fetch(`${API_URL}/${dni}`);
    const paciente = await res.json();

    const nuevoDoc = {
      fecha: formValues.fecha,
      tipo: formValues.tipo,
      observaciones: formValues.observaciones,
      archivoURL: formValues.archivoURL
    };

    const documentosActualizados = [
      ...(Array.isArray(paciente.documentosPersonales) ? paciente.documentosPersonales : []),
      nuevoDoc
    ];



    await fetch(`${API_URL}/${dni}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentosPersonales: documentosActualizados }) // ✅ corregido
    });


    Swal.fire('✅ Documento agregado', '', 'success');
    verDocumentos(dni); // Refrescar la vista
  } catch (error) {
    console.error('Error al agregar documento:', error);
    Swal.fire('❌ Error al guardar documento', '', 'error');
  }
}

async function verDiagnosticos(dni) {
  try {
    const res = await fetch(`${API_URL}/${dni}`);
    const paciente = await res.json();
    const diagnosticos = paciente.diagnosticos ?? [];

    const htmlTabla = diagnosticos.length
      ? diagnosticos.map((d, i) => `
        <tr>
          <td>${d.fecha}</td>
          <td>${d.area}</td>
          <td>${d.observaciones ?? '-'}</td>
          <td><a href="${d.archivoURL}" target="_blank"><i class="fa fa-file-pdf"></i></a></td>
          <td>
            <button onclick="editarDiagnostico('${dni}', ${i})"><i class="fa fa-pen"></i></button>
            <button onclick="eliminarDiagnostico('${dni}', ${i})"><i class="fa fa-trash"></i></button>
          </td>
        </tr>
      `).join('')
      : `<tr><td colspan="5" style="text-align:center;">No hay diagnósticos cargados.</td></tr>`;

    await Swal.fire({
      title: `<h3 style="font-family:Montserrat;">Historial de informes:<br>${paciente.nombre} - DNI ${dni}</h3>`,
      html: `
        <button onclick="agregarDiagnostico('${dni}')" class="swal2-confirm" style="margin-bottom: 10px;">➕ Agregar nuevo diagnóstico</button>
        <table style="width:100%; font-size:14px; text-align:left;">
          <thead>
            <tr><th>Fecha</th><th>Área</th><th>Observaciones</th><th>Ver adjuntos</th><th>Modificar</th></tr>
          </thead>
          <tbody>${htmlTabla}</tbody>
        </table>
      `,
      width: '70%',
      showCancelButton: true,
      showConfirmButton: false,
      cancelButtonText: 'Cerrar'
    });
  } catch (e) {
    console.error('Error al mostrar diagnósticos:', e);
    Swal.fire('❌ Error al cargar diagnósticos', '', 'error');
  }
}
