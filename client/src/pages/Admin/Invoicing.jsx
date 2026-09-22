import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';

const PROVIDER_LABELS = {
  none: 'Ninguno (solo borrador interno)',
  manual: 'Manual (ya facturo por fuera del sistema)',
  alegra: 'Alegra — Colombia (DIAN)',
  facturama: 'Facturama — México (SAT)',
  nubefact: 'Nubefact — Perú (SUNAT)'
};

const STATUS_LABELS = {
  pendiente: { label: 'Pendiente', className: 'gray' },
  emitida: { label: 'Emitida', className: 'green' },
  rechazada: { label: 'Rechazada', className: 'red' },
  anulada: { label: 'Anulada', className: 'gray' }
};

export default function Invoicing() {
  const { api } = useAuth();
  const [settings, setSettings] = useState(null);
  const [providers, setProviders] = useState([]);
  const [orders, setOrders] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [issuing, setIssuing] = useState(null); // order being facturado
  const [customer, setCustomer] = useState({ customer_name: '', customer_tax_id: '', customer_email: '', manual_cufe: '' });
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  function load() {
    api.get('/invoicing/settings').then(res => setSettings(res.data));
    api.get('/invoicing/providers').then(res => setProviders(res.data));
    api.get('/orders/recent-closed').then(res => setOrders(res.data));
    api.get('/invoicing/documents').then(res => setDocuments(res.data));
  }
  useEffect(() => { load(); }, []);

  async function saveSettings(e) {
    e.preventDefault();
    setError(''); setMsg('');
    try {
      const { data } = await api.put('/invoicing/settings', settings);
      setSettings(data);
      setMsg('Configuración guardada.');
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo guardar');
    }
  }

  async function issueInvoice(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post(`/invoicing/orders/${issuing.id}`, customer);
      setIssuing(null);
      setCustomer({ customer_name: '', customer_tax_id: '', customer_email: '', manual_cufe: '' });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo emitir la factura');
    }
  }

  async function openPdf(docId) {
    const res = await api.get(`/invoicing/documents/${docId}/pdf`, { responseType: 'blob' });
    const url = URL.createObjectURL(res.data);
    window.open(url, '_blank');
  }

  if (!settings) return <p>Cargando...</p>;

  return (
    <div>
      <div className="topbar"><h1>🧾 Facturación electrónica</h1></div>

      {settings.provider === 'none' && (
        <div className="error-msg" style={{ marginBottom: 16 }}>
          No tienes un proveedor de facturación electrónica configurado. Los documentos que emitas serán
          <strong> borradores internos sin validez fiscal</strong> hasta que conectes un proveedor certificado
          (DIAN/SAT/SUNAT) abajo.
        </div>
      )}
      {msg && <div className="card" style={{ borderColor: '#10b981', marginBottom: 16 }}>{msg}</div>}
      {error && <div className="error-msg">{error}</div>}

      <div className="grid grid-2">
        <div className="card">
          <h3>Configuración fiscal</h3>
          <form onSubmit={saveSettings}>
            <div className="field"><label>Razón social</label>
              <input value={settings.legal_name || ''} onChange={e => setSettings({ ...settings, legal_name: e.target.value })} /></div>
            <div className="field"><label>NIT / RFC / RUC</label>
              <input value={settings.tax_id || ''} onChange={e => setSettings({ ...settings, tax_id: e.target.value })} /></div>
            <div className="field"><label>Dirección</label>
              <input value={settings.address || ''} onChange={e => setSettings({ ...settings, address: e.target.value })} /></div>
            <div className="field"><label>Régimen fiscal</label>
              <input value={settings.fiscal_regime || ''} onChange={e => setSettings({ ...settings, fiscal_regime: e.target.value })} /></div>

            <div className="field"><label>Proveedor certificado</label>
              <select value={settings.provider} onChange={e => setSettings({ ...settings, provider: e.target.value })}>
                {providers.map(p => <option key={p} value={p}>{PROVIDER_LABELS[p] || p}</option>)}
              </select>
            </div>

            {['alegra', 'facturama'].includes(settings.provider) && (
              <>
                <div className="field"><label>Usuario / correo de la cuenta</label>
                  <input value={settings.provider_api_key || ''} onChange={e => setSettings({ ...settings, provider_api_key: e.target.value })} /></div>
                <div className="field"><label>Token / contraseña de API</label>
                  <input type="password" value={settings.provider_api_secret || ''} onChange={e => setSettings({ ...settings, provider_api_secret: e.target.value })} /></div>
              </>
            )}
            {settings.provider === 'nubefact' && (
              <>
                <div className="field"><label>URL de ruta (endpoint de tu cuenta)</label>
                  <input value={settings.provider_api_key || ''} onChange={e => setSettings({ ...settings, provider_api_key: e.target.value })} /></div>
                <div className="field"><label>Token</label>
                  <input type="password" value={settings.provider_api_secret || ''} onChange={e => setSettings({ ...settings, provider_api_secret: e.target.value })} /></div>
              </>
            )}

            <div className="field"><label>Prefijo de numeración</label>
              <input value={settings.invoice_prefix || ''} onChange={e => setSettings({ ...settings, invoice_prefix: e.target.value })} /></div>
            <div className="field"><label>Número de resolución (DIAN u equivalente)</label>
              <input value={settings.invoice_resolution_number || ''} onChange={e => setSettings({ ...settings, invoice_resolution_number: e.target.value })} /></div>

            <button className="btn">Guardar configuración</button>
          </form>
        </div>

        <div className="card">
          <h3>Cuentas cerradas recientes</h3>
          <table>
            <thead><tr><th>Cuenta</th><th>Total</th><th>Fecha</th><th></th></tr></thead>
            <tbody>
              {orders.map(o => (
                <tr key={o.id}>
                  <td>{o.table_name || o.customer_name || (o.channel === 'domicilio' ? 'Domicilio' : 'Recoger')}</td>
                  <td>{Number(o.total).toFixed(2)}</td>
                  <td>{(o.closed_at || '').slice(0, 16).replace('T', ' ')}</td>
                  <td>
                    {o.invoice_number
                      ? <span className="badge green">{o.invoice_number}</span>
                      : <button className="btn small" onClick={() => setIssuing(o)}>Facturar</button>}
                  </td>
                </tr>
              ))}
              {orders.length === 0 && <tr><td colSpan="4">Aún no hay cuentas cerradas.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {issuing && (
        <div className="card" style={{ maxWidth: 480 }}>
          <h3>Emitir factura — {issuing.table_name || issuing.customer_name || 'pedido'}</h3>
          <form onSubmit={issueInvoice}>
            <div className="field"><label>Nombre del cliente</label>
              <input value={customer.customer_name} onChange={e => setCustomer({ ...customer, customer_name: e.target.value })} /></div>
            <div className="field"><label>NIT / cédula / RFC / RUC del cliente</label>
              <input value={customer.customer_tax_id} onChange={e => setCustomer({ ...customer, customer_tax_id: e.target.value })} /></div>
            <div className="field"><label>Correo del cliente</label>
              <input type="email" value={customer.customer_email} onChange={e => setCustomer({ ...customer, customer_email: e.target.value })} /></div>
            {settings.provider === 'manual' && (
              <div className="field"><label>CUFE / folio fiscal (si ya lo emitiste por fuera)</label>
                <input value={customer.manual_cufe} onChange={e => setCustomer({ ...customer, manual_cufe: e.target.value })} /></div>
            )}
            <button className="btn">Emitir</button>
            <button type="button" className="btn secondary" onClick={() => setIssuing(null)} style={{ marginLeft: 8 }}>Cancelar</button>
          </form>
        </div>
      )}

      <div className="card">
        <h3>Documentos emitidos</h3>
        <table>
          <thead><tr><th>Número</th><th>Cliente</th><th>Total</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            {documents.map(d => (
              <tr key={d.id}>
                <td>{d.full_number}</td>
                <td>{d.customer_name || '—'}</td>
                <td>{Number(d.total).toFixed(2)}</td>
                <td><span className={`badge ${STATUS_LABELS[d.status]?.className || 'gray'}`}>{STATUS_LABELS[d.status]?.label || d.status}</span></td>
                <td><button className="btn small secondary" onClick={() => openPdf(d.id)}>PDF</button></td>
              </tr>
            ))}
            {documents.length === 0 && <tr><td colSpan="5">Aún no has emitido documentos.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
