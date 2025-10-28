// ==========================
// MÓDULOS – Frontend
// ==========================

document.addEventListener('DOMContentLoaded', () => {
  const botonCargar     = document.getElementById('btnCargarModulo');
  const inputBusqueda   = document.getElementById('busquedaModulo');
  const sugerencias     = document.getElementById('sugerencias');
  const contenedorFicha = document.getElementById('fichaModuloContainer');
  // Si tu HTML tiene un contenedor dedicado (p.ej. <div id="listaModulos"></div>)
  // lo usamos; si no, reutilizamos el mismo contenedor de ficha.
  const contenedorLista = document.getElementById('listaModulos') || contenedorFicha;

  // ---------- Helpers ----------
  const getNumberOrZero = (id) => {
    const el = document.getElementById(id);
    return el && el.value.trim() !== '' ? parseFloat(el.value) : 0;
  };

  const calcProfesional = (idPaciente, idPorcentaje, idResultado) => {
    const pacienteInput    = document.getElementById(idPaciente);
    const porcentajeInput  = document.getElementById(idPorcentaje);
    const profesionalInput = document.getElementById(idResultado);

    const calcular = () => {
      const paciente   = parseFloat(pacienteInput.value);
      const porcentaje = parseFloat(porcentajeInput.value);
      profesionalInput.value =
        (!isNaN(paciente) && !isNaN(porcentaje))
          ? (paciente * (porcentaje / 100)).toFixed(3)
          : '';
    };

    pacienteInput.addEventListener('input', calcular);
    porcentajeInput.addEventListener('input', calcular);
  };

  // ---------- Listado completo ----------
  async function cargarListadoModulos() {
    try {
      const res = await apiFetch(`/modulos`);
      const mods = await res.json();

      if (!Array.isArray(mods) || mods.length === 0) {
        contenedorLista.innerHTML = `
          <div class="table-container">
            <div style="padding:12px;color:#666;font-style:italic;">No hay módulos cargados todavía.</div>
          </div>`;
        return;
      }

      renderListado(mods);
    } catch (e) {
      console.error('Error listando módulos:', e);
      contenedorLista.innerHTML = `
        <div class="table-container">
          <div style="padding:12px;color:#b91c1c;">Error al cargar el listado de módulos.</div>
        </div>`;
    }
  }

  function renderListado(mods) {
    const rows = mods.map(m => `
      <tr>
        <td>${m.numero}</td>
        <td>01-2027</td>
        <td>$${(m.valoresModulo?.paciente ?? 0).toLocaleString()}</td>
        <td>$${(m.areasExternas?.profesional ?? 0).toLocaleString()}</td>
        <td>$${(m.habilidadesSociales?.profesional ?? 0).toLocaleString()}</td>
        <td>Activo</td>
        <td>
          <button class="btn-modificar" onclick="modificarModulo(${m.numero})">✏️</button>
          <button class="btn-borrar"    onclick="borrarModulo(${m.numero})">🗑️</button>
        </td>
      </tr>
    `).join('');

    contenedorLista.innerHTML = `
      <div class="table-container">
        <table class="modulo-detalle">
          <thead>
            <tr>
              <th>Módulo</th>
              <th>Última modificación</th>
              <th>Valor FONO-PSICO</th>
              <th>Valor ÁREAS EXTERNAS</th>
              <th>Valor HABILIDADES SOCIALES</th>
              <th>Estado</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  // ---------- Autocompletado / búsqueda ----------
  if (inputBusqueda) {
    inputBusqueda.addEventListener('input', async () => {
      const valor = inputBusqueda.value.trim();
      if (sugerencias) sugerencias.innerHTML = '';
      if (contenedorFicha) contenedorFicha.innerHTML = '';

      if (valor.length < 2) return;

      try {
        const res = await apiFetch(`/modulos?numero=${encodeURIComponent(valor)}`);
        const modulos = await res.json();

        if (Array.isArray(modulos) && sugerencias) {
          modulos.forEach(mod => {
            const li = document.createElement('li');
            li.textContent = `Módulo ${mod.numero}`;
            li.style.cursor = 'pointer';
            li.addEventListener('click', () => {
              inputBusqueda.value = mod.numero;
              sugerencias.innerHTML = '';
              mostrarFichaModulo(mod);
            });
            sugerencias.appendChild(li);
          });
        }
      } catch (error) {
        console.error('Error al buscar módulos:', error);
      }
    });
  }

  // ---------- Crear módulo ----------
  if (botonCargar) {
    botonCargar.addEventListener('click', async () => {
      const { value: formValues } = await Swal.fire({
        title: 'Cargar nuevo módulo',
        width: '800px',
        html: `
          <div style="margin-bottom: 15px;">
            <label for="modulo_numero"><strong>Número del módulo:</strong></label>
            <input id="modulo_numero" class="swal2-input" style="width: 100%;">
          </div>

          <!-- FONO/PSICO -->
          <div class="grupo-bloque azul">
            <h4>VALORES FONOAUDIOLOGÍA - PSICOLOGÍA</h4>
            <label>Paciente:</label>
            <input id="fp_paciente">
            <label>Dirección:</label>
            <input id="fp_direccion">
          </div>

          <!-- COORDINADORES -->
          <div class="grupo-bloque azul">
            <h4>FIJO COORDINADORES</h4>
            <label>Nora:</label>
            <input id="coord_nora">
            <label>Tete:</label>
            <input id="coord_tete">
          </div>

          <!-- PROFESIONALES -->
          <div class="grupo-bloque azul">
            <h4>FIJO PROFESIONALES</h4>
            <label>Senior:</label>
            <input id="prof_senior">
            <label>Junior:</label>
            <input id="prof_junior">
          </div>

          <!-- ÁREAS EXTERNAS -->
          <div class="grupo-bloque verde">
            <h4>ÁREAS EXTERNAS</h4>
            <label>Paciente:</label>
            <input id="ae_paciente">
            <label>%:</label>
            <input id="ae_porcentaje">
            <label>Profesional:</label>
            <input id="ae_profesional" readonly>
          </div>

          <!-- HABILIDADES SOCIALES -->
          <div class="grupo-bloque verde">
            <h4>HABILIDADES SOCIALES</h4>
            <label>Paciente:</label>
            <input id="hs_paciente">
            <label>%:</label>
            <input id="hs_porcentaje">
            <label>Profesional:</label>
            <input id="hs_profesional" readonly>
          </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'Guardar',
        cancelButtonText: 'Cancelar',
        didOpen: () => {
          calcProfesional('ae_paciente', 'ae_porcentaje', 'ae_profesional');
          calcProfesional('hs_paciente', 'hs_porcentaje', 'hs_profesional');
        },
        preConfirm: () => {
          const numero = parseInt(document.getElementById('modulo_numero').value, 10);
          if (isNaN(numero)) {
            Swal.showValidationMessage('⚠️ El número del módulo es obligatorio');
            return false;
          }
          return {
            numero,
            valoresModulo: {
              paciente:  getNumberOrZero('fp_paciente'),
              direccion: getNumberOrZero('fp_direccion')
            },
            coordinadores: {
              nora: getNumberOrZero('coord_nora'),
              tete: getNumberOrZero('coord_tete')
            },
            profesionales: {
              senior: getNumberOrZero('prof_senior'),
              junior: getNumberOrZero('prof_junior')
            },
            areasExternas: {
              paciente:    getNumberOrZero('ae_paciente'),
              porcentaje:  getNumberOrZero('ae_porcentaje'),
              profesional: getNumberOrZero('ae_profesional')
            },
            habilidadesSociales: {
              paciente:    getNumberOrZero('hs_paciente'),
              porcentaje:  getNumberOrZero('hs_porcentaje'),
              profesional: getNumberOrZero('hs_profesional')
            }
          };
        }
      });

      if (!formValues) return;

      try {
        const res  = await apiFetch(`/modulos`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formValues)
        });
        const data = await res.json();

        if (res.ok) {
          Swal.fire('Éxito', 'Módulo guardado correctamente', 'success');
          cargarListadoModulos(); // refrescar listado
        } else {
          Swal.fire('Error', data.error || 'No se pudo guardar', 'error');
        }
      } catch (error) {
        console.error('Error:', error);
        Swal.fire('Error', 'Ocurrió un error al guardar', 'error');
      }
    });
  }

  // ---------- Render ficha (detalle de un módulo) ----------
  function mostrarFichaModulo(modulo) {
    contenedorFicha.innerHTML = `
      <div class="table-container">
        <table class="modulo-detalle">
          <thead>
            <tr>
              <th>Módulo</th>
              <th>Última modificación</th>
              <th>Valor FONO-PSICO</th>
              <th>Valor ÁREAS EXTERNAS</th>
              <th>Valor HABILIDADES SOCIALES</th>
              <th>Estado</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>${modulo.numero}</td>
              <td>01-2027</td>
              <td>$${(modulo.valoresModulo?.paciente ?? 0).toLocaleString()}</td>
              <td>$${(modulo.areasExternas?.profesional ?? 0).toLocaleString()}</td>
              <td>$${(modulo.habilidadesSociales?.profesional ?? 0).toLocaleString()}</td>
              <td>Activo</td>
              <td>
                <button class="btn-modificar" onclick="modificarModulo(${modulo.numero})">✏️</button>
                <button class="btn-borrar"    onclick="borrarModulo(${modulo.numero})">🗑️</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    `;
  }

  // ---------- Handlers globales (usados por onclick en la tabla) ----------
  window.borrarModulo = async (numero) => {
    const confirmacion = await Swal.fire({
      title: `¿Eliminar módulo ${numero}?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, borrar',
      cancelButtonText: 'Cancelar'
    });

    if (!confirmacion.isConfirmed) return;

    try {
      const res = await apiFetch(`/modulos/${numero}`, { method: 'DELETE' });
      if (res.ok) {
        Swal.fire('Borrado', 'El módulo fue eliminado.', 'success');
        if (contenedorFicha) contenedorFicha.innerHTML = '';
        cargarListadoModulos(); // refrescar listado
      } else {
        const data = await res.json();
        Swal.fire('Error', data.error || 'No se pudo borrar el módulo.', 'error');
      }
    } catch (error) {
      console.error('Error al borrar módulo:', error);
      Swal.fire('Error', 'Error al eliminar el módulo.', 'error');
    }
  };

  window.modificarModulo = async (numero) => {
    try {
      const res    = await apiFetch(`/modulos/${numero}`);
      const modulo = await res.json();
      if (!res.ok) throw new Error(modulo.error || 'No se pudo obtener el módulo');

      const { value: formValues } = await Swal.fire({
        title: `Modificar módulo ${numero}`,
        width: '800px',
        html: `
          <div style="margin-bottom: 15px;">
            <label for="modulo_numero"><strong>Número del módulo:</strong></label>
            <input id="modulo_numero" class="swal2-input" style="width: 100%;" value="${modulo.numero}" disabled>
          </div>

          <!-- FONO/PSICO -->
          <div class="grupo-bloque azul">
            <h4>VALORES FONOAUDIOLOGÍA - PSICOLOGÍA</h4>
            <label>Paciente:</label>
            <input id="fp_paciente"   value="${modulo.valoresModulo?.paciente ?? 0}">
            <label>Dirección:</label>
            <input id="fp_direccion"  value="${modulo.valoresModulo?.direccion ?? 0}">
          </div>

          <!-- COORDINADORES -->
          <div class="grupo-bloque azul">
            <h4>FIJO COORDINADORES</h4>
            <label>Nora:</label>
            <input id="coord_nora"  value="${modulo.coordinadores?.nora ?? 0}">
            <label>Tete:</label>
            <input id="coord_tete"  value="${modulo.coordinadores?.tete ?? 0}">
          </div>

          <!-- PROFESIONALES -->
          <div class="grupo-bloque azul">
            <h4>FIJO PROFESIONALES</h4>
            <label>Senior:</label>
            <input id="prof_senior" value="${modulo.profesionales?.senior ?? 0}">
            <label>Junior:</label>
            <input id="prof_junior" value="${modulo.profesionales?.junior ?? 0}">
          </div>

          <!-- ÁREAS EXTERNAS -->
          <div class="grupo-bloque verde">
            <h4>ÁREAS EXTERNAS</h4>
            <label>Paciente:</label>
            <input id="ae_paciente"    value="${modulo.areasExternas?.paciente ?? 0}">
            <label>%:</label>
            <input id="ae_porcentaje"  value="${modulo.areasExternas?.porcentaje ?? 0}">
            <label>Profesional:</label>
            <input id="ae_profesional" readonly value="${modulo.areasExternas?.profesional ?? 0}">
          </div>

          <!-- HABILIDADES SOCIALES -->
          <div class="grupo-bloque verde">
            <h4>HABILIDADES SOCIALES</h4>
            <label>Paciente:</label>
            <input id="hs_paciente"    value="${modulo.habilidadesSociales?.paciente ?? 0}">
            <label>%:</label>
            <input id="hs_porcentaje"  value="${modulo.habilidadesSociales?.porcentaje ?? 0}">
            <label>Profesional:</label>
            <input id="hs_profesional" readonly value="${modulo.habilidadesSociales?.profesional ?? 0}">
          </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'Guardar cambios',
        cancelButtonText: 'Cancelar',
        didOpen: () => {
          calcProfesional('ae_paciente', 'ae_porcentaje', 'ae_profesional');
          calcProfesional('hs_paciente', 'hs_porcentaje', 'hs_profesional');
        },
        preConfirm: () => ({
          numero,
          valoresModulo: {
            paciente:  getNumberOrZero('fp_paciente'),
            direccion: getNumberOrZero('fp_direccion')
          },
          coordinadores: {
            nora: getNumberOrZero('coord_nora'),
            tete: getNumberOrZero('coord_tete')
          },
          profesionales: {
            senior: getNumberOrZero('prof_senior'),
            junior: getNumberOrZero('prof_junior')
          },
          areasExternas: {
            paciente:    getNumberOrZero('ae_paciente'),
            porcentaje:  getNumberOrZero('ae_porcentaje'),
            profesional: getNumberOrZero('ae_profesional')
          },
          habilidadesSociales: {
            paciente:    getNumberOrZero('hs_paciente'),
            porcentaje:  getNumberOrZero('hs_porcentaje'),
            profesional: getNumberOrZero('hs_profesional')
          }
        })
      });

      if (!formValues) return;

      const resUpdate = await apiFetch(`/modulos/${numero}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formValues)
      });
      const data = await resUpdate.json();

      if (resUpdate.ok) {
        Swal.fire('Éxito', 'Módulo actualizado correctamente', 'success');
        cargarListadoModulos(); // refrescar listado
      } else {
        Swal.fire('Error', data.error || 'No se pudo actualizar el módulo', 'error');
      }
    } catch (error) {
      console.error('Error al modificar módulo:', error);
      Swal.fire('Error', 'Ocurrió un error al cargar el módulo.', 'error');
    }
  };

  // 👉 Al entrar a la pantalla, cargamos el listado
  cargarListadoModulos();
});


// ==========================
// 🔐 Sesión, anti-back y helpers (igual que otras pantallas)
// ==========================
const LOGIN = 'index.html';
const goLogin = () => location.replace(LOGIN);

let usuarioSesion = null;
try { usuarioSesion = JSON.parse(localStorage.getItem('usuario') || 'null'); } catch { usuarioSesion = null; }
const token = localStorage.getItem('token');
if (!token) goLogin();

window.addEventListener('pageshow', (e) => {
  const nav = performance.getEntriesByType('navigation')[0];
  const fromBF = e.persisted || nav?.type === 'back_forward';
  if (fromBF && !localStorage.getItem('token')) goLogin();
});
history.pushState(null, '', location.href);
window.addEventListener('popstate', () => {
  if (!localStorage.getItem('token')) goLogin();
  else history.pushState(null, '', location.href);
});

if (usuarioSesion?.nombreApellido) {
  const userNameEl = document.getElementById('userName');
  if (userNameEl) userNameEl.textContent = usuarioSesion.nombreApellido;
}

// Si necesitás fetchAuth local (por si no usás apiFetch acá)
async function fetchAuth(url, options = {}) {
  const opts = {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
    },
    cache: 'no-store',
  };
  const res = await fetch(url, opts);
  if (res.status === 401) {
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
    goLogin();
    throw new Error('No autorizado');
  }
  return res;
}

const btnLogout = document.getElementById('btnLogout');
if (btnLogout) {
  btnLogout.addEventListener('click', () => {
    localStorage.clear();
    goLogin();
  });
}





