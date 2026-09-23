const express = require('express');
const db = require('../db');
const { authMiddleware, requireRole } = require('../auth');
const { requireActiveSubscription } = require('../services/billing');
const ah = require('../utils/asyncHandler');

const router = express.Router();
router.use(authMiddleware);
router.use(requireActiveSubscription);

const FIELDS = 'id, name, country, currency, currency_symbol, tax_name, tax_rate, service_charge_rate';

// Configuración general del restaurante: impuesto local y % de servicio
// opcional. El % de servicio no es un impuesto: depende de cada país/negocio
// (ej. en Colombia es común un 10% de "servicio" voluntario), por eso queda
// en 0 (desactivado) hasta que el admin lo active.
router.get('/', ah(async (req, res) => {
  const restaurant = await db.get(`SELECT ${FIELDS} FROM restaurants WHERE id = ?`, [req.user.restaurant_id]);
  res.json(restaurant);
}));

router.put('/', requireRole('admin'), ah(async (req, res) => {
  const { taxName, taxRate, serviceChargeRate } = req.body;
  if (serviceChargeRate != null && (serviceChargeRate < 0 || serviceChargeRate > 100)) {
    return res.status(400).json({ error: 'El % de servicio debe estar entre 0 y 100' });
  }
  if (taxRate != null && (taxRate < 0 || taxRate > 100)) {
    return res.status(400).json({ error: `El % de ${taxName || 'impuesto'} debe estar entre 0 y 100` });
  }
  await db.run(`
    UPDATE restaurants SET
      tax_name = COALESCE(?, tax_name),
      tax_rate = COALESCE(?, tax_rate),
      service_charge_rate = COALESCE(?, service_charge_rate)
    WHERE id = ?
  `, [taxName, taxRate, serviceChargeRate, req.user.restaurant_id]);

  const restaurant = await db.get(`SELECT ${FIELDS} FROM restaurants WHERE id = ?`, [req.user.restaurant_id]);
  res.json(restaurant);
}));

module.exports = router;
