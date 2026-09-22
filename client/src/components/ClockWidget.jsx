import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';

// Reloj de entrada/salida: cualquier miembro del personal marca su propia
// asistencia desde el menú lateral, sin necesidad de ir a un módulo aparte.
export default function ClockWidget() {
  const { api } = useAuth();
  const [open, setOpen] = useState(null);
  const [loading, setLoading] = useState(false);

  function load() {
    api.get('/payroll/attendance/status').then(res => setOpen(res.data.open)).catch(() => {});
  }
  useEffect(() => { load(); }, []);

  async function clockIn() {
    setLoading(true);
    try { await api.post('/payroll/attendance/clock-in'); load(); } finally { setLoading(false); }
  }
  async function clockOut() {
    setLoading(true);
    try { await api.post('/payroll/attendance/clock-out'); load(); } finally { setLoading(false); }
  }

  return (
    <div className="clock-widget">
      {open ? (
        <button className="btn small secondary" disabled={loading} onClick={clockOut}>
          ⏱️ Marcar salida ({open.clock_in.slice(11, 16)})
        </button>
      ) : (
        <button className="btn small" disabled={loading} onClick={clockIn}>⏱️ Marcar entrada</button>
      )}
    </div>
  );
}
