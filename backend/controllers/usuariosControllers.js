// backend/controllers/usuariosControllers.js
const Usuario = require('../models/usuarios');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'supersecreto';

// Helper: intenta parsear JSON si es string
function parseMaybeJSON(v) {
  if (v == null) return v;
  if (typeof v !== 'string') return v;
  try { return JSON.parse(v); } catch { return v; }
}

// Normaliza campos que pueden venir como JSON string en multipart
function normalizeMultipartBody(body) {
  body.areasProfesional  = parseMaybeJSON(body.areasProfesional);
  body.areasCoordinadas  = parseMaybeJSON(body.areasCoordinadas);
  // si vinieron strings vacíos, dejarlos como arrays vacíos
  if (body.areasProfesional  == null || body.areasProfesional === '')  body.areasProfesional = [];
  if (body.areasCoordinadas  == null || body.areasCoordinadas === '')  body.areasCoordinadas = [];
  return body;
}

// --------------------------------------------------
// Crear usuario
// --------------------------------------------------
exports.crearUsuario = async (req, res) => {
  try {
    const { body } = req;

    // si viene multipart, normalizamos posibles arrays
    normalizeMultipartBody(body);

    // documentos subidos (guardados por Multer en /uploads/usuarios)
    let documentos = [];
    if (req.files && req.files.length > 0) {
      documentos = req.files.map(file => ({
        tipo: 'general',
        nombre: file.originalname,
        url: `/uploads/usuarios/${file.filename}`,
        fechaSubida: new Date()
      }));
    }

    // seguro (opcional solo si es profesional)
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
    nuevo.contrasena = undefined;
    return res.status(201).json(nuevo);
  } catch (err) {
    console.error('crearUsuario error:', err);
    return res.status(500).json({ error: 'Error al crear usuario', detalles: err.message });
  }
};

// --------------------------------------------------
// Obtener todos
// --------------------------------------------------
exports.obtenerUsuarios = async (_req, res) => {
  try {
    const lista = await Usuario.find().select('-contrasena');
    res.status(200).json(lista);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener usuarios' });
  }
};

// --------------------------------------------------
// Obtener por ID
// --------------------------------------------------
exports.getUsuarioPorId = async (req, res) => {
  try {
    const usuario = await Usuario.findById(req.params.id).select('-contrasena');
    if (!usuario) return res.status(404).json({ error: 'No encontrado' });
    res.json(usuario);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener usuario' });
  }
};

// --------------------------------------------------
// Actualizar usuario
// --------------------------------------------------
exports.actualizarUsuario = async (req, res) => {
  try {
    const { body } = req;

    // si viene multipart, normalizamos posibles arrays
    normalizeMultipartBody(body);

    // anexar documentos si vinieron
    let documentos = [];
    if (req.files && req.files.length > 0) {
      documentos = req.files.map(file => ({
        tipo: 'general',
        nombre: file.originalname,
        url: `/uploads/usuarios/${file.filename}`,
        fechaSubida: new Date()
      }));
    }

    const usuario = await Usuario.findById(req.params.id);
    if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });

    // hash de contraseña sólo si vino
    if (body.contrasena) {
      const salt = await bcrypt.genSalt(10);
      body.contrasena = await bcrypt.hash(body.contrasena, salt);
    } else {
      delete body.contrasena;
    }

    // normalización de seguro (OPCIONAL)
    if (Object.prototype.hasOwnProperty.call(body, 'seguroMalaPraxis')) {
      const seguro = (body.seguroMalaPraxis ?? '').toString().trim();
      body.seguroMalaPraxis = seguro || undefined;
    }

    // si el rol final NO es profesional, limpiar seguro
    const rolFinal = body.rol || usuario.rol;
    const tieneParteProfesional = (rolFinal === 'Profesional' || rolFinal === 'Coordinador y profesional');
    if (!tieneParteProfesional) {
      body.seguroMalaPraxis = undefined;
    }

    // aplicar cambios
    usuario.set(body);

    if (documentos.length > 0) {
      usuario.documentos = (usuario.documentos || []).concat(documentos);
    }

    await usuario.save();
    usuario.contrasena = undefined;
    return res.json(usuario);
  } catch (err) {
    console.error('actualizarUsuario error:', err);
    return res.status(500).json({ error: 'Error al actualizar usuario', detalles: err.message });
  }
};

// --------------------------------------------------
// Eliminar
// --------------------------------------------------
exports.eliminarUsuario = async (req, res) => {
  try {
    await Usuario.findByIdAndDelete(req.params.id);
    res.status(200).json({ mensaje: 'Usuario eliminado' });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar usuario' });
  }
};

// --------------------------------------------------
// Login
// --------------------------------------------------
exports.login = async (req, res) => {
  try {
    const usuarioBody = (req.body?.usuario || '').toLowerCase().trim();
    const emailBody   = (req.body?.email   || '').toLowerCase().trim();
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
    if (!hash) return res.status(500).json({ error: 'Usuario sin contraseña configurada' });

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

// --------------------------------------------------
// Auth middleware
// --------------------------------------------------
exports.authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization || req.headers['x-access-token'];
  if (!authHeader) return res.status(401).json({ error: 'Token requerido' });

  const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : authHeader;
  if (!token) return res.status(401).json({ error: 'Token inválido' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Token no válido o expirado' });
  }
};
