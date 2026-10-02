import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';

const STATUS_LABEL = {
  libre: 'Libre', ocupada: 'Ocupada', por_limpiar: 'Por limpiar',
  reservada: 'Reservada', unida: 'Unida', bloqueada: 'Bloqueada'
};

export const money = (n) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function minutesSince(ts) {
  if (!ts) return null;
  const d = ts.includes('T') ? new Date(ts) : new Date(ts.replace(' ', 'T') + 'Z');
  return Math.max(0, Math.round((Date.now() - d.getTime()) / 60000));
}

export default function Tables() {
  const { api, user, can } = useAuth();
  const socket = useSocket();
  const navigate = useNavigate();
  const [tables, setTables] = useState([]);
  const [zones, setZones] = useState([]);
  const [zone, setZone] = useState('salon');
  const [onlyMine, setOnlyMine] = useState(user?.role === 'mesero');
  const [selected, setSelected] = useState(null);
  const [guests, setGuests] = useState(2);
  const [error, setError] = useState('');
  const [setup, setSetup] = useState({ salon: 30, terraza: 10, barra: 6, vip: 0 });
  const [, setTick] = useState(0);

  function load() {
    api.get('/orders/tables').then(res => setTables(res.data));
  }
  useEffect(() => {
    load();
    api.get('/orders/zones').then(res => setZones(res.data));
    const id = setInterval(() => setTick(t => t + 1), 60000); // refresca minutos de ocupación
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!socket) return;
    const handler = () => load();
    socket.on('tables:changed', handler);
    socket.on('order:changed', handler);
    socket.on('order:closed', handler);
    return () => {
      socket.off('tables:changed', handler);
      socket.off('order:changed', handler);
      socket.off('order:closed', handler);
    };
  }, [socket]);

  const supervisor = can('mesas', 'aprobar');
  const isMesero = user?.role === 'mesero';

  function belongsToOther(t) {
    return isMesero && ((t.open_order_id && t.order_waiter_id !== user.id) ||
      (!t.open_order_id && t.assigned_waiter_id && t.assigned_waiter_id !== user.id));
  }

  async function act(fn) {
    setError('');
    try {
      await fn();
      setSelected(null);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo completar la acción');
    }
  }

  function clickTable(t) {
    setError('');
    if (t.status === 'unida') {
      const main = tables.find(x => x.id === t.merged_into);
      if (main && main.open_order_id && !belongsToOther(main)) navigate(`/mesero/pedido/${main.open_order_id}`);
      return;
    }
    if (t.open_order_id) {
      if (belongsToOther(t)) { setError(`La mesa ${t.name} la atiende ${t.order_waiter_name}`); return; }
      navigate(`/mesero/pedido/${t.open_order_id}`);
      return;
    }
    setGuests(Math.min(t.capacity || 2, 2));
    setSelected(t);
  }

  async function openTable() {
    await act(async () => {
      const { data } = await api.post('/orders', { table_id: selected.id, guests });
      navigate(`/mesero/pedido/${data.id}`);
    });
  }

  const setStatus = (t, status) => act(() => api.put(`/orders/tables/${t.id}`, { status }));

  const zoneTables = tables.filter(t => t.zone === zone);
  const shown = zoneTables.filter(t => !onlyMine || !isMesero || t.mine || t.status === 'libre' || t.status === 'por_limpiar');
  const stats = (z) => {
    const list = tables.filter(t => t.zone === z);
    const busy = list.filter(t => ['ocupada', 'unida'].includes(t.status)).length;
    return { total: list.length, busy };
  };
  const zoneSales = zoneTables.reduce((s, t) => s + (t.items_total || 0), 0);

  return (
    <div>
      <div className="topbar">
        <h1>🍽️ Mesas</h1>
        {isMesero && (
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, margin: 0 }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={onlyMine} onChange={e => setOnlyMine(e.target.checked)} />
            Solo mis mesas y libres
          </label>
        )}
      </div>

      <div className="zone-tabs">
        {zones.filter(z => stats(z.key).total > 0).map(z => {
          const s = stats(z.key);
          return (
            <button key={z.key} className={zone === z.key ? 'active' : ''} onClick={() => setZone(z.key)}>
              {z.label} <span className="zone-count">{s.busy}/{s.total}</span>
            </button>
          );
        })}
      </div>

      <div className="legend">
        {Object.entries(STATUS_LABEL).map(([k, v]) => <span key={k} className={`legend-dot ${k}`}>{v}</span>)}
        <span style={{ marginLeft: 'auto', fontSize: 13 }}>
          Consumo abierto en zona: <strong>{money(zoneSales)}</strong>
        </span>
      </div>

      {error && <div className="error-msg">{error}</div>}

      <div className="tables-grid">
        {shown.map(t => {
          const mins = minutesSince(t.opened_at || t.occupied_since);
          return (
            <div key={t.id} className={`table-tile ${t.status} ${belongsToOther(t) ? 'other' : ''}`} onClick={() => clickTable(t)}>
              <div className="table-name">{t.name}</div>
              <div className="table-meta">👥 {t.guests ? `${t.guests}/` : ''}{t.capacity}</div>
              <div className="table-meta">{STATUS_LABEL[t.status]}</div>
              {t.open_order_id && (
                <>
                  <div className="table-meta">{t.order_waiter_name}</div>
                  <div className="table-meta"><strong>{money(t.items_total)}</strong>{mins != null && ` · ${mins} min`}</div>
                </>
              )}
              {t.status === 'unida' && <div className="table-meta">→ {tables.find(x => x.id === t.merged_into)?.name}</div>}
              {t.status === 'por_limpiar' && (
                <button className="btn small" onClick={e => { e.stopPropagation(); setStatus(t, 'libre'); }}>Marcar limpia</button>
              )}
            </div>
          );
        })}
        {shown.length === 0 && <p>No hay mesas en esta zona.</p>}
      </div>

      {selected && (
        <div className="modal-backdrop" onClick={() => setSelected(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Mesa {selected.name} — {STATUS_LABEL[selected.status]}</h3>
            {['libre', 'reservada'].includes(selected.status) && !belongsToOther(selected) && (
              <>
                <div className="field">
                  <label>Comensales</label>
                  <div className="qty-row">
                    <button className="btn secondary" onClick={() => setGuests(g => Math.max(1, g - 1))}>−</button>
                    <strong>{guests}</strong>
                    <button className="btn secondary" onClick={() => setGuests(g => g + 1)}>+</button>
                  </div>
                </div>
                <button className="btn" style={{ width: '100%' }} onClick={openTable}>Abrir mesa y tomar pedido</button>
              </>
            )}
            <div className="modal-actions">
              {selected.status === 'libre' && <button className="btn small secondary" onClick={() => setStatus(selected, 'reservada')}>Reservar</button>}
              {selected.status === 'reservada' && <button className="btn small secondary" onClick={() => setStatus(selected, 'libre')}>Quitar reserva</button>}
              {supervisor && selected.status !== 'bloqueada' && <button className="btn small danger" onClick={() => setStatus(selected, 'bloqueada')}>Bloquear</button>}
              {supervisor && selected.status === 'bloqueada' && <button className="btn small" onClick={() => setStatus(selected, 'libre')}>Desbloquear</button>}
              <button className="btn small secondary" onClick={() => setSelected(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {can('mesas', 'crear') && (
        <div className="card" style={{ marginTop: 24 }}>
          <h3>Configurar zonas</h3>
          <p style={{ fontSize: 12, color: '#6b7280' }}>
            Crea las mesas que falten (no borra mesas existentes). El salón principal siempre tiene mínimo 30 mesas.
          </p>
          <div className="grid grid-4">
            {Object.keys(setup).map(k => (
              <div key={k} className="field">
                <label>{zones.find(z => z.key === k)?.label || k}</label>
                <input type="number" min={k === 'salon' ? 30 : 0} value={setup[k]}
                  onChange={e => setSetup({ ...setup, [k]: e.target.value })} />
              </div>
            ))}
          </div>
          <button className="btn" onClick={() => act(() => api.post('/orders/tables/setup', setup))}>Aplicar configuración</button>
        </div>
      )}
    </div>
  );
}
