// ==========================
// MÓDULOS – Frontend
// ==========================

document.addEventListener('DOMContentLoaded', () => {
  const botonCargar     = document.getElementById('btnCargarModulo');
  const inputBusqueda   = document.getElementById('busquedaModulo');
  const sugerencias     = document.getElementById('sugerencias');
  const contenedorFicha = document.getElementById('fichaModuloContainer');
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
      const res = await apiFetch('/modulos');
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
        <td>$${Number(m.valorPadres ?? 0).toLocaleString()}</td>
        <td>${Array.isArray(m.profesionales) ? m.profesionales.length : 0}</td>
        <td>${Array.isArray(m.coordinadores) ? m.coordinadores.length : 0}</td>
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
              <th>Valor padres</th>
              <th># Profesionales</th>
              <th># Coordinadores</th>
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

  function mostrarFichaModulo(modulo) {
    contenedorFicha.innerHTML = `
      <div class="table-container">
        <table class="modulo-detalle">
          <thead>
            <tr>
              <th>Módulo</th>
              <th>Valor padres</th>
              <th># Profesionales</th>
              <th># Coordinadores</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>${modulo.numero}</td>
              <td>$${Number(modulo.valorPadres ?? 0).toLocaleString()}</td>
              <td>${Array.isArray(modulo.profesionales) ? modulo.profesionales.length : 0}</td>
              <td>${Array.isArray(modulo.coordinadores) ? modulo.coordinadores.length : 0}</td>
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

 // ---------- Crear módulo (una columna | Fonoaudiología + Psicopedagogía | muestra Área — Nivel + ARS) ----------
if (botonCargar) {
  botonCargar.addEventListener('click', async () => {
    // 0) Helper ARS
    const formatARS = (v) => new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
      minimumFractionDigits: 2
    }).format(Number.isFinite(v) ? v : 0);

    // 1) Traer usuarios
    let usuarios = [];
    try {
      const res = await apiFetch('/usuarios', { method: 'GET' });
      if (res.ok) usuarios = await res.json();
    } catch (e) { console.warn('No se pudieron obtener usuarios:', e); }

    // ===== Helpers =====
    const fullName = (u) => {
      const cands = [
        u.nombreApellido, u.apellidoNombre, u.nombreCompleto,
        [u.apellido, u.nombre].filter(Boolean).join(', '),
        [u.nombre, u.apellido].filter(Boolean).join(' '),
        u.nombre, u.apellido, u.displayName, u.usuario, u.email
      ].map(x => (x || '').toString().trim()).filter(Boolean);
      return cands[0] || 'Sin nombre';
    };
    const arr = (v) => Array.isArray(v) ? v : (v ? [v] : []);

    // --- Áreas (usa backend si lo manda, si no reconstruye) ---
    const normAreaEntry = (x) => {
      if (!x) return null;
      if (typeof x === 'string') return { nombre: x.trim(), nivel: '' };
      if (typeof x === 'object') {
        const nombre = (x.nombre || x.name || x.titulo || x.area || '').toString().trim();
        const nivel  = (
          x.nivel ?? x.Nivel ?? x.nivelArea ?? x.nivel_area ??
          x.nivelProfesional ?? x.grado ?? x.categoria ?? x.seniority ?? ''
        ).toString().trim();
        if (!nombre && !nivel) return null;
        return { nombre, nivel };
      }
      return null;
    };
    const pairAreasLevels = (areas = [], niveles = []) =>
      areas.map((a, i) => {
        const nombre = (typeof a === 'string' ? a : (a?.nombre || a?.name || a?.area || '')).toString().trim();
        const nivel  = (niveles[i] ?? a?.nivel ?? a?.nivelProfesional ?? '').toString().trim();
        if (!nombre && !nivel) return null;
        return { nombre, nivel };
      }).filter(Boolean);

    const getAreasDetailed = (u) => {
      const profDet  = Array.isArray(u.areasProfesionalDetalladas) ? u.areasProfesionalDetalladas : [];
      const coordDet = Array.isArray(u.areasCoordinadasDetalladas) ? u.areasCoordinadasDetalladas : [];
      let list = [...profDet, ...coordDet].map(normAreaEntry).filter(Boolean);
      if (list.length) return list;

      const pools = [u.areasProfesional, u.areasCoordinadas, u.areas, u.area, u.areaPrincipal];
      list = pools.flatMap(arr).map(normAreaEntry).filter(Boolean);

      const paralelos = [
        ['areasProfesional', 'nivelesProfesional'],
        ['areasCoordinadas', 'nivelesCoordinadas'],
        ['areas', 'nivelesAreas'],
      ];
      paralelos.forEach(([aKey, nKey]) => {
        const A = arr(u?.[aKey]); const N = arr(u?.[nKey]);
        if (A.length && N.length) list = list.concat(pairAreasLevels(A, N));
      });

      if (!list.some(a => a.nivel)) {
        const userLevel = (
          u.nivelRol || u.nivel || u.nivelProfesional || u.categoria || u.grado || u.seniority || u.pasanteNivel || ''
        ).toString().trim();
        if (userLevel) list = list.map(a => ({ ...a, nivel: a.nivel || userLevel }));
      }

      const seen = new Set();
      list = list.filter(a => { const k = `${a.nombre}|${a.nivel}`; if (seen.has(k)) return false; seen.add(k); return true; });
      return list;
    };

    // Filtro por Fonoaudiología + Psicopedagogía
    const isFono     = (s='') => /fonoaudiolog[ií]a/i.test(s);
    const isPsicoPed = (s='') => /psicopedagog[ií]a/i.test(s);
    const hasAreaFP  = (u) => getAreasDetailed(u).some(a => isFono(a.nombre) || isPsicoPed(a.nombre));

    const getAreaPrincipalWithLevel = (u) => {
      const list = getAreasDetailed(u);
      if (!list.length) return { nombre: '', nivel: '' };
      return list.find(a => isFono(a.nombre)) || list.find(a => isPsicoPed(a.nombre)) || list[0];
    };

    const formatAllAreas = (u) => {
      const list = getAreasDetailed(u);
      return list.map(a => a.nivel ? `${a.nombre} — ${a.nivel}` : a.nombre).join(' | ');
    };

    // Roles canónicos
    const mapRolCanonical = (r = '') => {
      const s = String(r).trim().toLowerCase();
      switch (s) {
        case 'directoras':                   return 'directora';
        case 'coordinador y profesional':    return 'coord_y_prof';
        case 'coordinador de área':
        case 'coordinador de area':          return 'coordinador';
        case 'profesional':                  return 'profesional';
        case 'pasante':                      return 'pasante';
        default:                             return s;
      }
    };
    const rolesCanonicos = (u) => {
      const crudos = [u.rol, u.role, u.cargo, ...(Array.isArray(u.roles) ? u.roles : [])].filter(Boolean);
      const expandidos = crudos.flatMap(r => {
        const canon = mapRolCanonical(r);
        return canon === 'coord_y_prof' ? ['coordinador', 'profesional'] : [canon];
      });
      return new Set(expandidos);
    };
    const hasRolCanon = (u, ...wanted) => {
      const R = rolesCanonicos(u);
      return wanted.some(w => R.has(w));
    };

    // 2) Filtrar candidatos / buckets
    const candidatos    = usuarios.filter(u => hasAreaFP(u));
    const profesionales = candidatos.filter(u => hasRolCanon(u, 'profesional'));
    const coordinadores = candidatos.filter(u => hasRolCanon(u, 'coordinador', 'directora'));
    const pasantes      = candidatos.filter(u => hasRolCanon(u, 'pasante'));

    // 3) UI: una sola columna con Área — Nivel visible (con fallback de nivel)
    const renderRows = (arr, rolKey, titulo) => {
      if (!arr.length) return `<div class="empty">No hay ${titulo} en esas áreas</div>`;
      return `
        <div class="section-title">${titulo}</div>
        ${arr
          .sort((a,b)=>fullName(a).localeCompare(fullName(b), 'es'))
          .map(u => {
            const principal = getAreaPrincipalWithLevel(u);           // {nombre, nivel}
            const allAreas  = formatAllAreas(u);                       // tooltip
            const nivelFallback = (
              principal.nivel ||
              (Array.isArray(u.nivelesProfesional) && u.nivelesProfesional[0]) ||
              (Array.isArray(u.nivelesCoordinadas) && u.nivelesCoordinadas[0]) ||
              u.nivelRol || u.nivelProfesional || u.nivel || u.seniority || u.categoria || u.grado || u.pasanteNivel || ''
            ).toString().trim();

            const badgeText = [principal.nombre, nivelFallback].filter(Boolean).join(' — ');

            return `
              <div class="person-row">
                <div class="name">
                  ${fullName(u)}
                  ${badgeText ? `<span class="area-badge" title="${allAreas}">${badgeText}</span>` : ''}
                </div>
                <input type="number" min="0" step="0.01"
                       class="monto-input"
                       data-rol="${rolKey}"
                       data-user="${u._id}"
                       placeholder="${formatARS(0)}" />
              </div>
            `;
          }).join('')}
      `;
    };

    const { value: formValues } = await Swal.fire({
      title: 'Cargar nuevo módulo',
      width: '700px',
      html: `
        <style>
          .form-col{display:flex;flex-direction:column;gap:14px}
          .section-title{font-weight:700;margin:10px 0 4px}
          .person-row{display:grid;grid-template-columns:1fr 140px;gap:8px;align-items:center;border-bottom:1px dashed #eee;padding:4px 0}
          .person-row:last-child{border-bottom:none}
          .name{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
          .area-badge{display:inline-block;margin-left:8px;padding:2px 6px;font-size:11px;line-height:1;border:1px solid #e5e7eb;border-radius:999px;background:#f8fafc;color:#334155;vertical-align:middle;max-width:280px;text-overflow:ellipsis;overflow:hidden}
          .empty{color:#888;font-style:italic;padding:6px}
          .swal2-input{width:100%}
          .panel{border:1px solid #e5e7eb;border-radius:10px;padding:10px;max-height:340px;overflow:auto}
          .money-hint{font-size:12px;color:#555;margin-top:4px}
        </style>

        <div class="form-col">
          <div>
            <label for="modulo_numero"><strong>Número del módulo:</strong></label>
            <input id="modulo_numero" type="number" min="0" step="1" class="swal2-input" placeholder="Ej: 101">
          </div>
          <div>
            <label for="valor_padres"><strong>Pagan los padres (valor del módulo):</strong></label>
            <input id="valor_padres" type="number" min="0" step="0.01" class="swal2-input" placeholder="${formatARS(0)}">
          </div>

          <div class="section-title">VALORES FONOAUDIOLOGÍA - PSICOPEDAGOGÍA</div>
          <div class="panel">
            ${renderRows(profesionales, 'profesional', 'Profesionales')}
            ${renderRows(coordinadores, 'coordinador', 'Coordinadores')}
            ${renderRows(pasantes, 'pasante', 'Pasantes')}
          </div>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Guardar',
      cancelButtonText: 'Cancelar',
      preConfirm: () => {
        const numeroEl = document.getElementById('modulo_numero');
        const padresEl = document.getElementById('valor_padres');

        const numero = parseInt(numeroEl.value, 10);
        const valorPadres = Number(padresEl.value);
        if (Number.isNaN(numero)) return Swal.showValidationMessage('⚠️ El número del módulo es obligatorio');

        const take = (rol) => [...document.querySelectorAll(`.monto-input[data-rol="${rol}"]`)]
          .map(i => ({ usuario: i.dataset.user, monto: Number(i.value) || 0 }))
          .filter(x => x.usuario && x.monto > 0);

        // SIN validación de suma vs. valorPadres (se puede cargar 100%, parcial o 0)
        return {
          numero,
          valorPadres: Number.isNaN(valorPadres) ? 0 : valorPadres,
          profesionales: take('profesional'),
          coordinadores: take('coordinador'),
          pasantes: take('pasante')
        };
      }
    });

    if (!formValues) return;

    // 4) Guardar
    try {
      const res = await apiFetch(`/modulos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formValues)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'No se pudo guardar');

      Swal.fire('Éxito', 'Módulo guardado correctamente', 'success');
      cargarListadoModulos();
    } catch (error) {
      console.error('Error guardando módulo:', error);
      Swal.fire('Error', error?.message || 'Ocurrió un error al guardar', 'error');
    }
  });
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
        cargarListadoModulos();
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

          <div class="grupo-bloque azul">
            <h4>VALORES FONOAUDIOLOGÍA - PSICOLOGÍA</h4>
            <label>Paciente:</label>
            <input id="fp_paciente"   value="${modulo.valoresModulo?.paciente ?? 0}">
            <label>Dirección:</label>
            <input id="fp_direccion"  value="${modulo.valoresModulo?.direccion ?? 0}">
          </div>

          <div class="grupo-bloque azul">
            <h4>FIJO COORDINADORES</h4>
            <label>Nora:</label>
            <input id="coord_nora"  value="${modulo.coordinadores?.nora ?? 0}">
            <label>Tete:</label>
            <input id="coord_tete"  value="${modulo.coordinadores?.tete ?? 0}">
          </div>

          <div class="grupo-bloque azul">
            <h4>FIJO PROFESIONALES</h4>
            <label>Senior:</label>
            <input id="prof_senior" value="${modulo.profesionales?.senior ?? 0}">
            <label>Junior:</label>
            <input id="prof_junior" value="${modulo.profesionales?.junior ?? 0}">
          </div>

          <div class="grupo-bloque verde">
            <h4>ÁREAS EXTERNAS</h4>
            <label>Paciente:</label>
            <input id="ae_paciente"    value="${modulo.areasExternas?.paciente ?? 0}">
            <label>%:</label>
            <input id="ae_porcentaje"  value="${modulo.areasExternas?.porcentaje ?? 0}">
            <label>Profesional:</label>
            <input id="ae_profesional" readonly value="${modulo.areasExternas?.profesional ?? 0}">
          </div>

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
        cargarListadoModulos();
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
// 🔐 Sesión, anti-back y helpers
// ==========================
const LOGIN = 'index.html';
const goLogin = () => location.replace(LOGIN);

let usuarioSesion = null;
try {
  usuarioSesion = JSON.parse(localStorage.getItem('usuario') || 'null');
} catch {
  usuarioSesion = null;
}
const token = localStorage.getItem('token');
if (!token) goLogin();

window.addEventListener('pageshow', (e) => {
  const nav = performance.getEntriesByType('navigation')[0];
  const fromBF = e.persisted || (nav && nav.type === 'back_forward');
  if (fromBF && !localStorage.getItem('token')) goLogin();
});
history.pushState(null, '', location.href);
window.addEventListener('popstate', () => {
  if (!localStorage.getItem('token')) goLogin();
  else history.pushState(null, '', location.href);
});

if (usuarioSesion && usuarioSesion.nombreApellido) {
  const userNameEl = document.getElementById('userName');
  if (userNameEl) userNameEl.textContent = usuarioSesion.nombreApellido;
}

// fetchAuth local (si no usás apiFetch)
async function fetchAuth(url, options = {}) {
  const opts = {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${localStorage.getItem('token') || ''}`
    },
    cache: 'no-store'
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





