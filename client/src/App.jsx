import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Layout from './Layout';

import Landing from './pages/Landing';
import Terms from './pages/Terms';
import Privacy from './pages/Privacy';

import Inventory from './pages/Admin/Inventory';
import Recipes from './pages/Admin/Recipes';
import Menu from './pages/Admin/Menu';
import Reports from './pages/Admin/Reports';
import Staff from './pages/Admin/Staff';
import Invoicing from './pages/Admin/Invoicing';
import Accounting from './pages/Admin/Accounting';
import Payroll from './pages/Admin/Payroll';
import Subscription from './pages/Admin/Subscription';

import WaiterTables from './pages/Waiter/Tables';
import WaiterOrder from './pages/Waiter/Order';
import Delivery from './pages/Delivery';
import PublicOrder from './pages/PublicOrder';

import Kitchen from './pages/Kitchen/Kitchen';

function Protected({ roles, children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/app" replace />;
  return children;
}

function HomeRedirect() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'admin') return <Navigate to="/app/admin/inventario" replace />;
  if (user.role === 'mesero') return <Navigate to="/app/mesero/mesas" replace />;
  if (user.role === 'cocina') return <Navigate to="/app/cocina" replace />;
  return <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/terminos" element={<Terms />} />
        <Route path="/privacidad" element={<Privacy />} />
        <Route path="/login" element={<Login />} />
        <Route path="/pedido/:restaurantId" element={<PublicOrder />} />
        <Route path="/app" element={<Protected><Layout /></Protected>}>
          <Route index element={<HomeRedirect />} />

          <Route path="admin/inventario" element={<Protected roles={['admin']}><Inventory /></Protected>} />
          <Route path="admin/recetas" element={<Protected roles={['admin']}><Recipes /></Protected>} />
          <Route path="admin/menu" element={<Protected roles={['admin']}><Menu /></Protected>} />
          <Route path="admin/reportes" element={<Protected roles={['admin']}><Reports /></Protected>} />
          <Route path="admin/personal" element={<Protected roles={['admin']}><Staff /></Protected>} />
          <Route path="admin/facturacion" element={<Protected roles={['admin']}><Invoicing /></Protected>} />
          <Route path="admin/contabilidad" element={<Protected roles={['admin']}><Accounting /></Protected>} />
          <Route path="admin/nomina" element={<Protected roles={['admin']}><Payroll /></Protected>} />
          <Route path="admin/suscripcion" element={<Protected roles={['admin']}><Subscription /></Protected>} />

          <Route path="mesero/mesas" element={<Protected roles={['mesero', 'admin']}><WaiterTables /></Protected>} />
          <Route path="mesero/pedido/:orderId" element={<Protected roles={['mesero', 'admin']}><WaiterOrder /></Protected>} />
          <Route path="domicilios" element={<Protected roles={['mesero', 'admin']}><Delivery /></Protected>} />

          <Route path="cocina" element={<Protected roles={['cocina', 'admin']}><Kitchen /></Protected>} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
