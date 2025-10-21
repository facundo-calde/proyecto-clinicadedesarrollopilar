const Usuario = require('../models/usuarios');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { PutObjectCommand } = require('@aws-sdk/client-s3');
const s3 = require('../lib/r2Client');

// Usa un solo secreto SIEMPRE
const JWT_SECRET = process.env.JWT_SECRET || 'supersecreto';

// Helpers
function parseMaybeJSON(val) {
  if (val == null) return val;
  if (typeof val !== 'string') return val;
  try { return JSON.parse(val); } catch { return val; }
}

async function subirArchivosR2(prefix, files = []) {
  const out = [];
  for (const f of files) {
    const safeName = (f.originalname || 'archivo').replace(/[^\w.\- ]+/g, '_');
    const key = `${prefix}/${Date.now()}_${safeName}`;

    await s3.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: key,
      Body: f.buffer,
      ContentType: f.mimetype
    }));

    out.push({
      tipo: 'general',
      nombre: f.originalname,
      mime: f.mimetype,
      size: f.size,
      url: `${process.env.R2_ENDPOINT}/${process.env.R2_BUCKET}/${key}`,
      fechaSubida: new Date()
    });
  }
  return out;
}

// Crear usuario (seguroMalaPraxis OPCIONAL)
exports.crearUsuario = async (req, res) => {
  try {
    const { body, files } = req;

    // Normalizar campos que pueden venir como string por multipart
    body.areasProfesional  = parseMaybeJSON(body.areasProfesional)  || [];
    body.areasCoordinadas  = parseMaybeJSON(body.areasCoordinadas)  || [];

    // Subir adjuntos (si vienen)
    const dniPrefix = (body.dni && String(body.dni).trim()) || 'sin-dni';
    const documentos = await subirArchivosR2(`usuarios/${dniPrefix}`, files || []);

    // seguro mala praxis opcional segun rol
    const isProf = body.rol === 'Profesional' || body.rol === 'Coordinador y profesional';
    const seguro = (body.seguroMalaPraxis ?? '').toString().trim();
    body.seguroMalaPraxis = isProf ? (seguro || undefined) : undefined;

    // hash de contraseña si vino
    let hashedPassword = body.contrasena;
    if (body.contrasena) {
      const salt = await bcrypt.genSalt(10);
      hashedPassword = await bcrypt.hash(body.contrasena, salt);
    }

    const nuevo = new Usuario({
      ...body,
      contrasena: hashedPassword,
      documentos
    });

    await nuevo.save();

    // ocultar hash
    nuevo.contrasena = undefined;
    return res.status(201).json(nuevo);
  } catch (err) {
    return res.status(500).json({ error: 'Error al crear usuario', detalles: err.message });
  }
};

// ==================================================
// Obtener todos los usuarios
// ==================================================
exports.obtenerUsuarios = async (_req, res) => {
  try {
    const lista = await Usuario.find().select('-contrasena');
    res.status(200).json(lista);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener usuarios' });
  }
};

// ==================================================
// Obtener usuario por ID
// ==================================================
exports.getUsuarioPorId = async (req, res) => {
  try {
    const usuario = await Usuario.findById(req.params.id).select('-contrasena');
    if (!usuario) return res.status(404).json({ error: 'No encontrado' });
    res.json(usuario);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener usuario' });
  }
};

// ==================================================
// Actualizar usuario (seguroMalaPraxis OPCIONAL)
// ==================================================
exports.actualizarUsuario = async (req, res) => {
  try {
    const { body, files } = req;

    // Normalizar campos (multipart → string)
    body.areasProfesional = parseMaybeJSON(body.areasProfesional) || [];
    body.areasCoordinadas = parseMaybeJSON(body.areasCoordinadas) || [];

    const usuario = await Usuario.findById(req.params.id);
    if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });

    // hash de contraseña sólo si vino
    if (body.contrasena) {
      const salt = await bcrypt.genSalt(10);
      body.contrasena = await bcrypt.hash(body.contrasena, salt);
    } else {
      delete body.contrasena;
    }

    // normalización de seguro (si viene)
    if (Object.prototype.hasOwnProperty.call(body, 'seguroMalaPraxis')) {
      const seguro = (body.seguroMalaPraxis ?? '').toString().trim();
      body.seguroMalaPraxis = seguro || undefined;
    }

    // si el rol final NO es profesional ni "coordinador y profesional", limpiar seguro
    const rolFinal = body.rol || usuario.rol;
    const tieneParteProfesional = (rolFinal === 'Profesional' || rolFinal === 'Coordinador y profesional');
    if (!tieneParteProfesional) {
      body.seguroMalaPraxis = undefined;
    }

    // Subir nuevos adjuntos (si vienen)
    const dniPrefix = (usuario.dni && String(usuario.dni).trim())
      || (body.dni && String(body.dni).trim())
      || 'sin-dni';

    const nuevosDocs = await subirArchivosR2(`usuarios/${dniPrefix}`, files || []);

    // aplicar cambios
    usuario.set(body);

    if (nuevosDocs.length) {
      usuario.documentos = Array.isArray(usuario.documentos)
        ? usuario.documentos.concat(nuevosDocs)
        : nuevosDocs;
    }

    await usuario.save();
    usuario.contrasena = undefined;
    return res.json(usuario);
  } catch (err) {
    return res.status(500).json({ error: 'Error al actualizar usuario', detalles: err.message });
  }
};

// ==================================================
// Eliminar usuario
// ==================================================
exports.eliminarUsuario = async (req, res) => {
  try {
    await Usuario.findByIdAndDelete(req.params.id);
    res.status(200).json({ mensaje: 'Usuario eliminado' });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar usuario' });
  }
};

// ==================================================
// Login con JWT
// ==================================================
exports.login = async (req, res) => {
  try {
    const usuarioBody = (req.body?.usuario || '').toLowerCase().trim();
    const emailBody   = (req.body?.email || '').toLowerCase().trim();
    const loginUsuario = usuarioBody || emailBody;

    const password = (req.body?.contrasena || req.body?.password || '').trim();

    if (!loginUsuario || !password) {
      return res.status(400).json({ error: 'Faltan credenciales' });
    }

    const user = await Usuario.findOne({
      $or: [{ usuario: loginUsuario }, { mail: loginUsuario }]
    });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    const hash = user.contrasena || user.passwordHash || user.clave;
    if (!hash) {
      return res.status(500).json({ error: 'Usuario sin contraseña configurada' });
    }

    const validPassword = await bcrypt.compare(password, hash);
    if (!validPassword) return res.status(401).json({ error: 'Contraseña incorrecta' });

    const token = jwt.sign(
      { id: user._id, usuario: user.usuario, rol: user.rol, nombreApellido: user.nombreApellido },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    const userData = user.toObject();
    delete userData.contrasena;
    delete userData.passwordHash;
    delete userData.clave;

    res.json({ mensaje: 'Login exitoso', user: userData, token });
  } catch (err) {
    console.error('Error en login:', err);
    res.status(500).json({ error: 'Error en login', detalles: err.message });
  }
};

// ==================================================
// Middleware de autenticación con JWT
// ==================================================
exports.authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization || req.headers['x-access-token'];
  if (!authHeader) return res.status(401).json({ error: 'Token requerido' });

  const token = authHeader.startsWith('Bearer ')
    ? authHeader.split(' ')[1]
    : authHeader;

  if (!token) return res.status(401).json({ error: 'Token inválido' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token no válido o expirado' });
  }
};
