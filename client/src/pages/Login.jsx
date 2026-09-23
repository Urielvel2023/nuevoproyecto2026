import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const COUNTRIES = [
  { code: 'CO', name: 'Colombia', currency: 'COP', symbol: '$', tax: 'IVA', rate: 19 },
  { code: 'MX', name: 'México', currency: 'MXN', symbol: '$', tax: 'IVA', rate: 16 },
  { code: 'PE', name: 'Perú', currency: 'PEN', symbol: 'S/', tax: 'IGV', rate: 18 },
  { code: 'AR', name: 'Argentina', currency: 'ARS', symbol: '$', tax: 'IVA', rate: 21 },
  { code: 'CL', name: 'Chile', currency: 'CLP', symbol: '$', tax: 'IVA', rate: 19 },
  { code: 'EC', name: 'Ecuador', currency: 'USD', symbol: '$', tax: 'IVA', rate: 15 },
  { code: 'UY', name: 'Uruguay', currency: 'UYU', symbol: '$', tax: 'IVA', rate: 22 },
  { code: 'BR', name: 'Brasil', currency: 'BRL', symbol: 'R$', tax: 'ICMS', rate: 17 },
  { code: 'OTHER', name: 'Otro país', currency: 'USD', symbol: '$', tax: 'IVA', rate: 0 },
];

export default function Login() {
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState(searchParams.get('registro') ? 'register' : 'login');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [regForm, setRegForm] = useState({
    restaurantName: '', country: 'CO', adminName: '', email: '', password: ''
  });

  async function handleLogin(e) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const { data } = await axios.post('/api/auth/login', loginForm);
      login(data.token, data.user);
      navigate('/app');
    } catch (err) {
      setError(err.response?.data?.error || 'Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e) {
    e.preventDefault();
    setError(''); setLoading(true);
    const c = COUNTRIES.find(c => c.code === regForm.country);
    try {
      const { data } = await axios.post('/api/auth/register-restaurant', {
        ...regForm,
        currency: c.currency,
        currencySymbol: c.symbol,
        taxName: c.tax,
        taxRate: c.rate
      });
      login(data.token, data.user);
      navigate('/app');
    } catch (err) {
      setError(err.response?.data?.error || 'Error al registrar');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-box">
        <Link to="/" style={{ fontSize: 13, color: '#6b7280', textDecoration: 'none' }}>← Volver al inicio</Link>
        <h1>🍽️ Restaurant SaaS</h1>
        <div className="tab-switch">
          <button className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>Iniciar sesión</button>
          <button className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>Registrar restaurante</button>
        </div>

        {error && <div className="error-msg">{error}</div>}

        {mode === 'login' ? (
          <form onSubmit={handleLogin}>
            <div className="field">
              <label>Correo</label>
              <input type="email" required value={loginForm.email}
                onChange={e => setLoginForm({ ...loginForm, email: e.target.value })} />
            </div>
            <div className="field">
              <label>Contraseña</label>
              <input type="password" required value={loginForm.password}
                onChange={e => setLoginForm({ ...loginForm, password: e.target.value })} />
            </div>
            <button className="btn" style={{ width: '100%' }} disabled={loading}>
              {loading ? 'Ingresando...' : 'Ingresar'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleRegister}>
            <div className="field">
              <label>Nombre del restaurante/bar</label>
              <input required value={regForm.restaurantName}
                onChange={e => setRegForm({ ...regForm, restaurantName: e.target.value })} />
            </div>
            <div className="field">
              <label>País</label>
              <select value={regForm.country} onChange={e => setRegForm({ ...regForm, country: e.target.value })}>
                {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Tu nombre (administrador)</label>
              <input required value={regForm.adminName}
                onChange={e => setRegForm({ ...regForm, adminName: e.target.value })} />
            </div>
            <div className="field">
              <label>Correo</label>
              <input type="email" required value={regForm.email}
                onChange={e => setRegForm({ ...regForm, email: e.target.value })} />
            </div>
            <div className="field">
              <label>Contraseña</label>
              <input type="password" required value={regForm.password}
                onChange={e => setRegForm({ ...regForm, password: e.target.value })} />
            </div>
            <button className="btn" style={{ width: '100%' }} disabled={loading}>
              {loading ? 'Creando...' : 'Crear restaurante'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
