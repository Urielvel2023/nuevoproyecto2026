import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';

const UNITS = ['unidad', 'kg', 'g', 'l', 'ml'];

export default function Inventory() {
  const { api, user } = useAuth();
  const socket = useSocket();
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ name: '', category: 'cocina', unit: 'unidad', stock: 0, min_stock: 0, unit_cost: 0, supplier: '' });
  const [movementFor, setMovementFor] = useState(null);
  const [movementForm, setMovementForm] = useState({ type: 'entrada', quantity: '', reason: '' });

  function load() {
    api.get('/inventory').then(res => setItems(res.data));
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!socket) return;
    const handler = () => load();
    socket.on('inventory:changed', handler);
    return () => socket.off('inventory:changed', handler);
  }, [socket]);

  async function addItem(e) {
    e.preventDefault();
    await api.post('/inventory', { ...form, stock: Number(form.stock), min_stock: Number(form.min_stock), unit_cost: Number(form.unit_cost) });
    setForm({ name: '', category: 'cocina', unit: 'unidad', stock: 0, min_stock: 0, unit_cost: 0, supplier: '' });
    load();
  }

  async function updateCost(item, newCost) {
    await api.put(`/inventory/${item.id}`, { unit_cost: Number(newCost) });
    load();
  }

  async function submitMovement(e) {
    e.preventDefault();
    await api.post(`/inventory/${movementFor.id}/movement`, {
      type: movementForm.type,
      quantity: Number(movementForm.quantity),
      reason: movementForm.reason
    });
    setMovementFor(null);
    setMovementForm({ type: 'entrada', quantity: '', reason: '' });
    load();
  }

  return (
    <div>
      <div className="topbar"><h1>📦 Almacén / Inventario</h1></div>

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
          <div className="field"><label>Costo unitario ({user.restaurant_id ? '' : ''})</label>
            <input type="number" step="any" value={form.unit_cost} onChange={e => setForm({ ...form, unit_cost: e.target.value })} /></div>
          <div className="field" style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button className="btn" style={{ width: '100%' }}>Agregar</button>
          </div>
        </form>
      </div>

      <div className="card">
        <h3>Productos en almacén</h3>
        <table>
          <thead>
            <tr>
              <th>Nombre</th><th>Categoría</th><th>Stock</th><th>Mínimo</th><th>Costo/unidad</th><th>Proveedor</th><th>Estado</th><th></th>
            </tr>
          </thead>
          <tbody>
            {items.map(item => (
              <tr key={item.id}>
                <td>{item.name}</td>
                <td>{item.category}</td>
                <td>{item.stock} {item.unit}</td>
                <td>{item.min_stock} {item.unit}</td>
                <td>
                  <input type="number" step="any" defaultValue={item.unit_cost} style={{ width: 90 }}
                    onBlur={e => e.target.value != item.unit_cost && updateCost(item, e.target.value)} />
                </td>
                <td>{item.supplier || '—'}</td>
                <td>
                  {item.stock <= item.min_stock
                    ? <span className="badge red">Stock bajo</span>
                    : <span className="badge green">OK</span>}
                </td>
                <td><button className="btn small secondary" onClick={() => setMovementFor(item)}>Movimiento</button></td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan="8">Aún no hay productos. Agrega el primero arriba.</td></tr>}
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
                <option value="ajuste">Ajuste</option>
              </select></div>
            <div className="field"><label>Cantidad</label>
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
