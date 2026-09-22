import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import ClockWidget from './components/ClockWidget';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div className="app-shell">
      <div className="sidebar">
        <h2>🍽️ {user?.name}</h2>
        <ClockWidget />
        <nav>
          {user?.role === 'admin' && (
            <>
              <NavLink to="/admin/inventario">📦 Almacén</NavLink>
              <NavLink to="/admin/recetas">📋 Recetas / Costeo</NavLink>
              <NavLink to="/admin/menu">🍔 Menú</NavLink>
              <NavLink to="/admin/reportes">📊 Reportes</NavLink>
              <NavLink to="/admin/facturacion">🧾 Facturación</NavLink>
              <NavLink to="/admin/contabilidad">💰 Contabilidad</NavLink>
              <NavLink to="/admin/personal">👥 Personal</NavLink>
              <NavLink to="/admin/nomina">🧑‍💼 Nómina</NavLink>
              <NavLink to="/mesero/mesas">🍽️ Mesas</NavLink>
              <NavLink to="/cocina">👨‍🍳 Cocina</NavLink>
            </>
          )}
          {user?.role === 'mesero' && <NavLink to="/mesero/mesas">🍽️ Mesas</NavLink>}
          {user?.role === 'cocina' && <NavLink to="/cocina">👨‍🍳 Comanda</NavLink>}
          <button onClick={handleLogout}>🚪 Cerrar sesión</button>
        </nav>
      </div>
      <div className="main-content">
        <Outlet />
      </div>
    </div>
  );
}
