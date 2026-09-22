import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';

export default function Accounting() {
  const { api } = useAuth();
  const [tab, setTab] = useState('resumen');
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');

  const [accountForm, setAccountForm] = useState({ name: '', account_type: 'banco', bank_name: '', account_number: '', initial_balance: 0, is_default_sales_account: false });
  const [categoryForm, setCategoryForm] = useState({ name: '', kind: 'gasto' });
  const [txForm, setTxForm] = useState({ type: 'gasto', description: '', supplier: '', amount: '', category_id: '', bank_account_id: '' });

  function load() {
    api.get('/accounting/bank-accounts').then(res => setAccounts(res.data));
    api.get('/accounting/categories').then(res => setCategories(res.data));
    api.get('/accounting/transactions').then(res => setTransactions(res.data));
    api.get('/accounting/summary').then(res => setSummary(res.data));
  }
  useEffect(() => { load(); }, []);

  async function submitAccount(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/accounting/bank-accounts', accountForm);
      setAccountForm({ name: '', account_type: 'banco', bank_name: '', account_number: '', initial_balance: 0, is_default_sales_account: false });
      load();
    } catch (err) { setError(err.response?.data?.error || 'Error al crear la cuenta'); }
  }

  async function submitCategory(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/accounting/categories', categoryForm);
      setCategoryForm({ name: '', kind: 'gasto' });
      load();
    } catch (err) { setError(err.response?.data?.error || 'Error al crear la categoría'); }
  }

  async function submitTransaction(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/accounting/transactions', { ...txForm, amount: Number(txForm.amount) });
      setTxForm({ type: 'gasto', description: '', supplier: '', amount: '', category_id: '', bank_account_id: '' });
      load();
    } catch (err) { setError(err.response?.data?.error || 'Error al registrar el movimiento'); }
  }

  async function deleteTransaction(id) {
    if (!confirm('¿Eliminar este movimiento?')) return;
    try {
      await api.delete(`/accounting/transactions/${id}`);
      load();
    } catch (err) { setError(err.response?.data?.error || 'No se pudo eliminar'); }
  }

  return (
    <div>
      <div className="topbar"><h1>💰 Contabilidad</h1></div>
      <div className="tabs" style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {['resumen', 'bancos', 'gastos'].map(t => (
          <button key={t} className={`btn small ${tab === t ? '' : 'secondary'}`} onClick={() => setTab(t)}>
            {t === 'resumen' ? 'Resumen' : t === 'bancos' ? 'Bancos y caja' : 'Gastos e ingresos'}
          </button>
        ))}
      </div>

      {error && <div className="error-msg">{error}</div>}

      {tab === 'resumen' && summary && (
        <>
          <div className="grid grid-3">
            <div className="card stat-tile">
              <div className="value">{summary.total_income.toFixed(2)}</div>
              <div className="label">Ingresos</div>
            </div>
            <div className="card stat-tile">
              <div className="value">{summary.total_expense.toFixed(2)}</div>
              <div className="label">Gastos</div>
            </div>
            <div className="card stat-tile">
              <div className="value">{summary.net_profit.toFixed(2)}</div>
              <div className="label">Utilidad neta</div>
            </div>
          </div>

          <div className="card">
            <h3>Saldos por cuenta</h3>
            <table>
              <thead><tr><th>Cuenta</th><th>Tipo</th><th>Saldo</th></tr></thead>
              <tbody>
                {summary.bank_balances.map(b => (
                  <tr key={b.id}><td>{b.name}{b.is_default_sales_account ? ' ⭐' : ''}</td><td>{b.account_type}</td><td>{b.balance.toFixed(2)}</td></tr>
                ))}
                {summary.bank_balances.length === 0 && <tr><td colSpan="3">Sin cuentas creadas.</td></tr>}
              </tbody>
            </table>
          </div>

          <div className="card">
            <h3>Por categoría</h3>
            <table>
              <thead><tr><th>Categoría</th><th>Tipo</th><th>Total</th></tr></thead>
              <tbody>
                {summary.by_category.map((c, i) => (
                  <tr key={i}><td>{c.category_name}</td><td>{c.type}</td><td>{c.total.toFixed(2)}</td></tr>
                ))}
                {summary.by_category.length === 0 && <tr><td colSpan="3">Sin movimientos.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'bancos' && (
        <div className="grid grid-2">
          <div className="card">
            <h3>Nueva cuenta bancaria / caja</h3>
            <form onSubmit={submitAccount}>
              <div className="field"><label>Nombre</label>
                <input required value={accountForm.name} onChange={e => setAccountForm({ ...accountForm, name: e.target.value })} /></div>
              <div className="field"><label>Tipo</label>
                <select value={accountForm.account_type} onChange={e => setAccountForm({ ...accountForm, account_type: e.target.value })}>
                  <option value="banco">Banco</option>
                  <option value="caja">Caja</option>
                  <option value="otro">Otro</option>
                </select></div>
              <div className="field"><label>Banco</label>
                <input value={accountForm.bank_name} onChange={e => setAccountForm({ ...accountForm, bank_name: e.target.value })} /></div>
              <div className="field"><label>Número de cuenta</label>
                <input value={accountForm.account_number} onChange={e => setAccountForm({ ...accountForm, account_number: e.target.value })} /></div>
              <div className="field"><label>Saldo inicial</label>
                <input type="number" step="0.01" value={accountForm.initial_balance} onChange={e => setAccountForm({ ...accountForm, initial_balance: Number(e.target.value) })} /></div>
              <div className="field">
                <label><input type="checkbox" checked={accountForm.is_default_sales_account}
                  onChange={e => setAccountForm({ ...accountForm, is_default_sales_account: e.target.checked })} /> Cuenta por defecto para ventas</label>
              </div>
              <button className="btn">Crear cuenta</button>
            </form>
          </div>
          <div className="card">
            <h3>Cuentas</h3>
            <table>
              <thead><tr><th>Nombre</th><th>Tipo</th><th>Saldo inicial</th></tr></thead>
              <tbody>
                {accounts.map(a => (
                  <tr key={a.id}><td>{a.name}{a.is_default_sales_account ? ' ⭐' : ''}</td><td>{a.account_type}</td><td>{a.initial_balance.toFixed(2)}</td></tr>
                ))}
                {accounts.length === 0 && <tr><td colSpan="3">Sin cuentas creadas.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'gastos' && (
        <>
          <div className="grid grid-2">
            <div className="card">
              <h3>Registrar movimiento</h3>
              <form onSubmit={submitTransaction}>
                <div className="field"><label>Tipo</label>
                  <select value={txForm.type} onChange={e => setTxForm({ ...txForm, type: e.target.value })}>
                    <option value="gasto">Gasto</option>
                    <option value="ingreso">Ingreso</option>
                  </select></div>
                <div className="field"><label>Descripción</label>
                  <input required value={txForm.description} onChange={e => setTxForm({ ...txForm, description: e.target.value })} /></div>
                <div className="field"><label>Proveedor</label>
                  <input value={txForm.supplier} onChange={e => setTxForm({ ...txForm, supplier: e.target.value })} /></div>
                <div className="field"><label>Monto</label>
                  <input type="number" step="0.01" required value={txForm.amount} onChange={e => setTxForm({ ...txForm, amount: e.target.value })} /></div>
                <div className="field"><label>Categoría</label>
                  <select value={txForm.category_id} onChange={e => setTxForm({ ...txForm, category_id: e.target.value })}>
                    <option value="">Sin categoría</option>
                    {categories.filter(c => c.kind === txForm.type).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select></div>
                <div className="field"><label>Cuenta</label>
                  <select value={txForm.bank_account_id} onChange={e => setTxForm({ ...txForm, bank_account_id: e.target.value })}>
                    <option value="">Sin asignar</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select></div>
                <button className="btn">Registrar</button>
              </form>
            </div>

            <div className="card">
              <h3>Nueva categoría</h3>
              <form onSubmit={submitCategory}>
                <div className="field"><label>Nombre</label>
                  <input required value={categoryForm.name} onChange={e => setCategoryForm({ ...categoryForm, name: e.target.value })} /></div>
                <div className="field"><label>Tipo</label>
                  <select value={categoryForm.kind} onChange={e => setCategoryForm({ ...categoryForm, kind: e.target.value })}>
                    <option value="gasto">Gasto</option>
                    <option value="ingreso">Ingreso</option>
                  </select></div>
                <button className="btn">Crear categoría</button>
              </form>
              <table style={{ marginTop: 16 }}>
                <thead><tr><th>Nombre</th><th>Tipo</th></tr></thead>
                <tbody>
                  {categories.map(c => <tr key={c.id}><td>{c.name}</td><td>{c.kind}</td></tr>)}
                  {categories.length === 0 && <tr><td colSpan="2">Sin categorías.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <h3>Movimientos</h3>
            <table>
              <thead><tr><th>Fecha</th><th>Tipo</th><th>Descripción</th><th>Categoría</th><th>Cuenta</th><th>Monto</th><th></th></tr></thead>
              <tbody>
                {transactions.map(t => (
                  <tr key={t.id}>
                    <td>{(t.occurred_at || '').slice(0, 16).replace('T', ' ')}</td>
                    <td><span className={`badge ${t.type === 'ingreso' ? 'green' : 'red'}`}>{t.type}</span></td>
                    <td>{t.description}</td>
                    <td>{t.category_name || '—'}</td>
                    <td>{t.bank_account_name || '—'}</td>
                    <td>{t.amount.toFixed(2)}</td>
                    <td>{t.source === 'manual' && <button className="btn small danger" onClick={() => deleteTransaction(t.id)}>Eliminar</button>}</td>
                  </tr>
                ))}
                {transactions.length === 0 && <tr><td colSpan="7">Sin movimientos registrados.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
