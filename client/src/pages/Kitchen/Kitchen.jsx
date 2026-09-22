import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';

// La comanda de cocina reconstruye su lista consultando los pedidos abiertos
// y escucha eventos en tiempo real para nuevos ítems y cambios de estado.
export default function Kitchen() {
  const { api } = useAuth();
  const socket = useSocket();
  const [tickets, setTickets] = useState([]);

  async function loadAll() {
    const { data: tables } = await api.get('/orders/tables');
    const openOrders = tables.filter(t => t.open_order_id);
    const orders = await Promise.all(openOrders.map(t => api.get(`/orders/${t.open_order_id}`).then(r => r.data)));
    const flat = [];
    orders.forEach(order => {
      order.items.forEach(item => {
        if (item.kitchen_status !== 'entregado') {
          flat.push({ ...item, table_name: order.table_name, order_id: order.id });
        }
      });
    });
    setTickets(flat);
  }

  useEffect(() => { loadAll(); }, []);

  useEffect(() => {
    if (!socket) return;
    const refresh = () => loadAll();
    socket.on('kitchen:new_item', refresh);
    socket.on('kitchen:item_updated', refresh);
    socket.on('order:changed', refresh);
    socket.on('order:closed', refresh);
    return () => {
      socket.off('kitchen:new_item', refresh);
      socket.off('kitchen:item_updated', refresh);
      socket.off('order:changed', refresh);
      socket.off('order:closed', refresh);
    };
  }, [socket]);

  async function markStatus(orderItemId, status) {
    await api.put(`/orders/items/${orderItemId}/kitchen-status`, { kitchen_status: status });
  }

  return (
    <div>
      <div className="topbar"><h1>👨‍🍳 Comanda de cocina / barra</h1></div>
      <div className="kitchen-board">
        {tickets.map(t => (
          <div key={t.id} className={`ticket ${t.kitchen_status === 'listo' ? 'listo' : ''}`}>
            <h4>{t.table_name}</h4>
            <p style={{ margin: '4px 0' }}>{t.quantity}x {t.name_snapshot}</p>
            <span className={`badge ${t.kitchen_status === 'listo' ? 'green' : 'yellow'}`}>{t.kitchen_status}</span>
            <div style={{ marginTop: 10, display: 'flex', gap: 6 }}>
              {t.kitchen_status === 'pendiente' && (
                <button className="btn small" onClick={() => markStatus(t.id, 'listo')}>Marcar listo</button>
              )}
              {t.kitchen_status === 'listo' && (
                <button className="btn small secondary" onClick={() => markStatus(t.id, 'entregado')}>Marcar entregado</button>
              )}
            </div>
          </div>
        ))}
        {tickets.length === 0 && <p>No hay pedidos pendientes.</p>}
      </div>
    </div>
  );
}
