import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';

const UNITS = ['unidad', 'kg', 'g', 'l', 'ml'];

export default function Inventory() {
  const { api } = useAuth();
  const socket = useSocket();
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ name: '', category: 'cocina', unit: 'unidad', stock: 0, min_stock: 0, unit_cost: 0, supplier: '' });
  const [movementFor, setMovementFor] = useState(null);
  const [movementForm, setMovementForm] = useState({ type: 'entrada', quantity: '', reason: '' });
  const [error, setError] = useState('');

  function load() {
    api.get('/inventory').then(res => setItems(res.data));
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!socket) return;
    const handler = () => load();
    socket.on('inventory:changed', handler);
    socket.on('inventory:deleted', handler);
    return () => {
      socket.off('inventory:changed', handler);
      socket.off('inventory:deleted', handler);
    };
  }, [socket]);

  async function addItem(e) {
    e.preventDefault();
    await api.post('/inventory', { ...form, stock: Number(form.stock), min_stock: Number(form.min_stock), unit_cost: Number(form.unit_cost) });
    setForm({ name: '', category: 'cocina', unit: 'unidad', stock: 0, min_stock: 0, unit_cost: 0, supplier: '' });
    load();
  }

  async function updateField(item, field, value) {
    setError('');
    try {
      await api.put(`/inventory/${item.id}`, { [field]: value });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo actualizar');
    }
  }

  async function deleteItem(item) {
    if (!confirm(`¿Eliminar "${item.name}" del almacén? Esta acción no se puede deshacer.`)) return;
    setError('');
    try {
      await api.delete(`/inventory/${item.id}`);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo eliminar');
    }
  }

  async function submitMovement(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post(`/inventory/${movementFor.id}/movement`, {
        type: movementForm.type,
        quantity: Number(movementForm.quantity),
        reason: movementForm.reason
      });
      setMovementFor(null);
      setMovementForm({ type: 'entrada', quantity: '', reason: '' });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo registrar el movimiento');
    }
  }

  return (
    <div>
      <div className="topbar"><h1>📦 Almacén / Inventario</h1></div>
      {error && <div className="error-msg">{error}</div>}

      <div className="card">
        <h3>Agregar producto</h3>
        <form onSubmit={addItem} className="grid grid-4">
          <div className="field"><label>Nombre</label>
            <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
          <div className="field"><label>Categoría</label>
            <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
              <option value="cocina">Cocina</option>
              <option value="bar">Bar</option>
              <option value="general">General</option>
            </select></div>
          <div className="field"><label>Unidad</label>
            <select value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })}>
              {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
            </select></div>
          <div className="field"><label>Proveedor</label>
            <input value={form.supplier} onChange={e => setForm({ ...form, supplier: e.target.value })} /></div>
          <div className="field"><label>Stock inicial</label>
            <input type="number" step="any" value={form.stock} onChange={e => setForm({ ...form, stock: e.target.value })} /></div>
          <div className="field"><label>Stock mínimo</label>
            <input type="number" step="any" value={form.min_stock} onChange={e => setForm({ ...form, min_stock: e.target.value })} /></div>
          <div className="field"><label>Costo unitario</label>
            <input type="number" step="any" value={form.unit_cost} onChange={e => setForm({ ...form, unit_cost: e.target.value })} /></div>
          <div className="field" style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button className="btn" style={{ width: '100%' }}>Agregar</button>
          </div>
        </form>
      </div>

      <div className="card">
        <h3>Productos en almacén</h3>
        <p style={{ color: '#6b7280', fontSize: 12, marginTop: -8 }}>
          Toca cualquier campo de la tabla para editarlo. Para cambiar la cantidad en stock usa "Movimiento"
          (queda registrado en el historial); para corregir un error usa el tipo "Ajuste", con negativo para restar.
        </p>
        <table>
          <thead>
            <tr>
              <th>Nombre</th><th>Categoría</th><th>Unidad</th><th>Stock</th><th>Mínimo</th><th>Costo/unidad</th><th>Proveedor</th><th>Estado</th><th></th>
            </tr>
          </thead>
          <tbody>
            {items.map(item => (
              <tr key={item.id}>
                <td>
                  <input defaultValue={item.name} style={{ width: 120 }}
                    onBlur={e => e.target.value !== item.name && e.target.value.trim() && updateField(item, 'name', e.target.value)} />
                </td>
                <td>
                  <select defaultValue={item.category} onChange={e => updateField(item, 'category', e.target.value)}>
                    <option value="cocina">Cocina</option>
                    <option value="bar">Bar</option>
                    <option value="general">General</option>
                  </select>
                </td>
                <td>
                  <select defaultValue={item.unit} onChange={e => updateField(item, 'unit', e.target.value)}>
                    {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </td>
                <td>{item.stock} {item.unit}</td>
                <td>
                  <input type="number" step="any" defaultValue={item.min_stock} style={{ width: 70 }}
                    onBlur={e => Number(e.target.value) !== item.min_stock && updateField(item, 'min_stock', Number(e.target.value))} />
                </td>
                <td>
                  <input type="number" step="any" defaultValue={item.unit_cost} style={{ width: 90 }}
                    onBlur={e => Number(e.target.value) !== item.unit_cost && updateField(item, 'unit_cost', Number(e.target.value))} />
                </td>
                <td>
                  <input defaultValue={item.supplier || ''} style={{ width: 100 }}
                    onBlur={e => e.target.value !== (item.supplier || '') && updateField(item, 'supplier', e.target.value)} />
                </td>
                <td>
                  {item.stock <= item.min_stock
                    ? <span className="badge red">Stock bajo</span>
                    : <span className="badge green">OK</span>}
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="btn small secondary" onClick={() => setMovementFor(item)}>Movimiento</button>
                  <button className="btn small danger" style={{ marginLeft: 6 }} onClick={() => deleteItem(item)}>Eliminar</button>
                </td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan="9">Aún no hay productos. Agrega el primero arriba.</td></tr>}
          </tbody>
        </table>
      </div>

      {movementFor && (
        <div className="card" style={{ maxWidth: 420 }}>
          <h3>Movimiento de "{movementFor.name}"</h3>
          <form onSubmit={submitMovement}>
            <div className="field"><label>Tipo</label>
              <select value={movementForm.type} onChange={e => setMovementForm({ ...movementForm, type: e.target.value })}>
                <option value="entrada">Entrada (compra)</option>
                <option value="salida">Salida (merma/uso manual)</option>
                <option value="ajuste">Ajuste (corregir stock)</option>
              </select></div>
            <div className="field"><label>Cantidad{movementForm.type === 'ajuste' ? ' (usa negativo para restar, ej. -2)' : ''}</label>
              <input type="number" step="any" required value={movementForm.quantity}
                onChange={e => setMovementForm({ ...movementForm, quantity: e.target.value })} /></div>
            <div className="field"><label>Motivo (opcional)</label>
              <input value={movementForm.reason} onChange={e => setMovementForm({ ...movementForm, reason: e.target.value })} /></div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn">Guardar</button>
              <button type="button" className="btn secondary" onClick={() => setMovementFor(null)}>Cancelar</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
