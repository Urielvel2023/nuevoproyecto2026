const crypto = require('crypto');
const { JWT_SECRET } = require('../auth');

// Token determinístico por restaurante (HMAC), usado para autenticar el
// webhook público de apps de domicilios sin tener que guardar un secreto
// aparte en la base de datos.
function webhookToken(restaurantId) {
  return crypto.createHmac('sha256', JWT_SECRET).update(restaurantId).digest('hex').slice(0, 32);
}

module.exports = { webhookToken };
