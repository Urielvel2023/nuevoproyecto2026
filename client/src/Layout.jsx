import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import ClockWidget from './components/ClockWidget';
import { SCREENS } from './routesConfig';

const ROLE_LABELS = {
  admin: 'Administrador', gerencia: 'Gerencia', contaduria: 'Contaduría', rrhh: 'Talento Humano',
  cocina: 'Cocina', bar: 'Bar', mesero: 'Salón / Mesero', caja: 'Caja', almacen: 'Almacén', auditoria: 'Auditoría'
};

export default function Layout() {
  const { user, logout, can } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div className="app-shell">
      <div className="sidebar">
        <h2>🍽️ {user?.name}</h2>
        <div className="role-chip">{ROLE_LABELS[user?.role] || user?.role}</div>
        <ClockWidget />
        <nav>
          {SCREENS.filter(s => !s.module || can(s.module, s.action || 'ver')).map(s => (
            <NavLink key={s.path} to={s.path}>{s.label}</NavLink>
          ))}
          <button onClick={handleLogout}>🚪 Cerrar sesión</button>
        </nav>
      </div>
      <div className="main-content">
        <Outlet />
      </div>
    </div>
  );
}
