import { Link } from 'react-router-dom';

export default function Privacy() {
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
        <h1>Política de Privacidad y Tratamiento de Datos</h1>
        <p className="updated">Última actualización: 23 de septiembre de 2026</p>

        <p>
          Esta política describe cómo Uriel Alexander Velandia Vera
          ("nosotros") recolecta, usa, almacena y protege los datos personales de quienes usan
          Restaurant SaaS (el "Servicio"), en cumplimiento de
          la Ley 1581 de 2012 y el Decreto 1377 de 2013 de Colombia (régimen de Protección de Datos Personales /
          Habeas Data), y de la normativa equivalente de otros países donde operes.
        </p>

        <h2>1. Responsable del tratamiento</h2>
        <p>
          Uriel Alexander Velandia Vera, persona natural
          (<span className="placeholder">[cédula/NIT — actualiza cuando registres tu negocio]</span>), con contacto en
          urielvel2023@gmail.com o por WhatsApp al +57 300 699 9364, es responsable del tratamiento de los datos
          personales descritos en esta política.
        </p>

        <h2>2. Qué datos recolectamos</h2>
        <ul>
          <li><strong>Datos de cuenta:</strong> nombre, correo electrónico y contraseña (guardada con hash, nunca en texto plano).</li>
          <li><strong>Datos del negocio:</strong> nombre del restaurante, país, moneda, inventario, recetas, menú, ventas y reportes.</li>
          <li><strong>Datos de empleados</strong> (cargados por el administrador del restaurante): nombre, cargo, salario, registros de asistencia — para el módulo de nómina.</li>
          <li><strong>Datos de clientes del restaurante</strong> (cuando aplica): nombre, teléfono y dirección, para domicilios y documentos de facturación.</li>
          <li><strong>Datos de pago:</strong> gestionados directamente por las pasarelas de pago (Wompi y/o Stripe); nosotros no almacenamos números completos de tarjeta.</li>
        </ul>

        <h2>3. Finalidad del tratamiento</h2>
        <p>
          Usamos estos datos para: prestar y mantener el Servicio, procesar pagos de la suscripción, generar
          documentos de facturación electrónica cuando el restaurante conecta un proveedor certificado, calcular
          nómina, enviar comunicaciones relacionadas con el Servicio (soporte, cambios importantes) y cumplir
          obligaciones legales.
        </p>

        <h2>4. Cómo almacenamos y protegemos los datos</h2>
        <p>
          Los datos se almacenan en una base de datos administrada (PostgreSQL, alojada en Render).
          Las contraseñas se
          protegen con hash (bcrypt) y las sesiones usan tokens firmados (JWT) con expiración. Aplicamos
          controles de acceso para que cada restaurante solo pueda ver sus propios datos (aislamiento
          multi-tenant).
        </p>

        <h2>5. Con quién compartimos datos</h2>
        <p>
          Compartimos datos únicamente con los terceros estrictamente necesarios para operar el Servicio:
        </p>
        <ul>
          <li>Pasarelas de pago (Wompi, Stripe) para procesar el cobro de la suscripción.</li>
          <li>Proveedores de facturación electrónica certificados (Alegra, Facturama, Nubefact u otro) — solo si el restaurante decide conectarlos con sus propias credenciales.</li>
          <li>El proveedor de infraestructura/hosting donde corre la aplicación y la base de datos.</li>
        </ul>
        <p>No vendemos datos personales a terceros con fines publicitarios.</p>

        <h2>6. Tus derechos (Habeas Data)</h2>
        <p>
          Como titular de tus datos personales, tienes derecho a: conocer, actualizar y rectificar tus datos;
          solicitar prueba de la autorización otorgada; ser informado del uso que se les ha dado; presentar
          quejas ante la autoridad competente; revocar la autorización y/o solicitar la supresión de tus datos
          cuando no exista un deber legal de conservarlos; y acceder gratuitamente a tus datos.
        </p>

        <h2>7. Cómo ejercer tus derechos</h2>
        <p>
          Puedes ejercer estos derechos escribiendo a urielvel2023@gmail.com o por WhatsApp al +57 300 699 9364.
          Responderemos tu solicitud dentro de los plazos que exige la ley aplicable.
        </p>

        <h2>8. Cookies y almacenamiento local</h2>
        <p>
          El Servicio usa el almacenamiento local del navegador (localStorage) únicamente para guardar tu sesión
          (token de acceso), de forma que no tengas que iniciar sesión constantemente. No usamos cookies de
          rastreo publicitario.
        </p>

        <h2>9. Menores de edad</h2>
        <p>
          El Servicio está dirigido a negocios y sus administradores/empleados adultos; no está diseñado para
          ser usado directamente por menores de edad.
        </p>

        <h2>10. Cambios a esta política</h2>
        <p>
          Podemos actualizar esta política ocasionalmente. Publicaremos la fecha de la última actualización en
          la parte superior de esta página.
        </p>

        <h2>11. Contacto</h2>
        <p>
          Para preguntas sobre el tratamiento de tus datos, escríbenos a urielvel2023@gmail.com o por WhatsApp al +57 300 699 9364.
        </p>

        <p style={{ marginTop: 40, fontSize: 12, color: '#9ca3af' }}>
          Este documento es una plantilla general de referencia basada en la Ley 1581 de 2012 (Colombia) y no
          constituye asesoría legal. Te recomendamos que un abogado lo revise y lo ajuste a tu negocio,
          jurisdicción y proveedores específicos antes de publicarlo.
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
