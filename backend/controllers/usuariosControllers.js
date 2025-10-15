const Usuario = require('../models/usuarios');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// Usa un solo secreto SIEMPRE
const JWT_SECRET = process.env.JWT_SECRET || 'supersecreto';

// ==================================================
// Crear usuario
// ==================================================
exports.crearUsuario = async (req, res) => {
  try {
    const { body, files } = req;

    let documentos = [];
    if (files && files.length > 0) {
      documentos = files.map(file => ({
        tipo: 'general',
        nombre: file.originalname,
        url: `/uploads/usuarios/${file.filename}`,
        fechaSubida: new Date()
      }));
    }

    // Validación de seguro para profesionales
    if (body.rol === 'Profesional' && (!body.seguroMalaPraxis || body.seguroMalaPraxis.trim() === '')) {
      return res.status(400).json({ error: 'El seguro de mala praxis es obligatorio para profesionales.' });
    }

    if (body.rol !== 'Profesional') {
      delete body.seguroMalaPraxis;
    }

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
    res.status(201).json(nuevo);
  } catch (err) {
    res.status(500).json({ error: 'Error al crear usuario', detalles: err.message });
  }
};


// ==================================================
// Obtener todos los usuarios
// ==================================================
exports.obtenerUsuarios = async (req, res) => {
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
// Actualizar usuario
// ==================================================
exports.actualizarUsuario = async (req, res) => {
  try {
    const { body, files } = req;

    let documentos = [];
    if (files && files.length > 0) {
      documentos = files.map(file => ({
        tipo: 'general',
        nombre: file.originalname,
        url: `/uploads/usuarios/${file.filename}`,
        fechaSubida: new Date()
      }));
    }

    const usuario = await Usuario.findById(req.params.id);
    if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });

    if (body.contrasena) {
      const salt = await bcrypt.genSalt(10);
      body.contrasena = await bcrypt.hash(body.contrasena, salt);
    } else {
      delete body.contrasena;
    }

    const rolFinal = body.rol || usuario.rol;
    if (rolFinal === 'Profesional') {
      if (!body.seguroMalaPraxis && !usuario.seguroMalaPraxis) {
        return res.status(400).json({ error: 'El seguro de mala praxis es obligatorio para profesionales.' });
      }
    } else {
      body.seguroMalaPraxis = undefined;
    }

    usuario.set(body);
    if (documentos.length > 0) {
      usuario.documentos = usuario.documentos.concat(documentos);
    }

    await usuario.save();
    usuario.contrasena = undefined;
    res.json(usuario);
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar usuario', detalles: err.message });
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




