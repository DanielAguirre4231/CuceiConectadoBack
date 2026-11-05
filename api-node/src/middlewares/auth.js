const jwt = require('jsonwebtoken');

const verifyToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Formato: Bearer <TOKEN>

  if (!token) {
    return res.status(401).json({ error: "Acceso denegado. Token no proporcionado." });
  }

  try {
    const verified = jwt.verify(token, process.env.JWT_SECRET || 'clave_secreta_cucei');
    req.user = verified;
    next();
  } catch (err) {
    res.status(403).json({ error: "Token inválido o expirado." });
  }
};

module.exports = verifyToken;