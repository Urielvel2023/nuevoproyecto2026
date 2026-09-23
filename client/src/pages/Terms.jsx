import { Link } from 'react-router-dom';

export default function Terms() {
  return (
    <div className="public-page">
      <nav className="public-nav">
        <Link to="/" className="logo">🍽️ Restaurant SaaS</Link>
        <div className="nav-links">
          <Link to="/login">Iniciar sesión</Link>
          <Link to="/login?registro=1" className="cta">Registrar mi restaurante</Link>
        </div>
      </nav>

      <div className="legal-doc">
        <h1>Términos y Condiciones</h1>
        <p className="updated">Última actualización: 23 de septiembre de 2026</p>

        <p>
          Estos Términos y Condiciones ("Términos") regulan el acceso y uso de la plataforma
          Restaurant SaaS (el "Servicio"), un software como servicio (SaaS) para la gestión de restaurantes y
          bares, operado por Uriel Alexander Velandia Vera, persona natural
          (<span className="placeholder">[cédula/NIT — actualiza cuando registres tu negocio]</span>)
          ("nosotros", "la Plataforma"). Al registrarte o usar el Servicio aceptas estos Términos en su
          totalidad.
        </p>
        <p>
          <strong>Contacto:</strong> urielvel2023@gmail.com · WhatsApp +57 300 699 9364
        </p>

        <h2>1. Descripción del servicio</h2>
        <p>
          El Servicio ofrece herramientas de gestión de inventario, recetas y costeo, menú, mesas y comanda de
          cocina en tiempo real, reportes de ventas, facturación electrónica (integrada con proveedores
          certificados de terceros), contabilidad básica, nómina y control de asistencia, y gestión de
          domicilios, bajo un modelo de suscripción.
        </p>

        <h2>2. Registro y cuenta</h2>
        <p>
          Para usar el Servicio debes crear una cuenta con información veraz. Eres responsable de mantener la
          confidencialidad de tu contraseña y de toda la actividad que ocurra bajo tu cuenta. Debes notificarnos
          de inmediato cualquier uso no autorizado.
        </p>

        <h2>3. Planes, precios y facturación</h2>
        <p>
          Ofrecemos un período de prueba gratuito de 14 días. Al finalizar, para continuar usando el Servicio
          debes suscribirte a uno de los planes disponibles, cuyo precio se muestra en la página de precios.
          Los pagos se procesan a través de pasarelas de pago de terceros (Wompi y/o Stripe, según esté
          configurado). No almacenamos los datos completos de tu tarjeta; eso lo maneja directamente la
          pasarela de pago. Los precios pueden cambiar con aviso previo razonable.
        </p>

        <h2>4. Uso permitido</h2>
        <p>
          Te comprometes a usar el Servicio de forma lícita, sin intentar vulnerar su seguridad, sin revender el
          acceso a terceros sin autorización, y sin cargar contenido ilegal, fraudulento o que infrinja derechos
          de terceros.
        </p>

        <h2>5. Tus datos y contenido</h2>
        <p>
          La información que cargas al Servicio (inventario, ventas, empleados, clientes, documentos fiscales,
          etc.) es tuya. La usamos únicamente para prestarte el Servicio, según se describe en nuestra
          <Link to="/privacidad"> Política de Privacidad</Link>. Puedes solicitar una exportación o eliminación
          de tus datos escribiendo a urielvel2023@gmail.com o por WhatsApp al +57 300 699 9364.
        </p>

        <h2>6. Facturación electrónica y responsabilidad fiscal</h2>
        <p>
          El módulo de facturación electrónica es una herramienta que facilita la generación y el envío de
          documentos a un proveedor tecnológico certificado (DIAN, SAT, SUNAT según el país) que tú mismo
          conectas con tus propias credenciales. La responsabilidad de cumplir con tus obligaciones fiscales y
          tributarias ante la autoridad competente de tu país es exclusivamente tuya como comerciante; el
          Servicio no sustituye asesoría contable o legal.
        </p>

        <h2>7. Disponibilidad del servicio</h2>
        <p>
          Hacemos un esfuerzo razonable por mantener el Servicio disponible, pero no garantizamos disponibilidad
          ininterrumpida (100% uptime). Puede haber mantenimientos programados o interrupciones no planeadas.
          Te recomendamos mantener copias de tus datos críticos.
        </p>

        <h2>8. Cancelación y terminación</h2>
        <p>
          Puedes cancelar tu suscripción en cualquier momento desde el panel de administración. Podemos
          suspender o terminar cuentas que incumplan estos Términos, con aviso previo cuando sea razonablemente
          posible.
        </p>

        <h2>9. Limitación de responsabilidad</h2>
        <p>
          En la máxima medida permitida por la ley, no seremos responsables por daños indirectos, lucro cesante,
          o pérdida de datos derivados del uso del Servicio. El Servicio se ofrece "tal cual" (as is).
        </p>

        <h2>10. Modificaciones</h2>
        <p>
          Podemos actualizar estos Términos ocasionalmente. Te notificaremos los cambios relevantes por correo o
          dentro de la plataforma. El uso continuado del Servicio después de un cambio implica su aceptación.
        </p>

        <h2>11. Ley aplicable</h2>
        <p>
          Estos Términos se rigen por las leyes de Colombia.
          Cualquier disputa se resolverá ante los jueces competentes de dicha jurisdicción.
        </p>

        <h2>12. Contacto</h2>
        <p>
          Para preguntas sobre estos Términos, escríbenos a urielvel2023@gmail.com o por WhatsApp al +57 300 699 9364.
        </p>

        <p style={{ marginTop: 40, fontSize: 12, color: '#9ca3af' }}>
          Este documento es una plantilla general de referencia y no constituye asesoría legal. Te recomendamos
          que un abogado lo revise y lo ajuste a tu negocio y jurisdicción antes de publicarlo.
        </p>
      </div>

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
