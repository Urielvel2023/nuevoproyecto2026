import { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

function readJson(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [user, setUser] = useState(() => readJson('user'));
  // Permisos del rol { modulo: ['ver','crear',...] } calculados por el servidor (server/permissions.js)
  const [permissions, setPermissions] = useState(() => readJson('permissions') || {});

  const login = useCallback((newToken, newUser, newPermissions = {}) => {
    localStorage.setItem('token', newToken);
    localStorage.setItem('user', JSON.stringify(newUser));
    localStorage.setItem('permissions', JSON.stringify(newPermissions));
    setToken(newToken);
    setUser(newUser);
    setPermissions(newPermissions);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('permissions');
    setToken(null);
    setUser(null);
    setPermissions({});
  }, []);

  const api = useMemo(() => {
    const instance = axios.create({ baseURL: '/api' });
    instance.interceptors.request.use((config) => {
      if (token) config.headers.Authorization = `Bearer ${token}`;
      return config;
    });
    return instance;
  }, [token]);

  // Refresca permisos al cargar (por si la política cambió desde el último login)
  useEffect(() => {
    if (!token) return;
    api.get('/auth/me').then(({ data }) => {
      localStorage.setItem('permissions', JSON.stringify(data.permissions));
      setPermissions(data.permissions);
    }).catch((err) => {
      if (err.response?.status === 401) logout();
    });
  }, [token]);

  const can = useCallback((module, action = 'ver') => {
    if (user?.role === 'admin') return true;
    return (permissions[module] || []).includes(action);
  }, [user, permissions]);

  return (
    <AuthContext.Provider value={{ token, user, login, logout, api, can, permissions }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
