import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';

export default function Order() {
  const { orderId } = useParams();
  const { api } = useAuth();
  const socket = useSocket();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [menuItems, setMenuItems] = useState([]);
  const [error, setError] = useState('');

  function load() {
    api.get(`/orders/${orderId}`).then(res => setOrder(res.data)).catch(() => setOrder(null));
    api.get('/menu/items').then(res => setMenuItems(res.data));
  }
  useEffect(() => { load(); }, [orderId]);

  useEffect(() => {
    if (!socket) return;
    const onOrderChanged = (data) => { if (data.id === orderId) setOrder(data); };
    const onOrderClosed = (data) => { if (data.id === orderId) navigate('/mesero/mesas'); };
    const onMenuChanged = () => api.get('/menu/items').then(res => setMenuItems(res.data));
    socket.on('order:changed', onOrderChanged);
    socket.on('order:closed', onOrderClosed);
    socket.on('menu:changed', onMenuChanged);
    return () => {
      socket.off('order:changed', onOrderChanged);
      socket.off('order:closed', onOrderClosed);
      socket.off('menu:changed', onMenuChanged);
    };
  }, [socket, orderId]);

  async function addItem(menuItem) {
    setError('');
    try {
      await api.post(`/orders/${orderId}/items`, { menu_item_id: menuItem.id, quantity: 1 });
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo agregar');
    }
  }

  async function removeItem(orderItemId) {
    await api.delete(`/orders/items/${orderItemId}`);
  }

  async function closeOrder() {
    if (!confirm('¿Cerrar y cobrar esta cuenta?')) return;
    await api.post(`/orders/${orderId}/close`);
    navigate('/mesero/mesas');
  }

  if (!order) return <p>Cargando pedido...</p>;

  return (
    <div>
      <div className="topbar">
        <h1>🍽️ {order.table_name}</h1>
        <button className="btn secondary" onClick={() => navigate('/mesero/mesas')}>← Volver a mesas</button>
      </div>

      {error && <div className="error-msg">{error}</div>}

      <div className="grid grid-2">
        <div className="card">
          <h3>Menú disponible</h3>
          <div className="menu-picker">
            {menuItems.map(item => (
              <div key={item.id} className={`item ${!item.available ? 'unavailable' : ''}`}
                onClick={() => item.available && addItem(item)}>
                <strong>{item.name}</strong>
                <div style={{ fontSize: 12, color: '#6b7280' }}>{item.category_name || 'Sin categoría'}</div>
                <div style={{ fontWeight: 600, marginTop: 4 }}>{item.price.toFixed(2)}</div>
                {!item.available && <span className="badge red">Agotado</span>}
              </div>
            ))}
            {menuItems.length === 0 && <p>No hay ítems en el menú aún.</p>}
          </div>
        </div>

        <div className="card">
          <h3>Cuenta actual</h3>
          <table>
            <thead><tr><th>Ítem</th><th>Cant.</th><th>Precio</th><th>Subtotal</th><th></th></tr></thead>
            <tbody>
              {order.items.map(item => (
                <tr key={item.id}>
                  <td>{item.name_snapshot}
                    {item.kitchen_status !== 'pendiente' &&
                      <span className={`badge ${item.kitchen_status === 'listo' ? 'green' : 'gray'}`} style={{ marginLeft: 6 }}>
                        {item.kitchen_status}
                      </span>}
                  </td>
                  <td>{item.quantity}</td>
                  <td>{item.price_snapshot.toFixed(2)}</td>
                  <td>{(item.price_snapshot * item.quantity).toFixed(2)}</td>
                  <td><button className="btn small danger" onClick={() => removeItem(item.id)}>Quitar</button></td>
                </tr>
              ))}
              {order.items.length === 0 && <tr><td colSpan="5">Aún no hay ítems en esta cuenta.</td></tr>}
            </tbody>
          </table>
          <h2 style={{ textAlign: 'right' }}>Total: {order.total.toFixed(2)}</h2>
          <button className="btn" style={{ width: '100%' }} onClick={closeOrder} disabled={order.items.length === 0}>
            Cerrar y cobrar cuenta
          </button>
        </div>
      </div>
    </div>
  );
}
