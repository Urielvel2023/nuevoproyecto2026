import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';

export default function Menu() {
  const { api, user } = useAuth();
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [newCategory, setNewCategory] = useState('');
  const [form, setForm] = useState({ name: '', description: '', price: '', category_id: '', recipe_id: '' });
  const [restaurant, setRestaurant] = useState(null);

  function load() {
    api.get('/menu/items').then(res => setItems(res.data));
    api.get('/menu/categories').then(res => setCategories(res.data));
    api.get('/recipes').then(res => setRecipes(res.data));
  }
  useEffect(() => { load(); }, []);

  async function addCategory(e) {
    e.preventDefault();
    if (!newCategory.trim()) return;
    await api.post('/menu/categories', { name: newCategory });
    setNewCategory('');
    load();
  }

  async function addItem(e) {
    e.preventDefault();
    await api.post('/menu/items', {
      ...form,
      price: Number(form.price),
      category_id: form.category_id || null,
      recipe_id: form.recipe_id || null
    });
    setForm({ name: '', description: '', price: '', category_id: '', recipe_id: '' });
    load();
  }

  async function toggleAvailable(item) {
    await api.put(`/menu/items/${item.id}`, { available: item.available ? 0 : 1 });
    load();
  }

  async function updatePrice(item, newPrice) {
    await api.put(`/menu/items/${item.id}`, { price: Number(newPrice) });
    load();
  }

  async function deleteItem(id) {
    if (!confirm('¿Eliminar este ítem del menú?')) return;
    await api.delete(`/menu/items/${id}`);
    load();
  }

  return (
    <div>
      <div className="topbar"><h1>🍔 Menú</h1></div>

      <div className="card">
        <h3>Categorías</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          {categories.map(c => <span key={c.id} className="badge gray">{c.name}</span>)}
        </div>
        <form onSubmit={addCategory} style={{ display: 'flex', gap: 8, maxWidth: 400 }}>
          <input placeholder="Nueva categoría (ej: Postres)" value={newCategory} onChange={e => setNewCategory(e.target.value)} />
          <button className="btn">Agregar</button>
        </form>
      </div>

      <div className="card">
        <h3>Agregar plato/bebida al menú</h3>
        <form onSubmit={addItem} className="grid grid-3">
          <div className="field"><label>Nombre</label>
            <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
          <div className="field"><label>Categoría</label>
            <select value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value })}>
              <option value="">Sin categoría</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select></div>
          <div className="field"><label>Receta (para costeo automático)</label>
            <select value={form.recipe_id} onChange={e => setForm({ ...form, recipe_id: e.target.value })}>
              <option value="">Sin receta</option>
              {recipes.map(r => <option key={r.id} value={r.id}>{r.name} (costo {r.total_cost.toFixed(2)})</option>)}
            </select></div>
          <div className="field"><label>Descripción</label>
            <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
          <div className="field"><label>Precio de venta</label>
            <input type="number" step="any" required value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} /></div>
          <div className="field" style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button className="btn" style={{ width: '100%' }}>Agregar al menú</button>
          </div>
        </form>
      </div>

      <div className="card">
        <h3>Ítems del menú</h3>
        <table>
          <thead>
            <tr><th>Nombre</th><th>Categoría</th><th>Precio</th><th>Costo</th><th>Margen</th><th>Estado</th><th></th></tr>
          </thead>
          <tbody>
            {items.map(item => (
              <tr key={item.id}>
                <td>{item.name}</td>
                <td>{item.category_name || '—'}</td>
                <td>
                  <input type="number" step="any" defaultValue={item.price} style={{ width: 90 }}
                    onBlur={e => e.target.value != item.price && updatePrice(item, e.target.value)} />
                </td>
                <td>{item.cost != null ? item.cost.toFixed(2) : '—'}</td>
                <td>{item.margin != null ? item.margin.toFixed(2) : '—'}</td>
                <td>
                  <span className={`badge ${item.available ? 'green' : 'red'}`} style={{ cursor: 'pointer' }}
                    onClick={() => toggleAvailable(item)}>
                    {item.available ? 'Disponible' : 'Agotado'}
                  </span>
                </td>
                <td><button className="btn small danger" onClick={() => deleteItem(item.id)}>Eliminar</button></td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan="7">Aún no hay ítems en el menú.</td></tr>}
          </tbody>
        </table>
        <p style={{ fontSize: 12, color: '#6b7280', marginTop: 10 }}>
          Los cambios de precio y disponibilidad se sincronizan al instante con las pantallas de mesero y cocina.
        </p>
      </div>
    </div>
  );
}
