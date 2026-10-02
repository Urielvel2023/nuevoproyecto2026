import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';

// KDS: comandas pendientes por estación (cocina / bar), con modificadores y
// tiempo de espera. Se actualiza en tiempo real.
export default function Kitchen() {
  const { api, user } = useAuth();
  const socket = useSocket();
  const [tickets, setTickets] = useState([]);
  const [station, setStation] = useState(user?.role === 'bar' ? 'bar' : user?.role === 'cocina' ? 'cocina' : '');
  const [, setTick] = useState(0);

  function loadAll() {
    api.get('/orders/kds', { params: station ? { station } : {} }).then(r => setTickets(r.data));
  }

  useEffect(() => {
    loadAll();
    const id = setInterval(() => setTick(t => t + 1), 30000);
    return () => clearInterval(id);
  }, [station]);

  useEffect(() => {
    if (!socket) return;
    const refresh = () => loadAll();
    ['kitchen:new_item', 'kitchen:item_updated', 'order:changed', 'order:closed'].forEach(e => socket.on(e, refresh));
    return () => ['kitchen:new_item', 'kitchen:item_updated', 'order:changed', 'order:closed'].forEach(e => socket.off(e, refresh));
  }, [socket, station]);

  async function markStatus(orderItemId, status) {
    await api.put(`/orders/items/${orderItemId}/kitchen-status`, { kitchen_status: status });
  }

  const minutes = (ts) => {
    const d = ts.includes('T') ? new Date(ts) : new Date(ts.replace(' ', 'T') + 'Z');
    return Math.max(0, Math.round((Date.now() - d.getTime()) / 60000));
  };

  return (
    <div>
      <div className="topbar">
        <h1>👨‍🍳 Comandas (KDS)</h1>
        <div className="seg">
          {[['', 'Todas'], ['cocina', 'Cocina'], ['bar', 'Bar']].map(([k, l]) => (
            <button key={k} className={station === k ? 'active' : ''} onClick={() => setStation(k)}>{l}</button>
          ))}
        </div>
      </div>
      <div className="kitchen-board">
        {tickets.map(t => {
          const m = minutes(t.created_at);
          return (
            <div key={t.id} className={`ticket ${t.kitchen_status === 'listo' ? 'listo' : ''} ${m >= 20 && t.kitchen_status === 'pendiente' ? 'late' : ''}`}>
              <h4>{t.table_name ? `Mesa ${t.table_name}` : `🛵 ${t.customer_name || t.channel}`} <span style={{ float: 'right', fontWeight: 400 }}>{m} min</span></h4>
              <p style={{ margin: '4px 0', fontSize: 16 }}><strong>{t.quantity}×</strong> {t.name_snapshot}</p>
              {t.seat && <span className="badge gray">C{t.seat}</span>}
              {t.notes && <div className="item-notes">📝 {t.notes}</div>}
              <span className={`badge ${t.kitchen_status === 'listo' ? 'green' : 'yellow'}`}>{t.kitchen_status}</span>
              <span className="badge gray" style={{ marginLeft: 4 }}>{t.station}</span>
              <div style={{ marginTop: 10, display: 'flex', gap: 6 }}>
                {t.kitchen_status === 'pendiente' && (
                  <button className="btn small" onClick={() => markStatus(t.id, 'listo')}>Marcar listo</button>
                )}
                {t.kitchen_status === 'listo' && (
                  <button className="btn small secondary" onClick={() => markStatus(t.id, 'entregado')}>Marcar entregado</button>
                )}
              </div>
            </div>
          );
        })}
        {tickets.length === 0 && <p>No hay comandas pendientes.</p>}
      </div>
    </div>
  );
}
