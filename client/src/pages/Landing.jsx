import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const FEATURES = [
  { icon: '📦', title: 'Inventario y almacén', text: 'Stock, costos, proveedores y alertas de mínimos, con historial completo de movimientos.' },
  { icon: '📋', title: 'Recetas con costeo', text: 'Arma la ficha técnica de cada plato y el costo se calcula solo según tus insumos.' },
  { icon: '🍽️', title: 'Mesas y comanda en tiempo real', text: 'Meseros y cocina sincronizados al instante, sin recargar pantalla.' },
  { icon: '🧾', title: 'Facturación electrónica', text: 'DIAN, SAT o SUNAT según tu país, conectando tu propio proveedor certificado.' },
  { icon: '💰', title: 'Contabilidad básica', text: 'Bancos, gastos e ingresos automáticos, con tu estado de resultados siempre al día.' },
  { icon: '🧑‍💼', title: 'Nómina y asistencia', text: 'Tu equipo marca entrada/salida y generas la nómina con un clic.' },
  { icon: '🛵', title: 'Domicilios', text: 'Pedido directo sin comisión de apps de terceros, más integración por webhook.' },
  { icon: '📊', title: 'Reportes y ventas', text: 'Ventas por mesero, por plato, por categoría y tendencia diaria, con gráficas.' }
];

export default function Landing() {
  const { api } = useAuth();
  const [plans, setPlans] = useState([]);

  useEffect(() => {
    api.get('/billing/plans').then(res => setPlans(res.data)).catch(() => {});
  }, []);

  return (
    <div className="public-page">
      <nav className="public-nav">
        <Link to="/" className="logo">🍽️ Restaurant SaaS</Link>
        <div className="nav-links">
          <a href="#precios">Precios</a>
          <Link to="/login">Iniciar sesión</Link>
          <Link to="/login?registro=1" className="cta">Registrar mi restaurante</Link>
        </div>
      </nav>

      <header className="hero">
        <h1>El sistema completo para administrar tu restaurante o bar</h1>
        <p>
          Inventario, recetas con costeo, mesas y comanda en tiempo real, facturación electrónica,
          contabilidad, nómina y domicilios — todo en un solo lugar, pensado para Latinoamérica.
        </p>
        <div className="hero-ctas">
          <Link to="/login?registro=1" className="btn large">Empezar gratis</Link>
          <a href="#precios" className="btn secondary large">Ver precios</a>
        </div>
        <p className="trial-note">14 días de prueba gratis. No se necesita tarjeta para empezar.</p>
      </header>

      <section className="public-section">
        <h2>Todo lo que tu operación necesita</h2>
        <p className="section-subtitle">Un solo sistema, sin hojas de cálculo sueltas ni aplicaciones separadas.</p>
        <div className="feature-grid">
          {FEATURES.map(f => (
            <div key={f.title} className="feature-card">
              <div className="icon">{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="public-section" id="precios">
        <h2>Precios simples</h2>
        <p className="section-subtitle">Empieza gratis 14 días. Cancela cuando quieras.</p>
        <div className="pricing-grid">
          {plans.map((p, i) => (
            <div key={p.id} className={`price-card ${i === 1 ? 'featured' : ''}`}>
              <h3>{p.name}</h3>
              {p.wompi_configured ? (
                <div className="price">${p.wompi_price_cop.toLocaleString('es-CO')} <small>COP/mes</small></div>
              ) : (
                <p className="not-configured">Precio disponible pronto</p>
              )}
              <Link to="/login?registro=1" className="btn" style={{ width: '100%', display: 'inline-block', marginTop: 8 }}>
                Empezar prueba gratis
              </Link>
            </div>
          ))}
          {plans.length === 0 && (
            <div className="price-card">
              <h3>Prueba gratuita</h3>
              <div className="price">14 <small>días, sin costo</small></div>
              <Link to="/login?registro=1" className="btn" style={{ width: '100%', display: 'inline-block', marginTop: 8 }}>
                Empezar ahora
              </Link>
            </div>
          )}
        </div>
      </section>

      <footer className="public-footer">
        <div className="footer-inner">
          <span className="copyright">© {new Date().getFullYear()} Restaurant SaaS. Todos los derechos reservados.</span>
          <div>
            <Link to="/terminos">Términos y condiciones</Link>
            <Link to="/privacidad">Política de privacidad</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
