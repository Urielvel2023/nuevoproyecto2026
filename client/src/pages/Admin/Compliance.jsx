import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

// Qué normas aplican en el país del negocio y qué falta configurar para operar legalmente
export default function Compliance() {
  const { api, user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  function load() {
    api.get('/compliance/status').then(r => setData(r.data)).catch(() => setError('No se pudo cargar el estado'));
  }
  useEffect(() => { load(); }, []);

  async function accept() {
    try {
      await api.post('/compliance/accept');
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo registrar la aceptación');
    }
  }

  if (!data) return <p>{error || 'Cargando…'}</p>;
  const p = data.profile;
  const pending = data.checks.filter(c => !c.ok).length;

  return (
    <div>
      <div className="topbar"><h1>⚖️ Cumplimiento legal — {p.name}</h1></div>
      {error && <div className="error-msg">{error}</div>}
      <div className="card">
        <h3>{pending === 0 ? '✔ Todo configurado' : `${pending} punto(s) pendiente(s)`}</h3>
        <table>
          <tbody>
            {data.checks.map(c => (
              <tr key={c.key}>
                <td style={{ width: 30 }}>{c.ok ? '✅' : '⚠️'}</td>
                <td><strong>{c.label}</strong><div style={{ fontSize: 12, color: '#6b7280' }}>{c.detail}</div></td>
              </tr>
            ))}
          </tbody>
        </table>
        {user.role === 'admin' && data.checks.some(c => (c.key === 'terms' || c.key === 'legal_current') && !c.ok) && (
          <button className="btn" style={{ marginTop: 10 }} onClick={accept}>Aceptar términos versión {data.legal_version}</button>
        )}
      </div>
      <div className="card">
        <h3>Marco aplicable</h3>
        <table>
          <tbody>
            <tr><td>Autoridad tributaria</td><td>{p.fiscal_authority}</td></tr>
            <tr><td>Facturación</td><td>{p.einvoice}</td></tr>
            <tr><td>Impuesto de referencia</td><td>{p.tax_name} {p.tax_rate} % · Moneda {p.currency}</td></tr>
            <tr><td>Datos personales</td><td>{p.data_protection}</td></tr>
            <tr><td>Laboral</td><td>{p.labor}</td></tr>
            <tr><td>Propinas</td><td>{p.tips}</td></tr>
            {p.notes.map((n, i) => <tr key={i}><td>Nota</td><td>{n}</td></tr>)}
          </tbody>
        </table>
        <p style={{ fontSize: 12, color: '#6b7280' }}>{data.disclaimer}</p>
        <p style={{ fontSize: 13 }}><Link to="/legal/terminos">Términos y condiciones</Link> · <Link to="/legal/privacidad">Política de privacidad</Link></p>
      </div>
    </div>
  );
}
