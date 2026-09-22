// Registro automático de ingresos en contabilidad cuando se cierra una cuenta
// (mesa, domicilio o recoger). Ver routes/accounting.js para el resto del
// módulo (bancos, gastos, resumen/P&L).
const { v4: uuidv4 } = require('uuid');

async function recordSaleIncome(db, closedOrder) {
  if (!closedOrder || !closedOrder.total) return null;

  const defaultAccount = await db.get(
    `SELECT * FROM bank_accounts WHERE restaurant_id = ? AND is_default_sales_account = 1 LIMIT 1`,
    [closedOrder.restaurant_id]
  );

  const id = uuidv4();
  const description = closedOrder.table_name
    ? `Venta — ${closedOrder.table_name}`
    : `Venta — ${closedOrder.channel === 'domicilio' ? 'domicilio' : 'recoger'}${closedOrder.customer_name ? ' — ' + closedOrder.customer_name : ''}`;

  await db.run(`
    INSERT INTO transactions (id, restaurant_id, bank_account_id, type, description, amount, source, order_id)
    VALUES (?, ?, ?, 'ingreso', ?, ?, 'venta', ?)
  `, [id, closedOrder.restaurant_id, defaultAccount ? defaultAccount.id : null, description, closedOrder.total, closedOrder.id]);

  return id;
}

module.exports = { recordSaleIncome };
