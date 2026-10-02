import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { money } from './Tables';

const QUICK_NOTES = ['Sin sal', 'Sin cebolla', 'Sin picante', 'Término medio', 'Tres cuartos', 'Bien cocido',
  'Salsa aparte', 'Sin hielo', 'Doble', 'Para llevar', 'Alergia: ver nota'];
const PAYMENT_METHODS = [
  ['efectivo', '💵 Efectivo'], ['tarjeta_debito', '💳 Débito'], ['tarjeta_credito', '💳 Crédito'],
  ['transferencia', '🏦 Transferencia'], ['pago_movil', '📱 Pago móvil'], ['divisas', '💲 Divisas'], ['otro', 'Otro']
];
const KITCHEN_BADGE = { pendiente: 'yellow', listo: 'green', entregado: 'gray' };

export default function Order() {
  const { orderId } = useParams();
  const { api, can } = useAuth();
  const socket = useSocket();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [menuItems, setMenuItems] = useState([]);
  const [tables, setTables] = useState([]);
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null); // { type, ...data }

  const backPath = order && order.channel !== 'salon' ? '/domicilios' : '/mesero/mesas';

  function loadOrder() {
    return api.get(`/orders/${orderId}`).then(res => setOrder(res.data)).catch((err) => {
      setError(err.response?.data?.error || 'No se pudo cargar la cuenta');
    });
  }
  function loadMenu() {
    api.get('/menu/items').then(res => setMenuItems(res.data));
  }
  useEffect(() => { loadOrder(); loadMenu(); }, [orderId]);

  useEffect(() => {
    if (!socket) return;
    const onOrderChanged = (data) => { if (data.id === orderId) setOrder(data); };
    const onOrderClosed = (data) => { if (data.id === orderId && !modal) navigate(data.channel === 'salon' ? '/mesero/mesas' : '/domicilios'); };
    socket.on('order:changed', onOrderChanged);
    socket.on('order:closed', onOrderClosed);
    socket.on('menu:changed', loadMenu);
    socket.on('menu:deleted', loadMenu);
    socket.on('kitchen:item_updated', loadOrder);
    return () => {
      socket.off('order:changed', onOrderChanged);
      socket.off('order:closed', onOrderClosed);
      socket.off('menu:changed', loadMenu);
      socket.off('menu:deleted', loadMenu);
      socket.off('kitchen:item_updated', loadOrder);
    };
  }, [socket, orderId, modal]);

  // Ejecuta una llamada y actualiza la cuenta; si el servidor exige clave de
  // supervisor, abre el teclado de PIN y reintenta.
  async function run(fn, { onPin } = {}) {
    setError('');
    try {
      const { data } = await fn();
      if (data && data.items) setOrder(data);
      return data;
    } catch (err) {
      const msg = err.response?.data?.error || 'No se pudo completar la acción';
      if (err.response?.status === 403 && /autorizaci/i.test(msg) && onPin) {
        setModal({ type: 'pin', message: msg, onPin });
        return null;
      }
      setError(msg);
      return null;
    }
  }

  const categories = useMemo(() => [...new Set(menuItems.map(i => i.category_name || 'Sin categoría'))], [menuItems]);
  const shownMenu = menuItems.filter(i =>
    (!category || (i.category_name || 'Sin categoría') === category) &&
    (!search || i.name.toLowerCase().includes(search.toLowerCase())));

  if (!order) return <div>{error ? <div className="error-msg">{error}</div> : <p>Cargando cuenta...</p>}</div>;

  const active = order.items.filter(i => i.status !== 'anulado');
  const voided = order.items.filter(i => i.status === 'anulado');
  const seats = Array.from({ length: Math.max(1, order.guests || 1) }, (_, i) => i + 1);
  const title = order.channel === 'salon'
    ? `🍽️ Mesa ${order.table_name}${order.merged_tables?.length ? ' + ' + order.merged_tables.map(t => t.name).join(' + ') : ''}`
    : `🛵 ${order.customer_name || (order.channel === 'domicilio' ? 'Domicilio' : 'Recoger')}`;

  // ---- acciones ----
  const addItem = (menuItem, quantity = 1, notes = '', seat = null) =>
    run(() => api.post(`/orders/${orderId}/items`, { menu_item_id: menuItem.id, quantity, notes, seat }));

  const updateItem = (item, body) =>
    run(() => api.put(`/orders/items/${item.id}`, body), { onPin: (pin) => updateItem(item, { ...body, pin }) });

  const voidItem = (item, reason, pin) =>
    run(() => api.post(`/orders/items/${item.id}/void`, { reason, pin }), { onPin: (p) => voidItem(item, reason, p) });

  const setDiscount = (body) =>
    run(() => api.post(`/orders/${orderId}/discount`, body), { onPin: (pin) => setDiscount({ ...body, pin }) });

  const setGuests = (guests) => run(() => api.put(`/orders/${orderId}`, { guests }));

  async function openTablePicker(type) {
    const { data } = await api.get('/orders/tables');
    setTables(data);
    setModal({ type, selected: [] });
  }

  async function printPrecuenta() {
    const data = await run(() => api.post(`/orders/${orderId}/precuenta`));
    if (data) setTimeout(() => window.print(), 50);
  }

  async function releaseTable() {
    if (!confirm('¿Liberar la mesa sin consumo?')) return;
    const ok = await run(() => api.post(`/orders/${orderId}/release`));
    if (ok) navigate(backPath);
  }

  return (
    <div>
      <div className="topbar no-print">
        <div>
          <h1>{title}</h1>
          <div style={{ fontSize: 13, color: '#6b7280' }}>
            Atiende: {order.waiter_name || '—'} ·
            Comensales:
            <button className="btn small secondary" style={{ marginLeft: 6 }} onClick={() => setGuests(Math.max(1, order.guests - 1))}>−</button>
            <strong style={{ margin: '0 6px' }}>{order.guests}</strong>
            <button className="btn small secondary" onClick={() => setGuests(order.guests + 1)}>+</button>
          </div>
        </div>
        <button className="btn secondary" onClick={() => navigate(backPath)}>← Volver a mesas</button>
      </div>

      {error && <div className="error-msg no-print">{error}</div>}

      <div className="order-layout no-print">
        {/* ------- Menú ya costeado y recetado ------- */}
        <div className="card">
          <div className="menu-toolbar">
            <input placeholder="🔍 Buscar plato o bebida…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="category-tabs">
            <button className={!category ? 'active' : ''} onClick={() => setCategory('')}>Todo</button>
            {categories.map(c => (
              <button key={c} className={category === c ? 'active' : ''} onClick={() => setCategory(c)}>{c}</button>
            ))}
          </div>
          <div className="menu-picker">
            {shownMenu.map(item => (
              <div key={item.id} className={`item ${!item.available ? 'unavailable' : ''}`}
                onClick={() => item.available && setModal({ type: 'include', item, quantity: 1, notes: '', seat: '' })}>
                <strong>{item.name}</strong>
                <div style={{ fontSize: 12, color: '#6b7280' }}>{item.category_name || 'Sin categoría'}</div>
                <div className="price-row">
                  <span>{money(item.price)}</span>
                  {item.has_recipe
                    ? <span className="badge green" title="Plato costeado con receta: descuenta inventario">receta ✓</span>
                    : <span className="badge yellow" title="Sin receta: no descuenta inventario ni tiene costo">sin receta</span>}
                </div>
                {!item.available && <span className="badge red">Agotado</span>}
                {item.available && (
                  <button className="quick-add" title="Incluir 1 rápido"
                    onClick={e => { e.stopPropagation(); addItem(item); }}>+1</button>
                )}
              </div>
            ))}
            {shownMenu.length === 0 && <p>No hay ítems para mostrar.</p>}
          </div>
        </div>

        {/* ------- Cuenta ------- */}
        <div className="card account">
          <h3>Cuenta</h3>
          <table>
            <thead><tr><th>Cant.</th><th>Ítem</th><th style={{ textAlign: 'right' }}>Subtotal</th><th></th></tr></thead>
            <tbody>
              {active.map(item => (
                <tr key={item.id}>
                  <td><strong>{item.quantity}</strong></td>
                  <td>
                    {item.name_snapshot}
                    {item.seat && <span className="badge gray" style={{ marginLeft: 4 }}>C{item.seat}</span>}
                    <span className={`badge ${KITCHEN_BADGE[item.kitchen_status]}`} style={{ marginLeft: 4 }}>{item.kitchen_status}</span>
                    {item.notes && <div className="item-notes">📝 {item.notes}</div>}
                  </td>
                  <td style={{ textAlign: 'right' }}>{money(item.price_snapshot * item.quantity)}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn small secondary" onClick={() => setModal({ type: 'modify', item, quantity: item.quantity, notes: item.notes || '', seat: item.seat || '' })}>Modificar</button>
                    <button className="btn small danger" style={{ marginLeft: 4 }} onClick={() => setModal({ type: 'void', item, reason: '', pin: '' })}>Anular</button>
                  </td>
                </tr>
              ))}
              {active.length === 0 && <tr><td colSpan="4">Aún no hay ítems. Toca un plato para incluirlo.</td></tr>}
            </tbody>
          </table>
          {voided.length > 0 && (
            <details style={{ marginTop: 8, fontSize: 12 }}>
              <summary>{voided.length} ítem(s) anulado(s)</summary>
              {voided.map(i => <div key={i.id} style={{ textDecoration: 'line-through', color: '#9ca3af' }}>{i.quantity}× {i.name_snapshot} — {i.void_reason}</div>)}
            </details>
          )}

          <Totals order={order} />

          <div className="action-grid">
            <button className="btn secondary" onClick={printPrecuenta} disabled={!active.length}>🖨️ Precuenta</button>
            <button className="btn secondary" onClick={() => setModal({ type: 'discount', dtype: 'porcentaje', value: '', reason: '', pin: '' })} disabled={!active.length}>🏷️ Descuento / Cortesía</button>
            {order.channel === 'salon' && <>
              <button className="btn secondary" onClick={() => openTablePicker('transfer')}>↔️ Transferir mesa</button>
              <button className="btn secondary" onClick={() => openTablePicker('merge')}>🔗 Unir mesas</button>
              <button className="btn secondary" onClick={() => openTablePicker('move')} disabled={!active.length}>✂️ Pasar ítems a otra mesa</button>
              {!active.length && <button className="btn secondary" onClick={releaseTable}>🚪 Liberar mesa</button>}
            </>}
          </div>
          {order.merged_tables?.length > 0 && (
            <div style={{ fontSize: 12, marginTop: 8 }}>
              Unidas: {order.merged_tables.map(t => (
                <button key={t.id} className="btn small secondary" style={{ marginLeft: 4 }}
                  onClick={() => run(() => api.post(`/orders/${orderId}/unmerge`, { table_id: t.id }))}>Separar {t.name}</button>
              ))}
            </div>
          )}
          {can('cobros', 'crear') && (
            <button className="btn pay-btn" disabled={!active.length} onClick={() => setModal({ type: 'pay' })}>
              💰 Cobrar {money(order.balance)}
            </button>
          )}
        </div>
      </div>

      <Precuenta order={order} />

      {modal?.type === 'include' && (
        <ItemModal title={`Incluir: ${modal.item.name}`} modal={modal} setModal={setModal} seats={seats}
          confirmLabel={`Incluir · ${money(modal.item.price * (modal.quantity || 1))}`}
          onConfirm={async () => {
            const ok = await addItem(modal.item, modal.quantity, modal.notes, modal.seat || null);
            if (ok) setModal(null);
          }} />
      )}

      {modal?.type === 'modify' && (
        <ItemModal title={`Modificar: ${modal.item.name_snapshot}`} modal={modal} setModal={setModal} seats={seats}
          hint="Bajar la cantidad de algo ya preparado pide clave de supervisor."
          confirmLabel="Guardar cambios"
          onConfirm={async () => {
            const ok = await updateItem(modal.item, { quantity: modal.quantity, notes: modal.notes, seat: modal.seat || null });
            if (ok) setModal(null);
          }} />
      )}

      {modal?.type === 'void' && (
        <Modal title={`Anular: ${modal.item.quantity}× ${modal.item.name_snapshot}`} onClose={() => setModal(null)}>
          <p style={{ fontSize: 12, color: '#6b7280' }}>
            Sin clave solo se puede anular en los primeros 3 minutos y si cocina no lo ha preparado. Si ya se preparó, el insumo queda como merma.
          </p>
          <div className="field"><label>Motivo</label>
            <select value={modal.reason} onChange={e => setModal({ ...modal, reason: e.target.value })}>
              <option value="">— selecciona —</option>
              {['Error de digitación', 'Cliente cambió de opinión', 'Demora en cocina', 'Plato devuelto (calidad)', 'Producto agotado', 'Otro'].map(r => <option key={r}>{r}</option>)}
            </select></div>
          <PinField modal={modal} setModal={setModal} />
          <button className="btn danger" style={{ width: '100%' }} onClick={async () => {
            const ok = await voidItem(modal.item, modal.reason, modal.pin || undefined);
            if (ok) setModal(null);
          }}>Anular ítem</button>
        </Modal>
      )}

      {modal?.type === 'discount' && (
        <Modal title="Descuento o cortesía (requiere autorización)" onClose={() => setModal(null)}>
          <div className="seg">
            {[['porcentaje', '%'], ['monto', 'Monto'], ['cortesia', 'Cortesía total'], ['ninguno', 'Quitar']].map(([k, l]) => (
              <button key={k} className={modal.dtype === k ? 'active' : ''} onClick={() => setModal({ ...modal, dtype: k })}>{l}</button>
            ))}
          </div>
          {['porcentaje', 'monto'].includes(modal.dtype) && (
            <div className="field"><label>{modal.dtype === 'porcentaje' ? 'Porcentaje' : 'Monto'}</label>
              <input type="number" min="0" value={modal.value} onChange={e => setModal({ ...modal, value: e.target.value })} /></div>
          )}
          {modal.dtype !== 'ninguno' && (
            <div className="field"><label>Motivo</label>
              <input value={modal.reason} placeholder="Cliente frecuente, compensación, cumpleaños…" onChange={e => setModal({ ...modal, reason: e.target.value })} /></div>
          )}
          <PinField modal={modal} setModal={setModal} />
          <button className="btn" style={{ width: '100%' }} onClick={async () => {
            const ok = await setDiscount({ type: modal.dtype, value: modal.value, reason: modal.reason, pin: modal.pin || undefined });
            if (ok) setModal(null);
          }}>Aplicar</button>
        </Modal>
      )}

      {['transfer', 'merge', 'move'].includes(modal?.type) && (
        <TablePicker modal={modal} setModal={setModal} tables={tables} order={order} active={active}
          onConfirm={async () => {
            let ok;
            if (modal.type === 'transfer') ok = await run(() => api.post(`/orders/${orderId}/transfer`, { to_table_id: modal.selected[0] }));
            if (modal.type === 'merge') ok = await run(() => api.post(`/orders/${orderId}/merge`, { table_ids: modal.selected }));
            if (modal.type === 'move') ok = await run(() => api.post(`/orders/${orderId}/move-items`, { to_table_id: modal.selected[0], item_ids: modal.items || [] }));
            if (ok) setModal(null);
          }} />
      )}

      {modal?.type === 'pay' && (
        <PayModal order={order} seats={seats} active={active} api={api} run={run} setModal={setModal}
          onClosed={(closed) => setModal({ type: 'closed', closed })} />
      )}

      {modal?.type === 'closed' && (
        <InvoiceModal order={modal.closed} api={api} canInvoice={can('facturacion', 'crear')}
          onDone={() => navigate(backPath)} />
      )}

      {modal?.type === 'pin' && (
        <Modal title="🔐 Autorización de supervisor" onClose={() => setModal(null)}>
          <p style={{ fontSize: 13 }}>{modal.message}</p>
          <PinField modal={modal} setModal={setModal} autoFocus />
          <button className="btn" style={{ width: '100%' }} onClick={async () => {
            const { onPin, pin } = modal;
            setModal(null);
            await onPin(pin);
          }}>Autorizar</button>
        </Modal>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function Totals({ order }) {
  return (
    <div className="totals">
      <div><span>Consumo</span><span>{money(order.items_total)}</span></div>
      {order.discount_amount > 0 && (
        <div className="discount"><span>{order.discount_type === 'cortesia' ? 'Cortesía' : 'Descuento'} ({order.discount_reason})</span><span>−{money(order.discount_amount)}</span></div>
      )}
      <div><span>Base {order.prices_include_tax ? '(sin impuesto)' : ''}</span><span>{money(order.net_subtotal)}</span></div>
      <div><span>{order.tax_name} {order.tax_rate}%{order.prices_include_tax ? ' incluido' : ''}</span><span>{money(order.tax_amount)}</span></div>
      {order.delivery_fee > 0 && <div><span>Domicilio</span><span>{money(order.delivery_fee)}</span></div>}
      <div className="grand"><span>Total</span><span>{money(order.total)}</span></div>
      {order.paid_amount > 0 && <>
        <div><span>Pagado</span><span>{money(order.paid_amount)}</span></div>
        <div className="grand"><span>Saldo</span><span>{money(order.balance)}</span></div>
      </>}
      {order.tip_amount > 0 && <div><span>Propinas recibidas</span><span>{money(order.tip_amount)}</span></div>}
    </div>
  );
}

function Precuenta({ order }) {
  const active = order.items.filter(i => i.status !== 'anulado');
  const tip = order.total * (order.tip_suggested_pct || 0) / 100;
  return (
    <div className="print-area">
      <h2 style={{ textAlign: 'center', margin: 0 }}>PRECUENTA</h2>
      <p style={{ textAlign: 'center', margin: '4px 0' }}>
        {order.table_name ? `Mesa ${order.table_name}` : order.customer_name} · {order.guests} pax · {order.waiter_name}<br />
        {new Date().toLocaleString()}
      </p>
      <table>
        <tbody>
          {active.map(i => (
            <tr key={i.id}><td>{i.quantity}</td><td>{i.name_snapshot}</td><td style={{ textAlign: 'right' }}>{money(i.price_snapshot * i.quantity)}</td></tr>
          ))}
        </tbody>
      </table>
      <Totals order={order} />
      <p>Propina sugerida ({order.tip_suggested_pct}%): {money(tip)} — voluntaria</p>
      <p style={{ textAlign: 'center', fontSize: 11 }}>Documento no válido como factura</p>
    </div>
  );
}

function Modal({ title, onClose, children, wide }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={`modal ${wide ? 'wide' : ''}`} onClick={e => e.stopPropagation()}>
        <div className="modal-head"><h3>{title}</h3><button className="btn small secondary" onClick={onClose}>✕</button></div>
        {children}
      </div>
    </div>
  );
}

function PinField({ modal, setModal, autoFocus }) {
  return (
    <div className="field">
      <label>PIN de supervisor (si se requiere)</label>
      <input type="password" inputMode="numeric" autoFocus={autoFocus} value={modal.pin || ''}
        onChange={e => setModal({ ...modal, pin: e.target.value })} />
    </div>
  );
}

function ItemModal({ title, modal, setModal, seats, onConfirm, confirmLabel, hint }) {
  const toggleNote = (n) => {
    const parts = modal.notes ? modal.notes.split(', ').filter(Boolean) : [];
    const next = parts.includes(n) ? parts.filter(p => p !== n) : [...parts, n];
    setModal({ ...modal, notes: next.join(', ') });
  };
  return (
    <Modal title={title} onClose={() => setModal(null)}>
      {hint && <p style={{ fontSize: 12, color: '#6b7280' }}>{hint}</p>}
      <div className="field">
        <label>Cantidad</label>
        <div className="qty-row">
          <button className="btn secondary" onClick={() => setModal({ ...modal, quantity: Math.max(1, (modal.quantity || 1) - 1) })}>−</button>
          <strong>{modal.quantity}</strong>
          <button className="btn secondary" onClick={() => setModal({ ...modal, quantity: (modal.quantity || 1) + 1 })}>+</button>
        </div>
      </div>
      <div className="field">
        <label>Comensal (para dividir la cuenta)</label>
        <div className="seg">
          <button className={!modal.seat ? 'active' : ''} onClick={() => setModal({ ...modal, seat: '' })}>Mesa</button>
          {seats.map(s => <button key={s} className={+modal.seat === s ? 'active' : ''} onClick={() => setModal({ ...modal, seat: s })}>C{s}</button>)}
        </div>
      </div>
      <div className="field">
        <label>Modificadores para cocina / bar</label>
        <div className="chips">
          {QUICK_NOTES.map(n => (
            <button key={n} className={(modal.notes || '').split(', ').includes(n) ? 'active' : ''} onClick={() => toggleNote(n)}>{n}</button>
          ))}
        </div>
        <input style={{ marginTop: 6 }} placeholder="Nota libre…" maxLength={200} value={modal.notes}
          onChange={e => setModal({ ...modal, notes: e.target.value })} />
      </div>
      <button className="btn" style={{ width: '100%' }} onClick={onConfirm}>{confirmLabel}</button>
    </Modal>
  );
}

function TablePicker({ modal, setModal, tables, order, active, onConfirm }) {
  const multi = modal.type === 'merge';
  const candidates = tables.filter(t => t.id !== order.table_id && t.zone !== 'delivery' && (
    modal.type === 'merge'
      ? ['libre', 'reservada', 'ocupada'].includes(t.status)
      : modal.type === 'move' ? ['libre', 'reservada', 'ocupada'].includes(t.status) : ['libre', 'reservada'].includes(t.status)));
  const titles = { transfer: 'Transferir cuenta a otra mesa', merge: 'Unir mesas a esta cuenta', move: 'Pasar ítems a otra mesa' };
  const toggle = (id) => setModal({
    ...modal, selected: multi
      ? (modal.selected.includes(id) ? modal.selected.filter(x => x !== id) : [...modal.selected, id])
      : [id]
  });
  const toggleItem = (id) => {
    const items = modal.items || [];
    setModal({ ...modal, items: items.includes(id) ? items.filter(x => x !== id) : [...items, id] });
  };
  return (
    <Modal title={titles[modal.type]} onClose={() => setModal(null)} wide>
      {modal.type === 'move' && (
        <div className="field">
          <label>Ítems a pasar</label>
          {active.map(i => (
            <label key={i.id} className="check-line">
              <input type="checkbox" checked={(modal.items || []).includes(i.id)} onChange={() => toggleItem(i.id)} />
              {i.quantity}× {i.name_snapshot} {i.seat ? `(C${i.seat})` : ''}
            </label>
          ))}
        </div>
      )}
      <label>Mesa{multi ? 's' : ''} destino</label>
      <div className="mini-tables">
        {candidates.map(t => (
          <button key={t.id} className={`mini-table ${t.status} ${modal.selected.includes(t.id) ? 'selected' : ''}`} onClick={() => toggle(t.id)}>
            {t.name}
          </button>
        ))}
      </div>
      <button className="btn" style={{ width: '100%', marginTop: 12 }} disabled={!modal.selected.length || (modal.type === 'move' && !(modal.items || []).length)}
        onClick={onConfirm}>Confirmar</button>
    </Modal>
  );
}

function PayModal({ order, seats, active, api, run, setModal, onClosed }) {
  const [mode, setMode] = useState('total');
  const [parts, setParts] = useState(2);
  const [seat, setSeat] = useState(1);
  const [itemIds, setItemIds] = useState([]);
  const [method, setMethod] = useState('efectivo');
  const [amount, setAmount] = useState('');
  const [received, setReceived] = useState('');
  const [tip, setTip] = useState('');
  const [reference, setReference] = useState('');
  const [error, setError] = useState('');

  // Factor que reparte descuento e impuesto proporcionalmente al consumo
  const factor = order.items_total > 0 ? (order.total - (order.delivery_fee || 0)) / order.items_total : 0;
  const lineTotal = (i) => i.price_snapshot * i.quantity * factor;

  const suggested = useMemo(() => {
    let v = order.balance;
    if (mode === 'iguales') v = order.total / Math.max(1, parts);
    if (mode === 'comensal') v = active.filter(i => (i.seat || 0) === seat).reduce((s, i) => s + lineTotal(i), 0)
      + active.filter(i => !i.seat).reduce((s, i) => s + lineTotal(i), 0) / seats.length;
    if (mode === 'items') v = active.filter(i => itemIds.includes(i.id)).reduce((s, i) => s + lineTotal(i), 0);
    if (mode === 'monto') v = Number(amount) || 0;
    return Math.round(Math.min(v, order.balance) * 100) / 100;
  }, [mode, parts, seat, itemIds, amount, order]);

  const tipPct = order.tip_suggested_pct || 0;
  const tipValue = tip === '' ? 0 : Number(tip);
  const change = method === 'efectivo' && Number(received) > 0 ? Number(received) - suggested - tipValue : 0;
  const payerLabel = mode === 'comensal' ? `Comensal ${seat}` : mode === 'iguales' ? `Parte de ${parts}` : mode === 'items' ? 'Por ítems' : null;

  async function pay() {
    setError('');
    if (!(suggested > 0)) { setError('Monto inválido'); return; }
    const data = await run(() => api.post(`/orders/${order.id}/payments`, {
      method, amount: suggested, tip_amount: tipValue, reference, payer_label: payerLabel
    }));
    if (data) { setTip(''); setReceived(''); setReference(''); setItemIds([]); }
  }

  async function close() {
    const data = await run(() => api.post(`/orders/${order.id}/close`));
    if (data) onClosed(data);
  }

  const voidPayment = (p, pin) => run(() => api.post(`/orders/payments/${p.id}/void`, { pin }),
    { onPin: (pn) => voidPayment(p, pn) });

  return (
    <Modal title={`Cobrar — total ${money(order.total)} · saldo ${money(order.balance)}`} onClose={() => setModal(null)} wide>
      {error && <div className="error-msg">{error}</div>}
      {order.balance > 0.01 ? (
        <>
          <label>Dividir cuenta</label>
          <div className="seg">
            {[['total', 'Saldo total'], ['iguales', 'Partes iguales'], ['comensal', 'Por comensal'], ['items', 'Por ítem'], ['monto', 'Por monto']].map(([k, l]) => (
              <button key={k} className={mode === k ? 'active' : ''} onClick={() => setMode(k)}>{l}</button>
            ))}
          </div>
          {mode === 'iguales' && (
            <div className="qty-row" style={{ margin: '8px 0' }}>
              <button className="btn secondary" onClick={() => setParts(p => Math.max(2, p - 1))}>−</button>
              <strong>{parts} partes</strong>
              <button className="btn secondary" onClick={() => setParts(p => p + 1)}>+</button>
            </div>
          )}
          {mode === 'comensal' && (
            <div className="seg" style={{ margin: '8px 0' }}>
              {seats.map(s => <button key={s} className={seat === s ? 'active' : ''} onClick={() => setSeat(s)}>C{s}</button>)}
              <span style={{ fontSize: 11, color: '#6b7280', alignSelf: 'center' }}>Lo que no tiene comensal se reparte entre todos</span>
            </div>
          )}
          {mode === 'items' && (
            <div style={{ margin: '8px 0' }}>
              {active.map(i => (
                <label key={i.id} className="check-line">
                  <input type="checkbox" checked={itemIds.includes(i.id)}
                    onChange={() => setItemIds(ids => ids.includes(i.id) ? ids.filter(x => x !== i.id) : [...ids, i.id])} />
                  {i.quantity}× {i.name_snapshot} — {money(lineTotal(i))}
                </label>
              ))}
            </div>
          )}
          {mode === 'monto' && (
            <div className="field"><label>Monto a cobrar</label>
              <input type="number" min="0" value={amount} onChange={e => setAmount(e.target.value)} /></div>
          )}

          <div className="pay-amount">A cobrar ahora: <strong>{money(suggested)}</strong></div>

          <label>Forma de pago</label>
          <div className="seg">
            {PAYMENT_METHODS.map(([k, l]) => <button key={k} className={method === k ? 'active' : ''} onClick={() => setMethod(k)}>{l}</button>)}
          </div>
          <div className="grid grid-3" style={{ marginTop: 8 }}>
            <div className="field"><label>Propina</label>
              <input type="number" min="0" value={tip} placeholder="0" onChange={e => setTip(e.target.value)} />
              <button className="btn small secondary" style={{ marginTop: 4 }}
                onClick={() => setTip(String(Math.round(suggested * tipPct) / 100))}>Sugerida {tipPct}%</button>
            </div>
            {method === 'efectivo'
              ? <div className="field"><label>Recibido</label>
                  <input type="number" min="0" value={received} onChange={e => setReceived(e.target.value)} />
                  {change > 0 && <div style={{ marginTop: 4 }}>Vuelto: <strong>{money(change)}</strong></div>}</div>
              : <div className="field"><label>Referencia / aprobación</label>
                  <input value={reference} onChange={e => setReference(e.target.value)} /></div>}
          </div>
          <button className="btn" style={{ width: '100%' }} onClick={pay}>Registrar pago de {money(suggested + tipValue)}</button>
        </>
      ) : (
        <p style={{ color: '#065f46', fontWeight: 600 }}>✔ Cuenta saldada.</p>
      )}

      {order.payments.length > 0 && (
        <table style={{ marginTop: 12 }}>
          <thead><tr><th>Pago</th><th>Forma</th><th style={{ textAlign: 'right' }}>Monto</th><th style={{ textAlign: 'right' }}>Propina</th><th></th></tr></thead>
          <tbody>
            {order.payments.map(p => (
              <tr key={p.id}>
                <td>{p.payer_label || '—'}</td><td>{p.method}</td>
                <td style={{ textAlign: 'right' }}>{money(p.amount)}</td><td style={{ textAlign: 'right' }}>{money(p.tip_amount)}</td>
                <td><button className="btn small danger" onClick={() => voidPayment(p)}>Anular</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <button className="btn pay-btn" disabled={order.balance > 0.01} onClick={close}>✅ Cerrar cuenta y liberar mesa</button>
    </Modal>
  );
}

function InvoiceModal({ order, api, canInvoice, onDone }) {
  const [form, setForm] = useState({ customer_name: '', customer_tax_id: '', customer_email: '' });
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  async function invoice() {
    setError('');
    try {
      const { data } = await api.post(`/invoicing/orders/${order.id}`, form);
      setMsg(`Factura ${data.full_number} — ${data.status}`);
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo facturar');
    }
  }

  return (
    <Modal title={`Cuenta cerrada · ${money(order.total)}`} onClose={onDone}>
      {canInvoice && !msg && (
        <>
          <p style={{ fontSize: 13 }}>¿Emitir factura? Déjalo vacío para consumidor final.</p>
          {error && <div className="error-msg">{error}</div>}
          <div className="field"><label>Nombre / razón social</label>
            <input value={form.customer_name} onChange={e => setForm({ ...form, customer_name: e.target.value })} /></div>
          <div className="field"><label>Documento fiscal (RIF / NIT / RFC / RUC)</label>
            <input value={form.customer_tax_id} onChange={e => setForm({ ...form, customer_tax_id: e.target.value })} /></div>
          <div className="field"><label>Correo</label>
            <input type="email" value={form.customer_email} onChange={e => setForm({ ...form, customer_email: e.target.value })} /></div>
          <button className="btn" style={{ width: '100%' }} onClick={invoice}>🧾 Emitir factura</button>
        </>
      )}
      {msg && <p style={{ color: '#065f46', fontWeight: 600 }}>{msg}</p>}
      <button className="btn secondary" style={{ width: '100%', marginTop: 8 }} onClick={onDone}>Volver a mesas</button>
    </Modal>
  );
}
