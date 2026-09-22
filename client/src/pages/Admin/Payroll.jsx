import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';

export default function Payroll() {
  const { api } = useAuth();
  const [tab, setTab] = useState('empleados');
  const [employees, setEmployees] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [activePeriod, setActivePeriod] = useState(null);
  const [periodForm, setPeriodForm] = useState({ period_start: '', period_end: '' });
  const [error, setError] = useState('');

  function load() {
    api.get('/payroll/employees').then(res => setEmployees(res.data));
    api.get('/payroll/attendance').then(res => setAttendance(res.data));
    api.get('/payroll/periods').then(res => setPeriods(res.data));
  }
  useEffect(() => { load(); }, []);

  async function updateEmployee(userId, patch) {
    setError('');
    try {
      await api.put(`/payroll/employees/${userId}`, patch);
      load();
    } catch (err) { setError(err.response?.data?.error || 'No se pudo guardar'); }
  }

  async function createPeriod(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/payroll/periods', periodForm);
      setPeriodForm({ period_start: '', period_end: '' });
      load();
    } catch (err) { setError(err.response?.data?.error || 'No se pudo crear el período'); }
  }

  async function openPeriod(id) {
    const { data } = await api.get(`/payroll/periods/${id}`);
    setActivePeriod(data);
  }

  async function generatePayroll() {
    setError('');
    try {
      const { data } = await api.post(`/payroll/periods/${activePeriod.id}/generate`, {});
      setActivePeriod(data);
      load();
    } catch (err) { setError(err.response?.data?.error || 'No se pudo generar la nómina'); }
  }

  async function markPaid() {
    if (!confirm('¿Marcar este período como pagado?')) return;
    const { data } = await api.put(`/payroll/periods/${activePeriod.id}/status`, { status: 'pagado' });
    setActivePeriod({ ...activePeriod, status: data.status });
    load();
  }

  return (
    <div>
      <div className="topbar"><h1>🧑‍💼 Nómina y asistencia</h1></div>
      <div className="tabs" style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {['empleados', 'asistencia', 'nomina'].map(t => (
          <button key={t} className={`btn small ${tab === t ? '' : 'secondary'}`} onClick={() => setTab(t)}>
            {t === 'empleados' ? 'Empleados' : t === 'asistencia' ? 'Asistencia' : 'Nómina'}
          </button>
        ))}
      </div>

      {error && <div className="error-msg">{error}</div>}

      {tab === 'empleados' && (
        <div className="card">
          <h3>Datos de nómina por empleado</h3>
          <table>
            <thead><tr><th>Nombre</th><th>Rol</th><th>Cargo</th><th>Tipo de salario</th><th>Salario base / tarifa</th><th>Activo</th></tr></thead>
            <tbody>
              {employees.map(e => (
                <tr key={e.user_id}>
                  <td>{e.name}</td>
                  <td>{e.role}</td>
                  <td><input defaultValue={e.position || ''} onBlur={ev => updateEmployee(e.user_id, { position: ev.target.value })} /></td>
                  <td>
                    <select defaultValue={e.salary_type || 'mensual'} onChange={ev => updateEmployee(e.user_id, { salary_type: ev.target.value })}>
                      <option value="mensual">Mensual</option>
                      <option value="por_hora">Por hora</option>
                    </select>
                  </td>
                  <td><input type="number" step="0.01" defaultValue={e.base_salary || 0}
                    onBlur={ev => updateEmployee(e.user_id, { base_salary: Number(ev.target.value) })} /></td>
                  <td>
                    <input type="checkbox" defaultChecked={e.active == null ? true : !!e.active}
                      onChange={ev => updateEmployee(e.user_id, { active: ev.target.checked })} />
                  </td>
                </tr>
              ))}
              {employees.length === 0 && <tr><td colSpan="6">Sin personal registrado.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'asistencia' && (
        <div className="card">
          <h3>Registros de entrada/salida</h3>
          <table>
            <thead><tr><th>Empleado</th><th>Entrada</th><th>Salida</th><th>Horas</th></tr></thead>
            <tbody>
              {attendance.map(a => (
                <tr key={a.id}>
                  <td>{a.user_name}</td>
                  <td>{(a.clock_in || '').slice(0, 16).replace('T', ' ')}</td>
                  <td>{a.clock_out ? a.clock_out.slice(0, 16).replace('T', ' ') : <span className="badge gray">abierta</span>}</td>
                  <td>{a.clock_out ? ((new Date(a.clock_out) - new Date(a.clock_in)) / 3600000).toFixed(2) : '—'}</td>
                </tr>
              ))}
              {attendance.length === 0 && <tr><td colSpan="4">Sin registros de asistencia.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'nomina' && (
        <div className="grid grid-2">
          <div className="card">
            <h3>Nuevo período</h3>
            <form onSubmit={createPeriod}>
              <div className="field"><label>Desde</label>
                <input type="date" required value={periodForm.period_start} onChange={e => setPeriodForm({ ...periodForm, period_start: e.target.value })} /></div>
              <div className="field"><label>Hasta</label>
                <input type="date" required value={periodForm.period_end} onChange={e => setPeriodForm({ ...periodForm, period_end: e.target.value })} /></div>
              <button className="btn">Crear período</button>
            </form>
            <table style={{ marginTop: 16 }}>
              <thead><tr><th>Período</th><th>Estado</th><th></th></tr></thead>
              <tbody>
                {periods.map(p => (
                  <tr key={p.id}>
                    <td>{p.period_start} → {p.period_end}</td>
                    <td><span className={`badge ${p.status === 'pagado' ? 'green' : 'gray'}`}>{p.status}</span></td>
                    <td><button className="btn small secondary" onClick={() => openPeriod(p.id)}>Ver</button></td>
                  </tr>
                ))}
                {periods.length === 0 && <tr><td colSpan="3">Sin períodos creados.</td></tr>}
              </tbody>
            </table>
          </div>

          {activePeriod && (
            <div className="card">
              <h3>Período {activePeriod.period_start} → {activePeriod.period_end}</h3>
              <div style={{ marginBottom: 12 }}>
                <button className="btn small" onClick={generatePayroll} disabled={activePeriod.status === 'pagado'}>
                  {activePeriod.items?.length ? 'Regenerar nómina' : 'Generar nómina'}
                </button>
                {activePeriod.items?.length > 0 && activePeriod.status !== 'pagado' && (
                  <button className="btn small secondary" style={{ marginLeft: 8 }} onClick={markPaid}>Marcar como pagado</button>
                )}
              </div>
              <table>
                <thead><tr><th>Empleado</th><th>Horas</th><th>Bruto</th><th>Deducciones</th><th>Bonos</th><th>Neto</th></tr></thead>
                <tbody>
                  {(activePeriod.items || []).map(i => (
                    <tr key={i.id}>
                      <td>{i.user_name}</td>
                      <td>{i.worked_hours ? i.worked_hours.toFixed(1) : '—'}</td>
                      <td>{i.gross_pay.toFixed(2)}</td>
                      <td>{i.deductions.toFixed(2)}</td>
                      <td>{i.bonuses.toFixed(2)}</td>
                      <td><strong>{i.net_pay.toFixed(2)}</strong></td>
                    </tr>
                  ))}
                  {(!activePeriod.items || activePeriod.items.length === 0) && <tr><td colSpan="6">Aún no se ha generado la nómina de este período.</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
