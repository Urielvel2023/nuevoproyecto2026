// Colombia (DIAN) vía Alegra (https://www.alegra.com) — proveedor tecnológico
// certificado por la DIAN que firma y transmite el documento electrónico.
// Requiere una cuenta de Alegra con facturación electrónica habilitada.
//
// Credenciales: fiscal_settings.provider_api_key = email de la cuenta Alegra,
// provider_api_secret = token de API (Configuración → API en Alegra).
//
// NOTA: esta es una integración de referencia contra la forma documentada de
// la API de Alegra. Alegra actualiza su API con cierta frecuencia — antes de
// usar en producción, valida el payload contra la documentación vigente en
// https://developer.alegra.com/reference/crear-una-factura-de-venta
const API_BASE = 'https://api.alegra.com/api/v1';

async function issue({ settings, order, customer, documentData }) {
  if (!settings.provider_api_key || !settings.provider_api_secret) {
    return {
      status: 'rechazada',
      provider_document_id: null,
      cufe: null,
      raw_response: null,
      error_message: 'Faltan las credenciales de Alegra (email y token de API) en Facturación → Configuración.'
    };
  }

  const auth = Buffer.from(`${settings.provider_api_key}:${settings.provider_api_secret}`).toString('base64');

  const body = {
    date: new Date().toISOString().slice(0, 10),
    dueDate: new Date().toISOString().slice(0, 10),
    client: {
      name: customer.name || 'Consumidor final',
      identification: customer.tax_id || '222222222222'
    },
    items: (order.items || []).map(item => ({
      name: item.name_snapshot,
      price: item.price_snapshot,
      quantity: item.quantity,
      tax: documentData.taxPercentage ? [{ percentage: documentData.taxPercentage }] : undefined
    })),
    stamp: { generateStamp: true },
    observations: `Pedido interno #${order.id}`
  };

  try {
    const resp = await fetch(`${API_BASE}/invoices`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    const data = await resp.json().catch(() => null);

    if (!resp.ok) {
      return {
        status: 'rechazada',
        provider_document_id: null,
        cufe: null,
        raw_response: data,
        error_message: data?.message || `Alegra respondió ${resp.status}`
      };
    }

    const cufe = data?.stamp?.cufe || data?.stamp?.cude || null;
    const stampLegalStatus = data?.stamp?.legalStatus; // 'VALID' cuando la DIAN acepta el documento

    return {
      status: cufe && stampLegalStatus !== 'REJECTED' ? 'emitida' : 'pendiente',
      provider_document_id: data?.id ? String(data.id) : null,
      cufe,
      raw_response: data,
      error_message: stampLegalStatus === 'REJECTED' ? 'La DIAN rechazó el documento; revisa los datos del cliente.' : null
    };
  } catch (e) {
    return {
      status: 'rechazada',
      provider_document_id: null,
      cufe: null,
      raw_response: null,
      error_message: `No se pudo conectar con Alegra: ${e.message}`
    };
  }
}

module.exports = { issue };
