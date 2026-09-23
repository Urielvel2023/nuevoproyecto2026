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
              <NavLink to="/app/admin/inventario">📦 Almacén</NavLink>
              <NavLink to="/app/admin/recetas">📋 Recetas / Costeo</NavLink>
              <NavLink to="/app/admin/menu">🍔 Menú</NavLink>
              <NavLink to="/app/admin/reportes">📊 Reportes</NavLink>
              <NavLink to="/app/admin/facturacion">🧾 Facturación</NavLink>
              <NavLink to="/app/admin/contabilidad">💰 Contabilidad</NavLink>
              <NavLink to="/app/admin/personal">👥 Personal</NavLink>
              <NavLink to="/app/admin/nomina">🧑‍💼 Nómina</NavLink>
              <NavLink to="/app/admin/suscripcion">💳 Suscripción</NavLink>
              <NavLink to="/app/admin/configuracion">⚙️ Configuración</NavLink>
              <NavLink to="/app/mesero/mesas">🍽️ Mesas</NavLink>
              <NavLink to="/app/domicilios">🛵 Domicilios</NavLink>
              <NavLink to="/app/cocina">👨‍🍳 Cocina</NavLink>
            </>
          )}
          {user?.role === 'mesero' && (
            <>
              <NavLink to="/app/mesero/mesas">🍽️ Mesas</NavLink>
              <NavLink to="/app/domicilios">🛵 Domicilios</NavLink>
            </>
          )}
          {user?.role === 'cocina' && <NavLink to="/app/cocina">👨‍🍳 Comanda</NavLink>}
          <button onClick={handleLogout}>🚪 Cerrar sesión</button>
        </nav>
      </div>
      <div className="main-content">
        <Outlet />
      </div>
    </div>
  );
}
