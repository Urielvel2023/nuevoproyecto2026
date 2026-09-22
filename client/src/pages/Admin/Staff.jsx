import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';

export default function Staff() {
  const { api } = useAuth();
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'mesero' });
  const [created, setCreated] = useState([]);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      const { data } = await api.post('/auth/create-staff', form);
      setCreated([...created, data]);
      setForm({ name: '', email: '', password: '', role: 'mesero' });
    } catch (err) {
      setError(err.response?.data?.error || 'Error al crear usuario');
    }
  }

  return (
    <div>
      <div className="topbar"><h1>👥 Personal</h1></div>
      <div className="card" style={{ maxWidth: 480 }}>
        <h3>Crear cuenta de mesero o cocina</h3>
        {error && <div className="error-msg">{error}</div>}
        <form onSubmit={submit}>
          <div className="field"><label>Nombre</label>
            <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
          <div className="field"><label>Correo</label>
            <input type="email" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
          <div className="field"><label>Contraseña</label>
            <input type="password" required value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} /></div>
          <div className="field"><label>Rol</label>
            <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
              <option value="mesero">Mesero</option>
              <option value="cocina">Cocina</option>
            </select></div>
          <button className="btn">Crear usuario</button>
        </form>
      </div>

      {created.length > 0 && (
        <div className="card">
          <h3>Usuarios creados en esta sesión</h3>
          <table>
            <thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th></tr></thead>
            <tbody>
              {created.map(u => <tr key={u.id}><td>{u.name}</td><td>{u.email}</td><td>{u.role}</td></tr>)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
