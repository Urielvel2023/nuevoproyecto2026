// México (SAT / CFDI 4.0) vía Facturama (https://www.facturama.mx) —
// proveedor autorizado de certificación (PAC) que timbra el CFDI ante el SAT.
// Requiere una cuenta de Facturama.
//
// Credenciales: fiscal_settings.provider_api_key = usuario, provider_api_secret
// = contraseña de la cuenta Facturama (HTTP Basic Auth, como documenta su API).
//
// NOTA: integración de referencia contra la forma documentada de la API de
// Facturama. Antes de producción, valida el payload (uso de CFDI, forma de
// pago, régimen fiscal del receptor) contra la documentación vigente en
// https://apisandbox.facturama.mx/docs/api
const API_BASE = 'https://api.facturama.mx';

async function issue({ settings, restaurant, order, customer, documentData }) {
  if (!settings.provider_api_key || !settings.provider_api_secret) {
    return {
      status: 'rechazada',
      provider_document_id: null,
      cufe: null,
      raw_response: null,
      error_message: 'Faltan las credenciales de Facturama (usuario y contraseña) en Facturación → Configuración.'
    };
  }

  const auth = Buffer.from(`${settings.provider_api_key}:${settings.provider_api_secret}`).toString('base64');

  const body = {
    Currency: restaurant.currency || 'MXN',
    ExpeditionPlace: documentData.zipCode || '00000',
    PaymentForm: '01',
    PaymentMethod: 'PUE',
    CfdiType: 'I',
    Receiver: {
      Rfc: customer.tax_id || 'XAXX010101000',
      Name: customer.name || 'PUBLICO EN GENERAL',
      CfdiUse: 'G03',
      FiscalRegime: documentData.receiverFiscalRegime || '616',
      TaxZipCode: documentData.zipCode || '00000'
    },
    Items: (order.items || []).map(item => ({
      ProductCode: '90101501',
      Description: item.name_snapshot,
      UnitCode: 'H87',
      Unit: 'Pieza',
      Quantity: item.quantity,
      UnitPrice: item.price_snapshot,
      Subtotal: item.price_snapshot * item.quantity,
      Total: item.price_snapshot * item.quantity,
      Taxes: documentData.taxPercentage ? [{
        Total: item.price_snapshot * item.quantity * (documentData.taxPercentage / 100),
        Name: 'IVA',
        Base: item.price_snapshot * item.quantity,
        Rate: documentData.taxPercentage / 100,
        IsRetention: false
      }] : []
    }))
  };

  try {
    const resp = await fetch(`${API_BASE}/3/cfdis`, {
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
        error_message: data?.Message || data?.ModelState ? JSON.stringify(data) : `Facturama respondió ${resp.status}`
      };
    }

    return {
      status: data?.Complement?.TaxStamp?.Uuid ? 'emitida' : 'pendiente',
      provider_document_id: data?.Id || null,
      cufe: data?.Complement?.TaxStamp?.Uuid || null, // "folio fiscal" (UUID) del timbrado SAT
      raw_response: data,
      error_message: null
    };
  } catch (e) {
    return {
      status: 'rechazada',
      provider_document_id: null,
      cufe: null,
      raw_response: null,
      error_message: `No se pudo conectar con Facturama: ${e.message}`
    };
  }
}

module.exports = { issue };
