// Modo "manual": el restaurante ya emite su factura electrónica por fuera del
// sistema (ej. portal gratuito de la DIAN/SAT/SUNAT, u otro software) y solo
// quiere dejar constancia del número/CUFE aquí para tener el registro completo.
// El CUFE/folio fiscal se pasa en documentData.manual_cufe.
async function issue({ documentData }) {
  const cufe = documentData?.manual_cufe || null;
  return {
    status: cufe ? 'emitida' : 'pendiente',
    provider_document_id: null,
    cufe,
    raw_response: null,
    error_message: cufe ? null : 'Registra el CUFE/folio fiscal una vez emitas la factura por fuera del sistema.'
  };
}

module.exports = { issue };
