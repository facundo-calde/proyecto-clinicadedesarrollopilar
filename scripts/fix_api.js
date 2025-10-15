const fs = require('fs');

function replaceIn(file, rules) {
  let s = fs.readFileSync(file, 'utf8');
  for (const [re, rep] of rules) s = s.replace(re, rep);
  fs.writeFileSync(file, s);
  console.log('✔', file);
}

// ----- pacientes.js -----
replaceIn('./Frontend/js/pacientes.js', [
  // /modulos y /areas (sin headers)
  [ /fetch\(`\$\{API_URL\.replace\(\"\/pacientes\", \"\/modulos\"\)\}`\)/g, 'apiFetch(`/modulos`)' ],
  [ /fetch\(`\$\{API_URL\.replace\(\"\/pacientes\", \"\/areas\"\)\}`\)/g,   'apiFetch(`/areas`)'   ],

  // /usuarios sin headers
  [ /fetch\(`\$\{API_URL\.replace\(\"\/pacientes\", \"\/usuarios\"\)\}`\)/g, 'apiFetch(`/usuarios`)' ],

  // /usuarios con headers: cambiamos solo el prefijo, dejamos el objeto intacto
  [ /fetch\(`\$\{API_URL\.replace\(\"\/pacientes\", \"\/usuarios\"\)\}`,\s*/g, 'apiFetch(`/usuarios`, ' ],

  // búsquedas con query
  [ /fetch\(`\$\{API_URL}\?nombre=/g, 'apiFetch(`/pacientes?nombre=' ],
]);

// ----- modulos.js -----
replaceIn('./Frontend/js/modulos.js', [
  // búsquedas con query
  [ /fetch\(`\$\{API_URL}\?numero=/g, 'apiFetch(`/modulos?numero=' ],
]);

// ----- usuarios.js (por si quedó algo colgado) -----
replaceIn('./Frontend/js/usuarios.js', [
  [ /fetchAuth\(`\$\{API}\/api\//g, 'apiFetch(`/' ],
]);

// ----- dashboard.js / index.js / modulos.js (${API}/api -> apiFetch) -----
for (const f of ['./Frontend/js/dashboard.js','./Frontend/js/index.js','./Frontend/js/modulos.js']) {
  replaceIn(f, [
    [ /fetch\(`\$\{API}\/api\//g, 'apiFetch(`/' ],
  ]);
}
