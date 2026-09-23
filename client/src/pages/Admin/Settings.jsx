import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';

export default function Settings() {
  const { api } = useAuth();
  const [restaurant, setRestaurant] = useState(null);
  const [form, setForm] = useState({ taxName: '', taxRate: 0, serviceChargeRate: 0 });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  function load() {
    api.get('/settings').then(res => {
      setRestaurant(res.data);
      setForm({
        taxName: res.data.tax_name,
        taxRate: res.data.tax_rate,
        serviceChargeRate: res.data.service_charge_rate
      });
    });
  }

  useEffect(() => { load(); }, []);

  async function save(e) {
    e.preventDefault();
    setError(''); setSaved(false);
    try {
      const { data } = await api.put('/settings', {
        taxName: form.taxName,
        taxRate: Number(form.taxRate),
        serviceChargeRate: Number(form.serviceChargeRate)
      });
      setRestaurant(data);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo guardar');
    }
  }

  if (!restaurant) return <p>Cargando...</p>;

  return (
    <div>
      <div className="topbar"><h1>⚙️ Configuración</h1></div>
      {error && <div className="error-msg">{error}</div>}
      {saved && <div className="success-msg">Guardado.</div>}

      <div className="card" style={{ maxWidth: 480 }}>
        <h3>Impuesto y % de servicio</h3>
        <p style={{ color: '#6b7280', fontSize: 13 }}>
          El <strong>% de servicio</strong> (ej. el 10% que se acostumbra en Colombia) es opcional y
          depende de cada país y de la política de tu negocio — no es un impuesto. Déjalo en 0 si no
          lo cobras. Cuando esté activo, se suma automáticamente a la cuenta de cada mesa/domicilio.
        </p>
        <form onSubmit={save} className="grid grid-2">
          <div className="field"><label>Nombre del impuesto local</label>
            <input value={form.taxName} onChange={e => setForm({ ...form, taxName: e.target.value })} /></div>
          <div className="field"><label>% de {form.taxName || 'impuesto'}</label>
            <input type="number" step="any" min="0" max="100" value={form.taxRate}
              onChange={e => setForm({ ...form, taxRate: e.target.value })} /></div>
          <div className="field"><label>% de servicio (propina/servicio)</label>
            <input type="number" step="any" min="0" max="100" value={form.serviceChargeRate}
              onChange={e => setForm({ ...form, serviceChargeRate: e.target.value })} /></div>
          <div className="field" style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button className="btn" style={{ width: '100%' }}>Guardar</button>
          </div>
        </form>
      </div>
    </div>
  );
}
