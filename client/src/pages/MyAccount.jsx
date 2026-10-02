import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function MyAccount() {
  const { api, can } = useAuth();
  const [pw, setPw] = useState({ current_password: '', new_password: '' });
  const [pin, setPin] = useState({ pin: '', current_password: '' });
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [params] = useSearchParams();

  async function send(path, body, reset) {
    setMsg(''); setError('');
    try {
      await api.put(path, body);
      setMsg('Guardado correctamente');
      reset();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo guardar');
    }
  }

  return (
    <div>
      <div className="topbar"><h1>🔑 Mi clave y PIN</h1></div>
      {params.get('expirada') && !msg && (
        <div className="error-msg">Tu contraseña venció (política de cambio periódico). Cámbiala para continuar trabajando con seguridad.</div>
      )}
      {msg && <div className="card" style={{ color: '#065f46' }}>{msg}</div>}
      {error && <div className="error-msg">{error}</div>}
      <div className="grid grid-2">
        <div className="card">
          <h3>Cambiar mi contraseña</h3>
          <p style={{ fontSize: 12, color: '#6b7280' }}>Tu clave es personal e intransferible. Todo lo que hagas queda en la bitácora con tu usuario.</p>
          <form onSubmit={e => { e.preventDefault(); send('/auth/me/password', pw, () => setPw({ current_password: '', new_password: '' })); }}>
            <div className="field"><label>Contraseña actual</label>
              <input type="password" required value={pw.current_password} onChange={e => setPw({ ...pw, current_password: e.target.value })} /></div>
            <div className="field"><label>Nueva contraseña (mín. 8)</label>
              <input type="password" minLength={8} required value={pw.new_password} onChange={e => setPw({ ...pw, new_password: e.target.value })} /></div>
            <button className="btn">Cambiar contraseña</button>
          </form>
        </div>
        {can('autorizaciones', 'aprobar') && (
          <div className="card">
            <h3>PIN de autorización especial</h3>
            <p style={{ fontSize: 12, color: '#6b7280' }}>
              Con este PIN autorizas anulaciones, descuentos, cortesías y anulación de pagos en el puesto del mesero o la caja.
            </p>
            <form onSubmit={e => { e.preventDefault(); send('/auth/me/pin', pin, () => setPin({ pin: '', current_password: '' })); }}>
              <div className="field"><label>Nuevo PIN (4 a 8 dígitos)</label>
                <input type="password" inputMode="numeric" pattern="\d{4,8}" required value={pin.pin} onChange={e => setPin({ ...pin, pin: e.target.value })} /></div>
              <div className="field"><label>Confirma con tu contraseña</label>
                <input type="password" required value={pin.current_password} onChange={e => setPin({ ...pin, current_password: e.target.value })} /></div>
              <button className="btn">Guardar PIN</button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
