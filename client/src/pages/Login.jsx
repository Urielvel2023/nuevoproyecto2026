import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';


export default function Login() {
  const [mode, setMode] = useState('login');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [regForm, setRegForm] = useState({
    restaurantName: '', country: 'VE', adminName: '', email: '', password: '', terraceTables: 10, acceptTerms: false
  });
  // Perfiles legales por país servidos por el backend (server/compliance.js)
  const [legal, setLegal] = useState({ countries: [] });
  useEffect(() => {
    axios.get('/api/compliance/countries').then(r => setLegal(r.data)).catch(() => {});
  }, []);
  const profile = legal.countries.find(c => c.code === regForm.country);

  async function handleLogin(e) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const { data } = await axios.post('/api/auth/login', loginForm);
      login(data.token, data.user, data.permissions);
      navigate(data.password_expired ? '/mi-cuenta?expirada=1' : '/');
    } catch (err) {
      setError(err.response?.data?.error || 'Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const { data } = await axios.post('/api/auth/register-restaurant', regForm);
      login(data.token, data.user, data.permissions);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Error al registrar');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-box">
        <h1>🍽️ Living POS</h1>
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
                {legal.countries.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
              </select>
              {profile && (
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 6, lineHeight: 1.5 }}>
                  {profile.tax_name} {profile.tax_rate} % · {profile.currency} · Facturación: {profile.fiscal_authority}<br />
                  Datos personales: {profile.data_protection}
                </div>
              )}
            </div>
            <div className="field">
              <label>Mesas de terraza (el salón principal se crea con 30 mesas)</label>
              <input type="number" min="0" max="200" value={regForm.terraceTables}
                onChange={e => setRegForm({ ...regForm, terraceTables: e.target.value })} />
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
              <label>Contraseña (mínimo 8 caracteres)</label>
              <input type="password" required minLength={8} value={regForm.password}
                onChange={e => setRegForm({ ...regForm, password: e.target.value })} />
            </div>
            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12, color: '#374151', marginBottom: 12 }}>
              <input type="checkbox" required style={{ width: 'auto', marginTop: 2 }} checked={regForm.acceptTerms}
                onChange={e => setRegForm({ ...regForm, acceptTerms: e.target.checked })} />
              <span>
                Acepto los <Link to="/legal/terminos" target="_blank">términos</Link> y la <Link to="/legal/privacidad" target="_blank">política de privacidad</Link>,
                y que mi negocio es responsable de cumplir la ley tributaria, laboral y de datos personales de su país.
                {legal.disclaimer && <span style={{ display: 'block', color: '#6b7280', marginTop: 4 }}>{legal.disclaimer}</span>}
              </span>
            </label>
            <button className="btn" style={{ width: '100%' }} disabled={loading}>
              {loading ? 'Creando...' : 'Crear restaurante'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
