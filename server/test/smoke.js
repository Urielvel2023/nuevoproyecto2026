// Prueba de humo de la API completa: registro, permisos por departamento, mesas,
// pedidos, descuentos con PIN, unir/transferir, pagos divididos, cierre,
// inventario, bitácora, bloqueo por intentos y cumplimiento legal.
// Uso: con el servidor corriendo y una base de datos vacía,
//   BASE_URL=http://localhost:4000 npm run test:smoke
const B = (process.env.BASE_URL || 'http://localhost:4000') + '/api';
let fails = 0;
async function call(method, path, token, body, expect = 200) {
  const r = await fetch(B + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  const ok = r.status === expect;
  if (!ok) fails++;
  console.log(ok ? 'OK ' : 'FAIL', method, path, r.status, ok ? '' : JSON.stringify(j));
  return j;
}
(async () => {
  const reg = await call('POST', '/auth/register-restaurant', null, { restaurantName: 'Living', country: 'VE', currency: 'VES', currencySymbol: 'Bs', taxName: 'IVA', taxRate: 16, adminName: 'Dueño', email: 'a@x.com', password: 'clave1234', terraceTables: 12, acceptTerms: true });
  const A = reg.token;
  const tables = await call('GET', '/orders/tables', A);
  const z = tables.reduce((m, t) => (m[t.zone] = (m[t.zone] || 0) + 1, m), {});
  console.log('zonas', z, 'perm admin modules', Object.keys(reg.permissions).length);
  // staff
  await call('POST', '/auth/create-staff', A, { name: 'Gere', email: 'g@x.com', password: 'clave1234', role: 'gerencia' });
  await call('POST', '/auth/create-staff', A, { name: 'Mesero1', email: 'm@x.com', password: 'clave1234', role: 'mesero' });
  await call('POST', '/auth/create-staff', A, { name: 'Mesero2', email: 'm2@x.com', password: 'clave1234', role: 'mesero' });
  await call('POST', '/auth/create-staff', A, { name: 'Coc', email: 'c@x.com', password: 'clave1234', role: 'cocina' });
  const rh = await call('POST', '/auth/create-staff', A, { name: 'RH', email: 'r@x.com', password: 'clave1234', role: 'rrhh' });
  const G = (await call('POST', '/auth/login', null, { email: 'g@x.com', password: 'clave1234' })).token;
  await call('PUT', '/auth/me/pin', G, { pin: '4321', current_password: 'clave1234' });
  const M = (await call('POST', '/auth/login', null, { email: 'm@x.com', password: 'clave1234' })).token;
  const M2 = (await call('POST', '/auth/login', null, { email: 'm2@x.com', password: 'clave1234' })).token;
  const C = (await call('POST', '/auth/login', null, { email: 'c@x.com', password: 'clave1234' })).token;
  const R = (await call('POST', '/auth/login', null, { email: 'r@x.com', password: 'clave1234' })).token;
  // permisos por departamento
  await call('GET', '/payroll/employees', C, null, 403);   // cocina no ve nómina
  await call('GET', '/payroll/employees', R, null, 200);   // rrhh sí
  await call('POST', '/recipes', R, { name: 'x', ingredients: [] }, 403); // rrhh no toca recetas
  await call('GET', '/recipes', M, null, 403);             // mesero no ve costos
  await call('GET', '/accounting/summary', G, null, 200);
  // rutas sensibles: un permiso de "ver"/"crear" no basta
  await call('GET', '/delivery/webhook-url', M, null, 403);      // token secreto del webhook
  await call('GET', '/delivery/webhook-url', G, null, 200);
  await call('GET', '/invoicing/settings', M, null, 403);        // credenciales del proveedor
  await call('POST', '/invoicing/documents/no-existe/void', M, null, 403); // anular requiere 'anular'
  await call('POST', '/invoicing/documents/no-existe/void', G, null, 404);
  // cambiar el rol aplica de inmediato, aunque el token siga vigente
  await call('PUT', '/auth/staff/' + rh.id, A, { role: 'cocina' });
  await call('GET', '/payroll/employees', R, null, 403);
  await call('PUT', '/auth/staff/' + rh.id, A, { role: 'rrhh' });
  await call('GET', '/payroll/employees', R, null, 200);
  // inventario + receta + menú
  const ins = await call('POST', '/inventory', A, { name: 'Solomo', unit: 'kg', stock: 10, min_stock: 1, unit_cost: 250000 });
  const rec = await call('POST', '/recipes', C, { name: 'Solomo plancha', type: 'cocina', ingredients: [{ inventory_item_id: ins.id, quantity: 0.2 }] });
  const cat = await call('POST', '/menu/categories', A, { name: 'Principales' });
  const mi = await call('POST', '/menu/items', A, { name: 'Solomo a la plancha', price: 125000, category_id: cat.id, recipe_id: rec.id });
  const menuM = await call('GET', '/menu/items', M);
  console.log('mesero ve costo?', 'cost' in menuM[0], 'has_recipe', menuM[0].has_recipe);
  // mesa
  const s01 = tables.find(t => t.name === 'S01'), s02 = tables.find(t => t.name === 'S02'), s03 = tables.find(t => t.name === 'S03'), t01 = tables.find(t => t.name === 'T01');
  let o = await call('POST', '/orders', M, { table_id: s01.id, guests: 3 });
  await call('GET', '/orders/' + o.id, M2, null, 403);     // otro mesero no ve la mesa
  o = await call('POST', `/orders/${o.id}/items`, M, { menu_item_id: mi.id, quantity: 2, notes: 'término medio', seat: 1 });
  o = await call('POST', `/orders/${o.id}/items`, M, { menu_item_id: mi.id, quantity: 1, seat: 2 });
  const it = o.items[0];
  o = await call('PUT', `/orders/items/${it.id}`, M, { quantity: 3, notes: 'bien cocido' });
  console.log('cost snapshot', it.cost_snapshot, 'theoretical', o.theoretical_cost);
  await call('PUT', `/orders/items/${it.id}/kitchen-status`, C, { kitchen_status: 'listo' });
  await call('POST', `/orders/items/${it.id}/void`, M, { reason: 'cliente cambió' }, 403); // ya preparado: requiere PIN
  o = await call('POST', `/orders/items/${it.id}/void`, M, { reason: 'cliente cambió', pin: '4321' });
  await call('POST', `/orders/${o.id}/discount`, M, { type: 'porcentaje', value: 10, reason: 'cliente frecuente', pin: '0000' }, 403);
  o = await call('POST', `/orders/${o.id}/discount`, M, { type: 'porcentaje', value: 10, reason: 'cliente frecuente', pin: '4321' });
  console.log('cuenta', { items: o.items_total, desc: o.discount_amount, net: o.net_subtotal, iva: o.tax_amount, total: o.total });
  // un mesero no puede unir (absorber) ni pasar ítems a la mesa abierta de otro mesero
  const s04 = tables.find(t => t.name === 'S04');
  const o2 = await call('POST', '/orders', M2, { table_id: s04.id, guests: 2 });
  await call('POST', `/orders/${o.id}/merge`, M, { table_ids: [s04.id] }, 403);
  await call('POST', `/orders/${o.id}/move-items`, M, { item_ids: [o.items[0].id], to_table_id: s04.id }, 403);
  const o2After = await call('GET', '/orders/' + o2.id, M2);
  console.log('cuenta del otro mesero sigue abierta', o2After.status);
  o = await call('POST', `/orders/${o.id}/merge`, M, { table_ids: [s02.id] });
  o = await call('POST', `/orders/${o.id}/transfer`, M, { to_table_id: t01.id });
  console.log('mesa ahora', o.table_name, 'unidas', o.merged_tables.map(t => t.name));
  // pago dividido
  const half = Math.round(o.total / 2 * 100) / 100;
  o = await call('POST', `/orders/${o.id}/payments`, M, { method: 'tarjeta_debito', amount: half, tip_amount: 5000, payer_label: 'Comensal 1' });
  await call('POST', `/orders/${o.id}/payments`, M, { method: 'transferencia', amount: o.balance + 100 }, 400);
  const p2 = await call('POST', `/orders/${o.id}/payments`, M, { method: 'efectivo', amount: o.balance + 1000, payer_label: 'Comensal 2' });
  console.log('cambio', p2.change, 'saldo', p2.balance);
  o = await call('POST', `/orders/${o.id}/close`, M);
  const after = await call('GET', '/orders/tables', A);
  console.log('estados', after.filter(t => ['S01', 'S02', 'T01'].includes(t.name)).map(t => t.name + ':' + t.status).join(' '));
  await call('PUT', `/orders/tables/${t01.id}`, M, { status: 'libre' });
  await call('PUT', `/orders/tables/${s03.id}`, M, { status: 'bloqueada' }, 403);
  await call('PUT', `/orders/tables/${s03.id}`, G, { status: 'bloqueada' });
  // delivery compat close
  const kds = await call('GET', '/orders/kds?station=cocina', C);
  const rep = await call('GET', '/reports/summary', G);
  console.log('reporte', rep);
  const inv = await call('GET', '/inventory', A);
  console.log('stock solomo', inv[0].stock);
  const log = await call('GET', '/auth/audit-log', G);
  console.log('bitácora', log.length, [...new Set(log.map(l => l.action))].join(','));
  // bloqueo
  for (let i = 0; i < 5; i++) await call('POST', '/auth/login', null, { email: 'r@x.com', password: 'mal' }, 401);
  await call('POST', '/auth/login', null, { email: 'r@x.com', password: 'clave1234' }, 423);
  console.log(fails ? `\n${fails} FALLOS` : '\nTODO OK');
})().catch((e) => { console.error(e); process.exit(1); });
setTimeout(async () => {
  await call('POST', '/auth/register-restaurant', null, { restaurantName: 'X', country: 'CO', adminName: 'Y', email: 'z@x.com', password: 'clave1234' }, 400);
  const c = await call('GET', '/compliance/countries');
  console.log('países', c.countries.length);
  const A = (await call('POST', '/auth/login', null, { email: 'a@x.com', password: 'clave1234' })).token;
  const st = await call('GET', '/compliance/status', A);
  console.log(st.profile.name, st.checks.map(x => x.key + ':' + x.ok).join(' '));
  const M = (await call('POST', '/auth/login', null, { email: 'm@x.com', password: 'clave1234' })).token;
  console.log(fails ? `\nRESULTADO: ${fails} FALLOS` : '\nRESULTADO: TODO OK');
  process.exit(fails ? 1 : 0);
}, 4000);
