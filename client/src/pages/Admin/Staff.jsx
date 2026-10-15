import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';

// Cada usuario tiene su propia clave (intransferible) y un rol por departamento.
// La matriz de abajo es la misma que aplica el servidor.
export default function Staff() {
  const { api, user, can } = useAuth();
  const [roles, setRoles] = useState([]);
  const [staff, setStaff] = useState([]);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'mesero' });
  const [error, setError] = useState('');

  function load() {
    api.get('/auth/staff').then(r => setStaff(r.data));
    api.get('/auth/roles').then(r => setRoles(r.data));
  }
  useEffect(() => { load(); }, []);

  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/auth/create-staff', form);
      setForm({ name: '', email: '', password: '', role: form.role });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Error al crear usuario');
    }
  }

  async function update(u, body) {
    setError('');
    try {
      await api.put(`/auth/staff/${u.id}`, body);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo actualizar');
    }
  }

  const label = (r) => roles.find(x => x.role === r)?.label || r;
  const creatable = roles.filter(r => r.role !== 'admin' && (r.role !== 'gerencia' || user.role === 'admin'));
  const modules = [...new Set(roles.flatMap(r => Object.keys(r.permissions)))];
  const short = { ver: 'V', crear: 'C', editar: 'E', eliminar: 'D', aprobar: 'A', anular: 'N', exportar: 'X' };

  return (
    <div>
      <div className="topbar"><h1>👥 Usuarios y accesos por departamento</h1></div>
      {error && <div className="error-msg">{error}</div>}

      <div className="grid grid-2">
        {can('usuarios', 'crear') && (
          <div className="card">
            <h3>Crear usuario (clave única e intransferible)</h3>
            <form onSubmit={submit}>
              <div className="field"><label>Nombre</label>
                <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
              <div className="field"><label>Correo (usuario)</label>
                <input type="email" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
              <div className="field"><label>Contraseña inicial (mín. 8)</label>
                <input type="password" minLength={8} required value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} /></div>
              <div className="field"><label>Departamento / rol</label>
                <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                  {creatable.map(r => <option key={r.role} value={r.role}>{r.label}</option>)}
                </select></div>
              <button className="btn">Crear usuario</button>
            </form>
          </div>
        )}

        <div className="card">
          <h3>Usuarios</h3>
          <table>
            <thead><tr><th>Nombre</th><th>Rol</th><th>Estado</th><th>PIN</th><th></th></tr></thead>
            <tbody>
              {staff.map(u => {
                const locked = u.locked_until && new Date(u.locked_until) > new Date();
                return (
                  <tr key={u.id}>
                    <td>{u.name}<div style={{ fontSize: 11, color: '#6b7280' }}>{u.email}</div></td>
                    <td>{label(u.role)}</td>
                    <td>
                      <span className={`badge ${u.active ? 'green' : 'gray'}`}>{u.active ? 'activo' : 'inactivo'}</span>
                      {locked && <span className="badge red" style={{ marginLeft: 4 }}>bloqueado</span>}
                    </td>
                    <td>{u.has_pin ? '✔' : '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {can('usuarios', 'editar') && u.role !== 'admin' && u.id !== user.id && (
                        <>
                          <button className="btn small secondary" onClick={() => update(u, { active: !u.active })}>
                            {u.active ? 'Desactivar' : 'Activar'}
                          </button>
                          {locked && <button className="btn small" style={{ marginLeft: 4 }} onClick={() => update(u, { unlock: true })}>Desbloquear</button>}
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h3>Matriz de accesos</h3>
        <p style={{ fontSize: 12, color: '#6b7280' }}>
          V=ver · C=crear · E=editar · D=eliminar · A=aprobar · N=anular · X=exportar. Se ajusta en <code>server/permissions.js</code>.
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead><tr><th>Módulo</th>{roles.map(r => <th key={r.role}>{r.label}</th>)}</tr></thead>
            <tbody>
              {modules.map(m => (
                <tr key={m}>
                  <td><strong>{m}</strong></td>
                  {roles.map(r => (
                    <td key={r.role} style={{ fontFamily: 'monospace' }}>
                      {(r.permissions[m] || []).map(a => short[a]).join('') || '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
