import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Layout from './Layout';

import Inventory from './pages/Admin/Inventory';
import Recipes from './pages/Admin/Recipes';
import Menu from './pages/Admin/Menu';
import Reports from './pages/Admin/Reports';
import Staff from './pages/Admin/Staff';
import Invoicing from './pages/Admin/Invoicing';
import Accounting from './pages/Admin/Accounting';
import Payroll from './pages/Admin/Payroll';
import Subscription from './pages/Admin/Subscription';
import AuditLog from './pages/Admin/AuditLog';
import MyAccount from './pages/MyAccount';
import { SCREENS } from './routesConfig';

import WaiterTables from './pages/Waiter/Tables';
import WaiterOrder from './pages/Waiter/Order';
import Delivery from './pages/Delivery';
import PublicOrder from './pages/PublicOrder';

import Kitchen from './pages/Kitchen/Kitchen';

function Protected({ module, action = 'ver', children }) {
  const { user, can } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (module && !can(module, action)) return <Navigate to="/" replace />;
  return children;
}

function HomeRedirect() {
  const { user, can } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  const first = SCREENS.find(s => s.module && can(s.module, s.action || 'ver'));
  return <Navigate to={first ? first.path : '/mi-cuenta'} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/pedido/:restaurantId" element={<PublicOrder />} />
        <Route path="/" element={<Protected><Layout /></Protected>}>
          <Route index element={<HomeRedirect />} />

          <Route path="admin/inventario" element={<Protected module="inventario"><Inventory /></Protected>} />
          <Route path="admin/recetas" element={<Protected module="recetas"><Recipes /></Protected>} />
          <Route path="admin/menu" element={<Protected module="menu" action="crear"><Menu /></Protected>} />
          <Route path="admin/reportes" element={<Protected module="reportes"><Reports /></Protected>} />
          <Route path="admin/personal" element={<Protected module="usuarios"><Staff /></Protected>} />
          <Route path="admin/facturacion" element={<Protected module="facturacion"><Invoicing /></Protected>} />
          <Route path="admin/contabilidad" element={<Protected module="contabilidad"><Accounting /></Protected>} />
          <Route path="admin/nomina" element={<Protected module="nomina"><Payroll /></Protected>} />
          <Route path="admin/suscripcion" element={<Protected module="suscripcion"><Subscription /></Protected>} />

          <Route path="mesero/mesas" element={<Protected module="mesas"><WaiterTables /></Protected>} />
          <Route path="mesero/pedido/:orderId" element={<Protected module="pedidos"><WaiterOrder /></Protected>} />
          <Route path="domicilios" element={<Protected module="delivery"><Delivery /></Protected>} />

          <Route path="admin/bitacora" element={<Protected module="bitacora"><AuditLog /></Protected>} />
          <Route path="mi-cuenta" element={<Protected><MyAccount /></Protected>} />
          <Route path="cocina" element={<Protected module="kds"><Kitchen /></Protected>} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
