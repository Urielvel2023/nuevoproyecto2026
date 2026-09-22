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

import WaiterTables from './pages/Waiter/Tables';
import WaiterOrder from './pages/Waiter/Order';

import Kitchen from './pages/Kitchen/Kitchen';

function Protected({ roles, children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

function HomeRedirect() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'admin') return <Navigate to="/admin/inventario" replace />;
  if (user.role === 'mesero') return <Navigate to="/mesero/mesas" replace />;
  if (user.role === 'cocina') return <Navigate to="/cocina" replace />;
  return <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Protected><Layout /></Protected>}>
          <Route index element={<HomeRedirect />} />

          <Route path="admin/inventario" element={<Protected roles={['admin']}><Inventory /></Protected>} />
          <Route path="admin/recetas" element={<Protected roles={['admin']}><Recipes /></Protected>} />
          <Route path="admin/menu" element={<Protected roles={['admin']}><Menu /></Protected>} />
          <Route path="admin/reportes" element={<Protected roles={['admin']}><Reports /></Protected>} />
          <Route path="admin/personal" element={<Protected roles={['admin']}><Staff /></Protected>} />
          <Route path="admin/facturacion" element={<Protected roles={['admin']}><Invoicing /></Protected>} />

          <Route path="mesero/mesas" element={<Protected roles={['mesero', 'admin']}><WaiterTables /></Protected>} />
          <Route path="mesero/pedido/:orderId" element={<Protected roles={['mesero', 'admin']}><WaiterOrder /></Protected>} />

          <Route path="cocina" element={<Protected roles={['cocina', 'admin']}><Kitchen /></Protected>} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
