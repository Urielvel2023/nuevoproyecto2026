import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';

const PLAN_NAMES = { trial: 'Prueba gratuita', starter: 'Starter', pro: 'Pro' };
const STATUS_LABELS = {
  trialing: { label: 'En período de prueba', className: 'gray' },
  active: { label: 'Activa', className: 'green' },
  past_due: { label: 'Pago pendiente', className: 'red' },
  canceled: { label: 'Cancelada', className: 'red' }
};

export default function Subscription() {
  const { api } = useAuth();
  const [sub, setSub] = useState(null);
  const [plans, setPlans] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function load() {
    api.get('/billing/subscription').then(res => setSub(res.data));
    api.get('/billing/plans').then(res => setPlans(res.data));
  }
  useEffect(() => { load(); }, []);

  async function subscribeStripe(planId) {
    setError(''); setLoading(true);
    try {
      const { data } = await api.post('/billing/checkout-session', { plan: planId });
      window.location.href = data.url;
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo iniciar el pago');
    } finally { setLoading(false); }
  }

  async function subscribeWompi(planId) {
    setError(''); setLoading(true);
    try {
      const { data } = await api.post('/billing/checkout-wompi', { plan: planId });
      window.location.href = data.url;
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo iniciar el pago con Wompi');
    } finally { setLoading(false); }
  }

  async function openPortal() {
    setError(''); setLoading(true);
    try {
      const { data } = await api.post('/billing/portal-session');
      window.location.href = data.url;
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo abrir el portal de facturación');
    } finally { setLoading(false); }
  }

  if (!sub) return <p>Cargando...</p>;

  const trialDaysLeft = sub.trial_ends_at
    ? Math.max(0, Math.ceil((new Date(sub.trial_ends_at) - new Date()) / 86400000))
    : null;

  return (
    <div>
      <div className="topbar"><h1>💳 Suscripción</h1></div>
      {error && <div className="error-msg">{error}</div>}

      <div className="card">
        <h3>Plan actual: {PLAN_NAMES[sub.plan] || sub.plan}</h3>
        <p><span className={`badge ${STATUS_LABELS[sub.status]?.className || 'gray'}`}>{STATUS_LABELS[sub.status]?.label || sub.status}</span></p>
        {sub.status === 'trialing' && trialDaysLeft != null && (
          <p style={{ color: '#6b7280' }}>Te quedan {trialDaysLeft} día(s) de prueba gratuita.</p>
        )}
        {sub.current_period_end && (
          <p style={{ color: '#6b7280' }}>Próxima renovación: {sub.current_period_end.slice(0, 10)}</p>
        )}
        {sub.provider === 'wompi' && sub.status === 'active' && (
          <p style={{ color: '#6b7280', fontSize: 13 }}>
            Pagado con Wompi. Wompi no renueva automáticamente: vuelve a esta página antes de la fecha de renovación
            para pagar el siguiente período.
          </p>
        )}
        {sub.stripe_customer_id && (
          <button className="btn small secondary" disabled={loading} onClick={openPortal}>Gestionar suscripción / método de pago (Stripe)</button>
        )}
      </div>

      <div className="card">
        <h3>Planes disponibles</h3>
        {plans.every(p => !p.stripe_configured && !p.wompi_configured) && (
          <p style={{ color: '#6b7280' }}>
            El cobro de suscripción aún no está configurado (faltan las llaves de Stripe o Wompi en el servidor).
          </p>
        )}
        <div className="grid grid-2">
          {plans.map(p => (
            <div key={p.id} className="card" style={{ border: sub.plan === p.id ? '2px solid #2f6feb' : undefined }}>
              <h4>{p.name}</h4>
              {p.wompi_configured && (
                <p style={{ fontWeight: 600, marginBottom: 8 }}>${p.wompi_price_cop.toLocaleString('es-CO')} COP/mes</p>
              )}
              {!p.stripe_configured && !p.wompi_configured && <p style={{ color: '#ef4444', fontSize: 13 }}>Precio no configurado aún</p>}

              {p.wompi_configured && (
                <button className="btn small" style={{ marginRight: 8 }} disabled={loading} onClick={() => subscribeWompi(p.id)}>
                  {sub.plan === p.id && sub.status === 'active' ? 'Renovar con Wompi' : 'Pagar con Wompi'}
                </button>
              )}
              {p.stripe_configured && (
                <button className="btn small secondary" disabled={loading} onClick={() => subscribeStripe(p.id)}>
                  Pagar con Stripe
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
