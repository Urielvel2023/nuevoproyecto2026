// Perú (SUNAT) vía Nubefact (https://www.nubefact.com) — Proveedor de
// Servicios Electrónicos (PSE) autorizado por SUNAT que emite y transmite
// el comprobante. Requiere una cuenta de Nubefact.
//
// Credenciales: fiscal_settings.provider_api_key = "Ruta" de la cuenta
// (URL del endpoint que entrega Nubefact), provider_api_secret = token.
//
// NOTA: integración de referencia contra la forma documentada de la API de
// Nubefact. Antes de producción, valida el payload contra la documentación
// vigente en https://www.nubefact.com/api/
async function issue({ settings, restaurant, order, customer, documentData }) {
  if (!settings.provider_api_key || !settings.provider_api_secret) {
    return {
      status: 'rechazada',
      provider_document_id: null,
      cufe: null,
      raw_response: null,
      error_message: 'Faltan las credenciales de Nubefact (URL de ruta y token) en Facturación → Configuración.'
    };
  }

  const subtotal = (order.items || []).reduce((s, i) => s + i.price_snapshot * i.quantity, 0);
  const taxRate = (documentData.taxPercentage || 0) / 100;
  const igv = subtotal * taxRate;

  const body = {
    operacion: 'generar_comprobante',
    tipo_de_comprobante: customer.tax_id && customer.tax_id.length === 11 ? 1 : 2, // 1=factura (RUC), 2=boleta
    serie: settings.invoice_prefix || 'BOL1',
    numero: documentData.number,
    sunat_transaction: 1,
    cliente_tipo_de_documento: customer.tax_id && customer.tax_id.length === 11 ? 6 : 1,
    cliente_numero_de_documento: customer.tax_id || '00000000',
    cliente_denominacion: customer.name || 'Cliente varios',
    cliente_direccion: '-',
    fecha_de_emision: new Date().toISOString().slice(0, 10),
    moneda: restaurant.currency === 'PEN' ? 1 : 1,
    porcentaje_de_igv: (documentData.taxPercentage || 18),
    total_gravada: subtotal,
    total_igv: igv,
    total: subtotal + igv,
    items: (order.items || []).map(item => ({
      unidad_de_medida: 'NIU',
      codigo: item.menu_item_id,
      descripcion: item.name_snapshot,
      cantidad: item.quantity,
      valor_unitario: item.price_snapshot,
      precio_unitario: item.price_snapshot,
      subtotal: item.price_snapshot * item.quantity,
      tipo_de_igv: 1,
      igv: item.price_snapshot * item.quantity * taxRate,
      total: item.price_snapshot * item.quantity * (1 + taxRate)
    }))
  };

  try {
    const resp = await fetch(settings.provider_api_key, {
      method: 'POST',
      headers: {
        Authorization: `Token token="${settings.provider_api_secret}"`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    const data = await resp.json().catch(() => null);

    if (!resp.ok || data?.errors) {
      return {
        status: 'rechazada',
        provider_document_id: null,
        cufe: null,
        raw_response: data,
        error_message: data?.errors || `Nubefact respondió ${resp.status}`
      };
    }

    return {
      status: data?.aceptada_por_sunat ? 'emitida' : 'pendiente',
      provider_document_id: data?.enlace || null,
      cufe: data?.codigo_hash || null,
      raw_response: data,
      error_message: null
    };
  } catch (e) {
    return {
      status: 'rechazada',
      provider_document_id: null,
      cufe: null,
      raw_response: null,
      error_message: `No se pudo conectar con Nubefact: ${e.message}`
    };
  }
}

module.exports = { issue };
