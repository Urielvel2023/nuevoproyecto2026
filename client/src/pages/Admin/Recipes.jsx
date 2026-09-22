import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';

export default function Recipes() {
  const { api } = useAuth();
  const [recipes, setRecipes] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [form, setForm] = useState({ name: '', type: 'cocina', notes: '' });
  const [rows, setRows] = useState([{ inventory_item_id: '', quantity: '' }]);
  const [editingId, setEditingId] = useState(null);

  function load() {
    api.get('/recipes').then(res => setRecipes(res.data));
    api.get('/inventory').then(res => setInventory(res.data));
  }
  useEffect(() => { load(); }, []);

  function addRow() { setRows([...rows, { inventory_item_id: '', quantity: '' }]); }
  function updateRow(i, field, value) {
    const copy = [...rows]; copy[i][field] = value; setRows(copy);
  }
  function removeRow(i) { setRows(rows.filter((_, idx) => idx !== i)); }

  function resetForm() {
    setForm({ name: '', type: 'cocina', notes: '' });
    setRows([{ inventory_item_id: '', quantity: '' }]);
    setEditingId(null);
  }

  async function submit(e) {
    e.preventDefault();
    const ingredients = rows.filter(r => r.inventory_item_id && r.quantity)
      .map(r => ({ inventory_item_id: r.inventory_item_id, quantity: Number(r.quantity) }));
    if (editingId) {
      await api.put(`/recipes/${editingId}`, { ...form, ingredients });
    } else {
      await api.post('/recipes', { ...form, ingredients });
    }
    resetForm();
    load();
  }

  function editRecipe(r) {
    setEditingId(r.id);
    setForm({ name: r.name, type: r.type, notes: r.notes || '' });
    setRows(r.ingredients.length
      ? r.ingredients.map(i => ({ inventory_item_id: i.inventory_item_id, quantity: i.quantity }))
      : [{ inventory_item_id: '', quantity: '' }]);
  }

  async function deleteRecipe(id) {
    if (!confirm('¿Eliminar esta receta?')) return;
    await api.delete(`/recipes/${id}`);
    load();
  }

  return (
    <div>
      <div className="topbar"><h1>📋 Recetas / Fichas técnicas</h1></div>

      <div className="card">
        <h3>{editingId ? 'Editar receta' : 'Nueva receta'}</h3>
        <form onSubmit={submit}>
          <div className="grid grid-3">
            <div className="field"><label>Nombre del plato/bebida</label>
              <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
            <div className="field"><label>Tipo</label>
              <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                <option value="cocina">Cocina</option>
                <option value="bar">Bar</option>
              </select></div>
            <div className="field"><label>Notas</label>
              <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
          </div>

          <label>Ingredientes (del almacén)</label>
          {rows.map((row, i) => (
            <div key={i} className="grid grid-3" style={{ marginBottom: 6 }}>
              <select value={row.inventory_item_id} onChange={e => updateRow(i, 'inventory_item_id', e.target.value)}>
                <option value="">Selecciona un insumo...</option>
                {inventory.map(item => (
                  <option key={item.id} value={item.id}>{item.name} ({item.unit}) — costo {item.unit_cost}</option>
                ))}
              </select>
              <input type="number" step="any" placeholder="Cantidad usada" value={row.quantity}
                onChange={e => updateRow(i, 'quantity', e.target.value)} />
              <button type="button" className="btn small secondary" onClick={() => removeRow(i)}>Quitar</button>
            </div>
          ))}
          <button type="button" className="btn small secondary" onClick={addRow} style={{ marginBottom: 12 }}>+ Agregar ingrediente</button>

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn">{editingId ? 'Guardar cambios' : 'Crear receta'}</button>
            {editingId && <button type="button" className="btn secondary" onClick={resetForm}>Cancelar</button>}
          </div>
        </form>
      </div>

      <div className="card">
        <h3>Recetas existentes</h3>
        <table>
          <thead><tr><th>Nombre</th><th>Tipo</th><th>Ingredientes</th><th>Costo total</th><th></th></tr></thead>
          <tbody>
            {recipes.map(r => (
              <tr key={r.id}>
                <td>{r.name}</td>
                <td><span className="badge gray">{r.type}</span></td>
                <td>{r.ingredients.map(i => `${i.name} (${i.quantity}${i.unit})`).join(', ') || '—'}</td>
                <td><strong>{r.total_cost.toFixed(2)}</strong></td>
                <td style={{ display: 'flex', gap: 6 }}>
                  <button className="btn small secondary" onClick={() => editRecipe(r)}>Editar</button>
                  <button className="btn small danger" onClick={() => deleteRecipe(r.id)}>Eliminar</button>
                </td>
              </tr>
            ))}
            {recipes.length === 0 && <tr><td colSpan="5">Aún no hay recetas.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
