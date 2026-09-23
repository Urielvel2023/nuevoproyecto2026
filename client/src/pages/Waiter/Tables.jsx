import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';

export default function Tables() {
  const { api } = useAuth();
  const socket = useSocket();
  const navigate = useNavigate();
  const [tables, setTables] = useState([]);

  function load() {
    api.get('/orders/tables').then(res => setTables(res.data));
  }
  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!socket) return;
    const handler = () => load();
    socket.on('tables:changed', handler);
    return () => socket.off('tables:changed', handler);
  }, [socket]);

  async function openTable(table) {
    if (table.open_order_id) {
      navigate(`/app/mesero/pedido/${table.open_order_id}`);
      return;
    }
    const { data } = await api.post('/orders', { table_id: table.id });
    navigate(`/app/mesero/pedido/${data.id}`);
  }

  return (
    <div>
      <div className="topbar"><h1>🍽️ Mesas</h1></div>
      <div className="tables-grid">
        {tables.map(t => (
          <div key={t.id} className={`table-tile ${t.status}`} onClick={() => openTable(t)}>
            {t.name}
            <div style={{ fontSize: 11, fontWeight: 400, marginTop: 4 }}>
              {t.status === 'ocupada' ? 'Ocupada — toca para ver cuenta' : 'Libre — toca para abrir'}
            </div>
          </div>
        ))}
        {tables.length === 0 && <p>No hay mesas configuradas.</p>}
      </div>
    </div>
  );
}
