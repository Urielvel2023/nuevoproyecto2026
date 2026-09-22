import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Bar, Line } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend);

export default function Reports() {
  const { api } = useAuth();
  const [summary, setSummary] = useState(null);
  const [byWaiter, setByWaiter] = useState([]);
  const [byItem, setByItem] = useState([]);
  const [byCategory, setByCategory] = useState([]);
  const [byDay, setByDay] = useState([]);

  function load() {
    api.get('/reports/summary').then(res => setSummary(res.data));
    api.get('/reports/by-waiter').then(res => setByWaiter(res.data));
    api.get('/reports/by-item').then(res => setByItem(res.data));
    api.get('/reports/by-category').then(res => setByCategory(res.data));
    api.get('/reports/by-day').then(res => setByDay(res.data));
  }
  useEffect(() => { load(); }, []);

  return (
    <div>
      <div className="topbar"><h1>📊 Reportes de ventas</h1></div>

      {summary && (
        <div className="grid grid-3">
          <div className="card stat-tile">
            <div className="value">{summary.total_sales.toFixed(2)}</div>
            <div className="label">Ventas totales (cuentas cerradas)</div>
          </div>
          <div className="card stat-tile">
            <div className="value">{summary.orders_count}</div>
            <div className="label">Cuentas cerradas</div>
          </div>
          <div className="card stat-tile">
            <div className="value">{summary.avg_ticket.toFixed(2)}</div>
            <div className="label">Ticket promedio</div>
          </div>
        </div>
      )}

      <div className="grid grid-2">
        <div className="card">
          <h3>Ventas por mesero</h3>
          {byWaiter.length > 0 ? (
            <Bar
              data={{
                labels: byWaiter.map(w => w.waiter_name),
                datasets: [{ label: 'Ventas', data: byWaiter.map(w => w.total_sales), backgroundColor: '#2f6feb' }]
              }}
              options={{ responsive: true, plugins: { legend: { display: false } } }}
            />
          ) : <p style={{ color: '#6b7280' }}>Aún no hay ventas registradas.</p>}
        </div>

        <div className="card">
          <h3>Ventas por categoría</h3>
          {byCategory.length > 0 ? (
            <Bar
              data={{
                labels: byCategory.map(c => c.category_name),
                datasets: [{ label: 'Ventas', data: byCategory.map(c => c.total_sales), backgroundColor: '#10b981' }]
              }}
              options={{ responsive: true, plugins: { legend: { display: false } } }}
            />
          ) : <p style={{ color: '#6b7280' }}>Aún no hay ventas registradas.</p>}
        </div>
      </div>

      <div className="card">
        <h3>Tendencia de ventas por día</h3>
        {byDay.length > 0 ? (
          <Line
            data={{
              labels: byDay.map(d => d.day),
              datasets: [{ label: 'Ventas', data: byDay.map(d => d.total_sales), borderColor: '#2f6feb', tension: 0.3 }]
            }}
            options={{ responsive: true }}
          />
        ) : <p style={{ color: '#6b7280' }}>Aún no hay ventas registradas.</p>}
      </div>

      <div className="card">
        <h3>Detalle por mesero</h3>
        <table>
          <thead><tr><th>Mesero</th><th>Cuentas cerradas</th><th>Total vendido</th></tr></thead>
          <tbody>
            {byWaiter.map(w => (
              <tr key={w.waiter_id}><td>{w.waiter_name}</td><td>{w.orders_count}</td><td>{w.total_sales.toFixed(2)}</td></tr>
            ))}
            {byWaiter.length === 0 && <tr><td colSpan="3">Sin datos.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3>Platos y bebidas más vendidos</h3>
        <table>
          <thead><tr><th>Nombre</th><th>Categoría</th><th>Unidades vendidas</th><th>Total vendido</th></tr></thead>
          <tbody>
            {byItem.map(i => (
              <tr key={i.menu_item_id}>
                <td>{i.name}</td><td>{i.category_name || '—'}</td><td>{i.units_sold}</td><td>{i.total_sales.toFixed(2)}</td>
              </tr>
            ))}
            {byItem.length === 0 && <tr><td colSpan="4">Sin datos.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
