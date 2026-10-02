import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';

// Bitácora: quién, qué, cuándo, desde dónde, antes/después y quién autorizó
export default function AuditLog() {
  const { api } = useAuth();
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState('');

  useEffect(() => { api.get('/auth/audit-log').then(r => setRows(r.data)); }, []);

  const shown = rows.filter(r => !filter || `${r.action} ${r.user_name} ${r.entity}`.toLowerCase().includes(filter.toLowerCase()));
  const sensitive = ['item_anulado', 'descuento', 'cortesia', 'pago_anulado', 'autorizacion_rechazada', 'usuario_bloqueado', 'login_fallido'];

  return (
    <div>
      <div className="topbar"><h1>🕵️ Bitácora de auditoría</h1></div>
      <div className="card">
        <input placeholder="Filtrar por acción, usuario o entidad…" value={filter} onChange={e => setFilter(e.target.value)} />
      </div>
      <div className="card" style={{ overflowX: 'auto' }}>
        <table>
          <thead><tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Entidad</th><th>Antes</th><th>Después</th><th>Autorizó</th><th>IP</th></tr></thead>
          <tbody>
            {shown.map(r => (
              <tr key={r.id}>
                <td style={{ whiteSpace: 'nowrap' }}>{new Date(r.created_at).toLocaleString()}</td>
                <td>{r.user_name}<div style={{ fontSize: 11, color: '#6b7280' }}>{r.user_role}</div></td>
                <td><span className={`badge ${sensitive.includes(r.action) ? 'red' : 'gray'}`}>{r.action}</span></td>
                <td>{r.entity}</td>
                <td className="json-cell">{r.before_data}</td>
                <td className="json-cell">{r.after_data}</td>
                <td>{r.authorized_by ? '✔' : ''}</td>
                <td>{r.ip}</td>
              </tr>
            ))}
            {shown.length === 0 && <tr><td colSpan="8">Sin registros.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
