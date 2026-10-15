import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import ClockWidget from './components/ClockWidget';
import { SCREENS } from './routesConfig';
import { CONTACT } from './contact';

const ROLE_LABELS = {
  admin: 'Administrador', gerencia: 'Gerencia', contaduria: 'Contaduría', rrhh: 'Talento Humano',
  cocina: 'Cocina', bar: 'Bar', mesero: 'Salón / Mesero', caja: 'Caja', almacen: 'Almacén', auditoria: 'Auditoría'
};

export default function Layout() {
  const { user, logout, can, trial } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // Con la prueba vencida solo queda disponible la pantalla de suscripción (para pagar)
  const blocked = trial && trial.expired && trial.enforced && !location.pathname.startsWith('/app/admin/suscripcion');

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
        {trial && trial.status === 'trialing' && !trial.expired && (
          <div className="trial-banner">
            🎁 Prueba gratuita: te {trial.days_left === 1 ? 'queda 1 día' : `quedan ${trial.days_left} días`} de {trial.trial_days}.
            {' '}¿Quieres seguir después? Escríbenos por <a href={CONTACT.whatsappLink} target="_blank" rel="noreferrer">WhatsApp</a>.
          </div>
        )}
        {blocked ? <TrialExpired isAdmin={user?.role === 'admin'} onLogout={handleLogout} /> : <Outlet />}
      </div>
    </div>
  );
}

function TrialExpired({ isAdmin, onLogout }) {
  return (
    <div className="card trial-expired">
      <h2>⏳ Tu período de prueba terminó</h2>
      <p>Gracias por probar el sistema. Tus datos quedan guardados: para seguir usándolo, contáctanos y activamos tu plan.</p>
      <p>
        <a className="btn" href={CONTACT.whatsappLink} target="_blank" rel="noreferrer">💬 Escribir por WhatsApp</a>
      </p>
      <p style={{ fontSize: 14 }}>WhatsApp: <strong>{CONTACT.whatsapp}</strong> · Correo: <strong>{CONTACT.email}</strong></p>
      {isAdmin && <p style={{ fontSize: 13 }}>También puedes revisar tu plan en <NavLink to="/app/admin/suscripcion">💳 Suscripción</NavLink>.</p>}
      <button className="btn secondary" onClick={onLogout}>Cerrar sesión</button>
    </div>
  );
}
