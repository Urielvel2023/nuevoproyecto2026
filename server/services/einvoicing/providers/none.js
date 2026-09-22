// Sin proveedor certificado configurado. El documento se guarda como
// borrador interno: tiene todos los datos fiscales calculados, pero NO tiene
// validez legal ante la DIAN/SAT/SUNAT hasta que se transmita a través de
// un proveedor tecnológico autorizado (ver alegra.js, facturama.js, nubefact.js).
async function issue() {
  return {
    status: 'pendiente',
    provider_document_id: null,
    cufe: null,
    raw_response: null,
    error_message: 'No hay un proveedor de facturación electrónica certificado configurado. ' +
      'Este documento es un borrador interno, no tiene validez fiscal. ' +
      'Ve a Facturación → Configuración para conectar un proveedor (Alegra, Facturama, Nubefact) ' +
      'o registra el CUFE manualmente si ya facturaste por fuera del sistema.'
  };
}

module.exports = { issue };
