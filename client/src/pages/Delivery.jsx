import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';

const STATUS_LABELS = {
  recibido: 'Recibido', preparando: 'Preparando', en_camino: 'En camino', entregado: 'Entregado', cancelado: 'Cancelado'
};
const NEXT_STATUS = { recibido: 'preparando', preparando: 'en_camino', en_camino: 'entregado' };

export default function Delivery() {
  const { api, user } = useAuth();
  const socket = useSocket();
  const [orders, setOrders] = useState([]);
  const [webhookInfo, setWebhookInfo] = useState(null);
  const [form, setForm] = useState({ channel: 'domicilio', customer_name: '', customer_phone: '', delivery_address: '', delivery_fee: 0 });
  const [error, setError] = useState('');

  function load() {
    api.get('/delivery').then(res => setOrders(res.data));
    if (user?.role === 'admin') api.get('/delivery/webhook-url').then(res => setWebhookInfo(res.data));
  }
  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!socket) return;
    const reload = () => load();
    socket.on('delivery:new_order', reload);
    socket.on('delivery:status_changed', reload);
    socket.on('order:closed', reload);
    return () => {
      socket.off('delivery:new_order', reload);
      socket.off('delivery:status_changed', reload);
      socket.off('order:closed', reload);
    };
  }, [socket]);

  async function createOrder(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/delivery', form);
      setForm({ channel: 'domicilio', customer_name: '', customer_phone: '', delivery_address: '', delivery_fee: 0 });
      load();
    } catch (err) { setError(err.response?.data?.error || 'No se pudo crear el pedido'); }
  }

  async function updateStatus(id, delivery_status) {
    await api.put(`/delivery/${id}/status`, { delivery_status });
    load();
  }

  async function closeOrder(id) {
    if (!confirm('¿Cerrar y cobrar este pedido?')) return;
    await api.post(`/orders/${id}/close`);
    load();
  }

  return (
    <div>
      <div className="topbar"><h1>🛵 Domicilios y recoger</h1></div>

      {error && <div className="error-msg">{error}</div>}

      {webhookInfo && (
        <div className="card">
          <h3>Integración con apps de domicilios</h3>
          <p style={{ color: '#6b7280', fontSize: 13 }}>
            Página de pedido directo para tus clientes (sin comisión de apps de terceros):
          </p>
          <code>{window.location.origin}{webhookInfo.public_menu_url}</code>
          <p style={{ color: '#6b7280', fontSize: 13, marginTop: 12 }}>
            URL de webhook para conectar Rappi/Uber Eats/PedidosYa/Didi u otra app que soporte enviar pedidos por webhook:
          </p>
          <code>{window.location.origin}{webhookInfo.url}</code>
        </div>
      )}

      <div className="grid grid-2">
        <div className="card">
          <h3>Nuevo pedido manual</h3>
          <form onSubmit={createOrder}>
            <div className="field"><label>Canal</label>
              <select value={form.channel} onChange={e => setForm({ ...form, channel: e.target.value })}>
                <option value="domicilio">Domicilio</option>
                <option value="recoger">Recoger en tienda</option>
              </select></div>
            <div className="field"><label>Nombre del cliente</label>
              <input required value={form.customer_name} onChange={e => setForm({ ...form, customer_name: e.target.value })} /></div>
            <div className="field"><label>Teléfono</label>
              <input required value={form.customer_phone} onChange={e => setForm({ ...form, customer_phone: e.target.value })} /></div>
            {form.channel === 'domicilio' && (
              <div className="field"><label>Dirección</label>
                <input required value={form.delivery_address} onChange={e => setForm({ ...form, delivery_address: e.target.value })} /></div>
            )}
            <div className="field"><label>Costo de domicilio</label>
              <input type="number" step="0.01" value={form.delivery_fee} onChange={e => setForm({ ...form, delivery_fee: Number(e.target.value) })} /></div>
            <button className="btn">Crear pedido</button>
          </form>
          <p style={{ color: '#6b7280', fontSize: 13, marginTop: 8 }}>
            Después de crearlo, agrégale ítems desde la pantalla de la cuenta (mismo flujo que una mesa).
          </p>
        </div>

        <div className="card">
          <h3>Pedidos activos</h3>
          <table>
            <thead><tr><th>Cliente</th><th>Canal</th><th>Origen</th><th>Total</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              {orders.map(o => (
                <tr key={o.id}>
                  <td>{o.customer_name || '—'}<br /><small>{o.customer_phone}</small></td>
                  <td>{o.channel === 'domicilio' ? 'Domicilio' : 'Recoger'}</td>
                  <td>{o.delivery_platform || '—'}</td>
                  <td>{o.total.toFixed(2)}</td>
                  <td><span className="badge gray">{STATUS_LABELS[o.delivery_status] || o.delivery_status}</span></td>
                  <td>
                    <a href={`/app/mesero/pedido/${o.id}`} className="btn small secondary">Ver</a>
                    {NEXT_STATUS[o.delivery_status] && (
                      <button className="btn small" style={{ marginLeft: 6 }} onClick={() => updateStatus(o.id, NEXT_STATUS[o.delivery_status])}>
                        → {STATUS_LABELS[NEXT_STATUS[o.delivery_status]]}
                      </button>
                    )}
                    {o.delivery_status === 'entregado' && (
                      <button className="btn small" style={{ marginLeft: 6 }} onClick={() => closeOrder(o.id)}>Cobrar</button>
                    )}
                    {o.delivery_status !== 'cancelado' && o.delivery_status !== 'entregado' && (
                      <button className="btn small danger" style={{ marginLeft: 6 }} onClick={() => updateStatus(o.id, 'cancelado')}>Cancelar</button>
                    )}
                  </td>
                </tr>
              ))}
              {orders.length === 0 && <tr><td colSpan="6">Sin pedidos activos.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
