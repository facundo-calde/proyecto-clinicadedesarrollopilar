// backend/controllers/usuariosControllers.js
const Usuario = require("../models/usuarios");
const bcrypt  = require("bcrypt");
const jwt     = require("jsonwebtoken");

// === R2 (Cloudflare) ===
const { uploadBuffer, deleteKey, buckets } = require("../lib/storageR2");

const JWT_SECRET = process.env.JWT_SECRET || "supersecreto";

/* ------------------------ Helpers ------------------------ */
function parseMaybeJSON(v) {
  if (v == null) return v;
  if (typeof v !== "string") return v;
  try { return JSON.parse(v); } catch { return v; }
}

// Normaliza body cuando viene por multipart/form-data o JSON
function normalizeBody(body) {
  // Arrays que pueden venir como JSON string
  body.areasProfesional = parseMaybeJSON(body.areasProfesional);
  body.areasCoordinadas = parseMaybeJSON(body.areasCoordinadas);
  if (body.areasProfesional == null || body.areasProfesional === "") body.areasProfesional = [];
  if (body.areasCoordinadas == null || body.areasCoordinadas === "") body.areasCoordinadas = [];

  // Trims + vacíos a undefined para campos opcionales
  [
    "jurisdiccion",
    "registroNacionalDePrestadores",
    "salarioAcuerdo","salarioAcuerdoObs",
    "fijoAcuerdo","fijoAcuerdoObs",
    "banco","cbu","numeroCuenta","numeroSucursal",
    "alias","nombreFiguraExtracto","tipoCuenta",
    "seguroMalaPraxis","pasanteNivel",
    "usuario","cuit","matricula","domicilio",
    "whatsapp","mail","dni","nombreApellido",
    "rol"
  ].forEach(k => {
    if (Object.prototype.hasOwnProperty.call(body, k)) {
      const val = (body[k] ?? "").toString().trim();
      body[k] = val === "" ? undefined : val;
    }
  });

  // normalizar algunos campos
  if (body.usuario) body.usuario = body.usuario.toLowerCase();
  if (body.mail)    body.mail    = body.mail.toLowerCase();

  return body;
}

// Aplica reglas según rol (profesional, coordinador, pasante)
function applyRoleCleaning(rol, body, currentDoc = null) {
  const esProfesional = rol === "Profesional" || rol === "Coordinador y profesional";
  const esCoordinador = rol === "Coordinador de área" || rol === "Coordinador y profesional";
  const esPasante     = rol === "Pasante";

  // Seguro sólo para roles con parte profesional
  if (!esProfesional) body.seguroMalaPraxis = undefined;

  // Pasante no usa áreas
  if (esPasante) {
    body.areasProfesional = [];
    body.areasCoordinadas = [];
  } else {
    if (!esProfesional) body.areasProfesional = [];
    if (!esCoordinador) body.areasCoordinadas = [];
  }

  // pasanteNivel sólo aplica a Pasante
  if (!esPasante) body.pasanteNivel = undefined;

  // En update: si no llegaron arrays y hay doc actual, conservar
  if (currentDoc) {
    if (!Array.isArray(body.areasProfesional) && currentDoc.areasProfesional) {
      body.areasProfesional = currentDoc.areasProfesional;
    }
    if (!Array.isArray(body.areasCoordinadas) && currentDoc.areasCoordinadas) {
      body.areasCoordinadas = currentDoc.areasCoordinadas;
    }
  }
}

// Extraer key de un URL de R2 (si es del bucket de usuarios)
function extractUsuariosKeyFromUrl(url) {
  try {
    // Busca el segmento "/<BUCKET_USUARIOS>/"
    const pivot = `/${buckets.usuarios}/`;
    const idx = url.indexOf(pivot);
    if (idx === -1) return null;
    return url.substring(idx + pivot.length);
  } catch {
    return null;
  }
}

/* ------------------------ Crear ------------------------ */
exports.crearUsuario = async (req, res) => {
  try {
    const { body } = req;
    normalizeBody(body);

    // Hash de contraseña si vino
    let hashedPassword = body.contrasena;
    if (body.contrasena) {
      const salt = await bcrypt.genSalt(10);
      hashedPassword = await bcrypt.hash(body.contrasena, salt);
    }

    // Limpieza por rol
    const rolFinal = body.rol;
    applyRoleCleaning(rolFinal, body);

    // Crear doc base (aún sin documentos)
    const nuevo = new Usuario({
      ...body, // incluye salarioAcuerdoObs, fijoAcuerdoObs, pasanteNivel, etc.
      contrasena: hashedPassword,
      documentos: []
    });

    // Guardamos primero para tener _id disponible para la key del archivo
    await nuevo.save();

    // Subir documentos a R2 (si vinieron) -> bucket de usuarios
    if (req.files && req.files.length > 0) {
      const uploaded = [];
      for (const file of req.files) {
        const key = `${nuevo._id}/${Date.now()}_${file.originalname}`;
        const url = await uploadBuffer({
          bucket: buckets.usuarios,
          key,
          buffer: file.buffer,
          contentType: file.mimetype
        });
        uploaded.push({
          tipo: "general",
          nombre: file.originalname,
          url,
          fechaSubida: new Date()
        });
      }
      nuevo.documentos = uploaded;
      await nuevo.save();
    }

    // Ocultar hash
    nuevo.contrasena = undefined;
    return res.status(201).json(nuevo);
  } catch (err) {
    console.error("crearUsuario error:", err);
    return res.status(500).json({ error: "Error al crear usuario", detalles: err.message });
  }
};

/* ------------------------ Listar ------------------------ */
exports.obtenerUsuarios = async (_req, res) => {
  try {
    const lista = await Usuario.find().select("-contrasena");
    res.status(200).json(lista);
  } catch (err) {
    res.status(500).json({ error: "Error al obtener usuarios" });
  }
};

/* ------------------------ Obtener por ID ------------------------ */
exports.getUsuarioPorId = async (req, res) => {
  try {
    const usuario = await Usuario.findById(req.params.id).select("-contrasena");
    if (!usuario) return res.status(404).json({ error: "No encontrado" });
    res.json(usuario);
  } catch (err) {
    res.status(500).json({ error: "Error al obtener usuario" });
  }
};

/* ------------------------ Actualizar ------------------------ */
exports.actualizarUsuario = async (req, res) => {
  try {
    const { body } = req;
    normalizeBody(body);

    const usuario = await Usuario.findById(req.params.id);
    if (!usuario) return res.status(404).json({ error: "Usuario no encontrado" });

    // Hash sólo si se envía nueva contraseña
    if (body.contrasena) {
      const salt = await bcrypt.genSalt(10);
      body.contrasena = await bcrypt.hash(body.contrasena, salt);
    } else {
      delete body.contrasena;
    }

    // Si mandan seguro, normalizar vacío->undefined
    if (Object.prototype.hasOwnProperty.call(body, "seguroMalaPraxis")) {
      const seguro = (body.seguroMalaPraxis ?? "").toString().trim();
      body.seguroMalaPraxis = seguro || undefined;
    }

    // Limpieza por rol (usar body.rol o el actual)
    const rolFinal = body.rol || usuario.rol;
    applyRoleCleaning(rolFinal, body, usuario);

    // Aplicar cambios de campos
    usuario.set(body);

    // Subir nuevos documentos (si hay) y concatenar
    if (req.files && req.files.length > 0) {
      const nuevosDocs = [];
      for (const file of req.files) {
        const key = `${usuario._id}/${Date.now()}_${file.originalname}`;
        const url = await uploadBuffer({
          bucket: buckets.usuarios,
          key,
          buffer: file.buffer,
          contentType: file.mimetype
        });
        nuevosDocs.push({
          tipo: "general",
          nombre: file.originalname,
          url,
          fechaSubida: new Date()
        });
      }
      usuario.documentos = (usuario.documentos || []).concat(nuevosDocs);
    }

    await usuario.save();
    usuario.contrasena = undefined;
    return res.json(usuario);
  } catch (err) {
    console.error("actualizarUsuario error:", err);
    return res.status(500).json({ error: "Error al actualizar usuario", detalles: err.message });
  }
};

/* ------------------------ Eliminar ------------------------ */
exports.eliminarUsuario = async (req, res) => {
  try {
    const usuario = await Usuario.findById(req.params.id);
    if (!usuario) return res.status(404).json({ error: "Usuario no encontrado" });

    // Intentar borrar documentos del bucket de usuarios (best-effort)
    if (Array.isArray(usuario.documentos) && usuario.documentos.length > 0) {
      const jobs = [];
      for (const doc of usuario.documentos) {
        if (doc?.url) {
          const key = extractUsuariosKeyFromUrl(doc.url);
          if (key) {
            jobs.push(
              deleteKey({ bucket: buckets.usuarios, key }).catch(() => null)
            );
          }
        }
      }
      await Promise.all(jobs);
    }

    await Usuario.findByIdAndDelete(req.params.id);
    res.status(200).json({ mensaje: "Usuario eliminado" });
  } catch (err) {
    res.status(500).json({ error: "Error al eliminar usuario" });
  }
};

/* ------------------------ Login ------------------------ */
exports.login = async (req, res) => {
  try {
    const usuarioBody = (req.body?.usuario || "").toLowerCase().trim();
    const emailBody   = (req.body?.email   || "").toLowerCase().trim();
    const loginUsuario = usuarioBody || emailBody;

    const password = (req.body?.contrasena || req.body?.password || "").trim();
    if (!loginUsuario || !password) {
      return res.status(400).json({ error: "Faltan credenciales" });
    }

    const user = await Usuario.findOne({
      $or: [{ usuario: loginUsuario }, { mail: loginUsuario }]
    });
    if (!user) return res.status(404).json({ error: "Usuario no encontrado" });

    const hash = user.contrasena || user.passwordHash || user.clave;
    if (!hash) return res.status(500).json({ error: "Usuario sin contraseña configurada" });

    const validPassword = await bcrypt.compare(password, hash);
    if (!validPassword) return res.status(401).json({ error: "Contraseña incorrecta" });

    const token = jwt.sign(
      { id: user._id, usuario: user.usuario, rol: user.rol, nombreApellido: user.nombreApellido },
      JWT_SECRET,
      { expiresIn: "8h" }
    );

    const userData = user.toObject();
    delete userData.contrasena;
    delete userData.passwordHash;
    delete userData.clave;

    res.json({ mensaje: "Login exitoso", user: userData, token });
  } catch (err) {
    console.error("Error en login:", err);
    res.status(500).json({ error: "Error en login", detalles: err.message });
  }
};

/* ------------------------ Auth middleware ------------------------ */
exports.authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization || req.headers["x-access-token"];
  if (!authHeader) return res.status(401).json({ error: "Token requerido" });

  const token = authHeader.startsWith("Bearer ") ? authHeader.split(" ")[1] : authHeader;
  if (!token) return res.status(401).json({ error: "Token inválido" });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: "Token no válido o expirado" });
  }
};

