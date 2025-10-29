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

 /// ---------- Crear módulo (una columna | Fonoaudiología + Psicopedagogía | muestra Área — Nivel + ARS) ----------
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
    const candidatos       = usuarios.filter(u => hasRolCanon(u, 'profesional', 'coordinador', 'directora', 'pasante'));
    const candidatosFP     = candidatos.filter(u => hasAreaFP(u));     // Internos (Fonoaudiología / Psicopedagogía)
    const candidatosExtern = candidatos.filter(u => !hasAreaFP(u));    // Externos (todas las demás áreas)

    // Internos
    const profesionales     = candidatosFP.filter(u => hasRolCanon(u, 'profesional'));
    const coordinadores     = candidatosFP.filter(u => hasRolCanon(u, 'coordinador', 'directora'));
    const pasantes          = candidatosFP.filter(u => hasRolCanon(u, 'pasante'));
    // Externos
    const profesionalesExt  = candidatosExtern.filter(u => hasRolCanon(u, 'profesional'));
    const coordinadoresExt  = candidatosExtern.filter(u => hasRolCanon(u, 'coordinador', 'directora'));
    const pasantesExt       = candidatosExtern.filter(u => hasRolCanon(u, 'pasante'));

    // 3) UI: una sola columna con Área — Nivel visible (con fallback de nivel)
    const renderRows = (arr, rolKey, titulo, scope) => {
      if (!arr.length) return `<div class="empty">No hay ${titulo}</div>`;
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
                       data-scope="${scope}"
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
          .divider{height:1px;background:#e5e7eb;margin:14px 0}
          .block-title{font-size:13px;color:#111;margin:6px 0 4px;font-weight:700}
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

          <div class="block-title">VALORES FONOAUDIOLOGÍA - PSICOPEDAGOGÍA</div>
          <div class="panel">
            ${renderRows(profesionales, 'profesional', 'Profesionales', 'interno')}
            ${renderRows(coordinadores, 'coordinador', 'Coordinadores', 'interno')}
            ${renderRows(pasantes, 'pasante', 'Pasantes', 'interno')}
          </div>

          <div class="divider"></div>

          <div class="block-title">ÁREAS EXTERNAS (otras áreas)</div>
          <div class="panel">
            ${renderRows(profesionalesExt, 'profesional', 'Profesionales', 'externo')}
            ${renderRows(coordinadoresExt, 'coordinador', 'Coordinadores', 'externo')}
            ${renderRows(pasantesExt, 'pasante', 'Pasantes', 'externo')}
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

        const take = (rol, scope) => [...document.querySelectorAll(`.monto-input[data-rol="${rol}"][data-scope="${scope}"]`)]
          .map(i => ({ usuario: i.dataset.user, monto: Number(i.value) || 0 }))
          .filter(x => x.usuario && x.monto > 0);

        // SIN validación de suma vs. valorPadres (se puede cargar 100%, parcial o 0)
        return {
          numero,
          valorPadres: Number.isNaN(valorPadres) ? 0 : valorPadres,

          // Internos (Fono / PsicoPed)
          profesionales: take('profesional', 'interno'),
          coordinadores: take('coordinador', 'interno'),
          pasantes:      take('pasante',     'interno'),

          // Externos (otras áreas)
          profesionalesExternos: take('profesional', 'externo'),
          coordinadoresExternos: take('coordinador', 'externo'),
          pasantesExternos:      take('pasante',     'externo'),
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
// === Editar módulo (compatible con la UI de "Crear módulo") ===
window.modificarModulo = async (numero) => {
  try {
    // 0) Helpers base
    const formatARS = (v) => new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
      minimumFractionDigits: 2
    }).format(Number.isFinite(v) ? v : 0);

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

    // 1) Traer módulo y usuarios
    const [resModulo, resUsers] = await Promise.all([
      apiFetch(`/modulos/${numero}`),
      apiFetch(`/usuarios`, { method: 'GET' })
    ]);
    const modulo   = await resModulo.json();
    if (!resModulo.ok) throw new Error(modulo?.error || 'No se pudo obtener el módulo');

    let usuarios = [];
    if (resUsers.ok) usuarios = await resUsers.json();

    // 2) Armar buckets internos/externos (mismo criterio que "crear")
    const candidatos       = usuarios.filter(u => hasRolCanon(u, 'profesional', 'coordinador', 'directora', 'pasante'));
    const candidatosFP     = candidatos.filter(u => hasAreaFP(u));     // Internos
    const candidatosExtern = candidatos.filter(u => !hasAreaFP(u));    // Externos

    // Internos
    const profesionales     = candidatosFP.filter(u => hasRolCanon(u, 'profesional'));
    const coordinadores     = candidatosFP.filter(u => hasRolCanon(u, 'coordinador', 'directora'));
    const pasantes          = candidatosFP.filter(u => hasRolCanon(u, 'pasante'));
    // Externos
    const profesionalesExt  = candidatosExtern.filter(u => hasRolCanon(u, 'profesional'));
    const coordinadoresExt  = candidatosExtern.filter(u => hasRolCanon(u, 'coordinador', 'directora'));
    const pasantesExt       = candidatosExtern.filter(u => hasRolCanon(u, 'pasante'));

    // 3) Mapear montos ya guardados para prefills
    const toMap = (arr=[]) => {
      const m = new Map();
      arr.forEach(x => { if (x?.usuario) m.set(String(x.usuario._id || x.usuario), Number(x.monto)||0); });
      return m;
    };
    const mapInterno = {
      profesional: toMap(modulo.profesionales || []),
      coordinador: toMap(modulo.coordinadores || []),
      pasante:     toMap(modulo.pasantes || [])
    };
    const mapExterno = {
      profesional: toMap(modulo.profesionalesExternos || []),
      coordinador: toMap(modulo.coordinadoresExternos || []),
      pasante:     toMap(modulo.pasantesExternos || [])
    };
    const getMonto = (scope, rol, userId) =>
      (scope === 'interno' ? mapInterno[rol] : mapExterno[rol]).get(String(userId)) || 0;

    // 4) Render rows (con value prellenado)
    const renderRows = (arrUsers, rolKey, titulo, scope) => {
      if (!arrUsers.length) return `<div class="empty">No hay ${titulo}</div>`;
      return `
        <div class="section-title">${titulo}</div>
        ${arrUsers
          .sort((a,b)=>fullName(a).localeCompare(fullName(b), 'es'))
          .map(u => {
            const principal = getAreaPrincipalWithLevel(u);
            const allAreas  = formatAllAreas(u);
            const nivelFallback = (
              principal.nivel ||
              (Array.isArray(u.nivelesProfesional) && u.nivelesProfesional[0]) ||
              (Array.isArray(u.nivelesCoordinadas) && u.nivelesCoordinadas[0]) ||
              u.nivelRol || u.nivelProfesional || u.nivel || u.seniority || u.categoria || u.grado || u.pasanteNivel || ''
            ).toString().trim();

            const badgeText = [principal.nombre, nivelFallback].filter(Boolean).join(' — ');
            const val = getMonto(scope, rolKey, u._id);

            return `
              <div class="person-row">
                <div class="name">
                  ${fullName(u)}
                  ${badgeText ? `<span class="area-badge" title="${allAreas}">${badgeText}</span>` : ''}
                </div>
                <input type="number" min="0" step="0.01"
                       class="monto-input"
                       data-rol="${rolKey}"
                       data-scope="${scope}"
                       data-user="${u._id}"
                       placeholder="${formatARS(0)}"
                       value="${val > 0 ? val : ''}" />
              </div>
            `;
          }).join('')}
      `;
    };

    // 5) Modal edición
    const { value: formValues } = await Swal.fire({
      title: `Modificar módulo ${numero}`,
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
          .divider{height:1px;background:#e5e7eb;margin:14px 0}
          .block-title{font-size:13px;color:#111;margin:6px 0 4px;font-weight:700}
        </style>

        <div class="form-col">
          <div>
            <label for="modulo_numero"><strong>Número del módulo:</strong></label>
            <input id="modulo_numero" type="number" class="swal2-input" value="${modulo.numero}" disabled>
          </div>
          <div>
            <label for="valor_padres"><strong>Pagan los padres (valor del módulo):</strong></label>
            <input id="valor_padres" type="number" min="0" step="0.01" class="swal2-input" placeholder="${formatARS(0)}" value="${Number(modulo.valorPadres)||0}">
          </div>

          <div class="block-title">VALORES FONOAUDIOLOGÍA - PSICOPEDAGOGÍA</div>
          <div class="panel">
            ${renderRows(profesionales, 'profesional', 'Profesionales', 'interno')}
            ${renderRows(coordinadores, 'coordinador', 'Coordinadores', 'interno')}
            ${renderRows(pasantes, 'pasante', 'Pasantes', 'interno')}
          </div>

          <div class="divider"></div>

          <div class="block-title">ÁREAS EXTERNAS (otras áreas)</div>
          <div class="panel">
            ${renderRows(profesionalesExt, 'profesional', 'Profesionales', 'externo')}
            ${renderRows(coordinadoresExt, 'coordinador', 'Coordinadores', 'externo')}
            ${renderRows(pasantesExt, 'pasante', 'Pasantes', 'externo')}
          </div>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Guardar cambios',
      cancelButtonText: 'Cancelar',
      preConfirm: () => {
        const padresEl = document.getElementById('valor_padres');
        const valorPadres = Number(padresEl.value);

        const take = (rol, scope) => [...document.querySelectorAll(`.monto-input[data-rol="${rol}"][data-scope="${scope}"]`)]
          .map(i => ({ usuario: i.dataset.user, monto: Number(i.value) || 0 }))
          .filter(x => x.usuario && x.monto > 0);

        return {
          numero,
          valorPadres: Number.isNaN(valorPadres) ? 0 : valorPadres,

          // Internos (Fono/Psico)
          profesionales: take('profesional', 'interno'),
          coordinadores: take('coordinador', 'interno'),
          pasantes:      take('pasante',     'interno'),

          // Externos
          profesionalesExternos: take('profesional', 'externo'),
          coordinadoresExternos: take('coordinador', 'externo'),
          pasantesExternos:      take('pasante',     'externo'),
        };
      }
    });

    if (!formValues) return;

    // 6) Guardar (PUT por número)
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





