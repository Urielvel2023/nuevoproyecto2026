import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';

// Página pública de pedido directo (domicilio/recoger) para clientes finales,
// sin necesidad de cuenta ni de pagar comisión a una app de domicilios de
// terceros. No usa AuthContext: es un endpoint público, sin token.
export default function PublicOrder() {
  const { restaurantId } = useParams();
  const [data, setData] = useState(null);
  const [cart, setCart] = useState({}); // { menuItemId: quantity }
  const [channel, setChannel] = useState('domicilio');
  const [form, setForm] = useState({ customer_name: '', customer_phone: '', delivery_address: '' });
  const [error, setError] = useState('');
  const [sent, setSent] = useState(null);

  useEffect(() => {
    axios.get(`/api/delivery/public/${restaurantId}/menu`)
      .then(res => setData(res.data))
      .catch(() => setError('No se encontró el restaurante.'));
  }, [restaurantId]);

  function addToCart(id) { setCart({ ...cart, [id]: (cart[id] || 0) + 1 }); }
  function removeFromCart(id) {
    const qty = (cart[id] || 0) - 1;
    const next = { ...cart };
    if (qty <= 0) delete next[id]; else next[id] = qty;
    setCart(next);
  }

  const items = data?.items || [];
  const cartItems = Object.entries(cart).map(([id, qty]) => ({ item: items.find(i => i.id === id), qty }));
  const total = cartItems.reduce((sum, c) => sum + (c.item?.price || 0) * c.qty, 0);

  async function submitOrder(e) {
    e.preventDefault();
    setError('');
    try {
      const { data: order } = await axios.post(`/api/delivery/public/${restaurantId}/order`, {
        channel, ...form,
        items: cartItems.map(c => ({ menu_item_id: c.item.id, quantity: c.qty }))
      });
      setSent(order);
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo enviar el pedido');
    }
  }

  if (error && !data) return <div style={{ padding: 24 }}>{error}</div>;
  if (!data) return <div style={{ padding: 24 }}>Cargando menú...</div>;

  if (sent) {
    return (
      <div style={{ padding: 24, maxWidth: 480, margin: '0 auto' }}>
        <h2>¡Pedido enviado!</h2>
        <p>{data.restaurant.name} recibió tu pedido por {data.restaurant.currency_symbol}{total.toFixed(2)}. Te contactarán al {form.customer_phone} para confirmar.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 640, margin: '0 auto' }}>
      <h1>{data.restaurant.name}</h1>
      <p style={{ color: '#6b7280' }}>Pedido directo — domicilio o recoger en tienda.</p>
      {error && <div className="error-msg">{error}</div>}

      <div className="menu-picker">
        {items.map(item => (
          <div key={item.id} className="item">
            <strong>{item.name}</strong>
            <div style={{ fontSize: 12, color: '#6b7280' }}>{item.category_name || 'Sin categoría'}</div>
            <div style={{ fontWeight: 600, marginTop: 4 }}>{data.restaurant.currency_symbol}{item.price.toFixed(2)}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
              <button type="button" className="btn small secondary" onClick={() => removeFromCart(item.id)}>-</button>
              <span>{cart[item.id] || 0}</span>
              <button type="button" className="btn small" onClick={() => addToCart(item.id)}>+</button>
            </div>
          </div>
        ))}
        {items.length === 0 && <p>Este restaurante aún no tiene ítems disponibles.</p>}
      </div>

      {cartItems.length > 0 && (
        <div className="card" style={{ marginTop: 24 }}>
          <h3>Tu pedido — Total: {data.restaurant.currency_symbol}{total.toFixed(2)}</h3>
          <form onSubmit={submitOrder}>
            <div className="field"><label>Canal</label>
              <select value={channel} onChange={e => setChannel(e.target.value)}>
                <option value="domicilio">Domicilio</option>
                <option value="recoger">Recoger en tienda</option>
              </select></div>
            <div className="field"><label>Nombre</label>
              <input required value={form.customer_name} onChange={e => setForm({ ...form, customer_name: e.target.value })} /></div>
            <div className="field"><label>Teléfono</label>
              <input required value={form.customer_phone} onChange={e => setForm({ ...form, customer_phone: e.target.value })} /></div>
            {channel === 'domicilio' && (
              <div className="field"><label>Dirección de entrega</label>
                <input required value={form.delivery_address} onChange={e => setForm({ ...form, delivery_address: e.target.value })} /></div>
            )}
            <button className="btn" style={{ width: '100%' }}>Enviar pedido</button>
          </form>
        </div>
      )}
    </div>
  );
}
