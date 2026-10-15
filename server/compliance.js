// Perfiles de cumplimiento legal por país. Definen los valores por defecto
// del restaurante al registrarse (moneda, impuesto) y le muestran al cliente
// qué normas le aplican y qué debe configurar antes de operar.
//
// IMPORTANTE: son parámetros de partida, no asesoría legal. Las tasas y
// normas cambian; cada cliente debe validarlas con su contador o abogado
// local (ver `verify`). Revisar este archivo al menos una vez por trimestre.

const LEGAL_VERSION = '2026-10';
const REVIEWED_AT = '2026-10-02';

const COUNTRIES = {
  VE: {
    name: 'Venezuela', currency: 'VES', symbol: 'Bs.', tax_name: 'IVA', tax_rate: 16,
    fiscal_authority: 'SENIAT',
    einvoice: 'Factura por máquina fiscal homologada o por imprenta digital autorizada por el SENIAT',
    einvoice_provider: null,
    data_protection: 'Sin ley general de datos personales; aplica el habeas data (art. 28 de la Constitución)',
    labor: 'LOTTT (prestaciones sociales, utilidades, vacaciones y bono vacacional, cestaticket, IVSS, FAOV, INCES)',
    tips: 'Recargo de servicio del 10 % según usos locales; validar su tratamiento laboral',
    notes: ['IGTF sobre pagos en divisas según la condición del contribuyente', 'Reconversión monetaria de 2021 en el histórico de precios']
  },
  CO: {
    name: 'Colombia', currency: 'COP', symbol: '$', tax_name: 'INC', tax_rate: 8,
    fiscal_authority: 'DIAN',
    einvoice: 'Factura electrónica de venta o documento equivalente electrónico (POS) validado por la DIAN',
    einvoice_provider: 'alegra',
    data_protection: 'Ley 1581 de 2012 (Habeas Data) y Decreto 1377 de 2013',
    labor: 'Código Sustantivo del Trabajo y reforma laboral Ley 2466 de 2025 (recargos dominicales y nocturnos graduales)',
    tips: 'Propina voluntaria, sugerida hasta 10 %; el cliente puede rechazarla y no es ingreso del establecimiento',
    notes: ['Restaurantes y bares: impuesto nacional al consumo 8 %; franquicias facturan IVA 19 %']
  },
  MX: {
    name: 'México', currency: 'MXN', symbol: '$', tax_name: 'IVA', tax_rate: 16,
    fiscal_authority: 'SAT',
    einvoice: 'CFDI 4.0 emitido por un proveedor de certificación (PAC)',
    einvoice_provider: 'facturama',
    data_protection: 'Ley Federal de Protección de Datos Personales en Posesión de los Particulares (2025)',
    labor: 'Ley Federal del Trabajo (IMSS, INFONAVIT, aguinaldo, prima vacacional, PTU)',
    tips: 'Propina voluntaria',
    notes: ['Tasa de IVA 8 % en región fronteriza para contribuyentes inscritos']
  },
  PE: {
    name: 'Perú', currency: 'PEN', symbol: 'S/', tax_name: 'IGV', tax_rate: 18,
    fiscal_authority: 'SUNAT',
    einvoice: 'Comprobante de pago electrónico (boleta / factura) vía OSE o SEE-SUNAT',
    einvoice_provider: 'nubefact',
    data_protection: 'Ley 29733 de Protección de Datos Personales y su reglamento',
    labor: 'Régimen laboral general / MYPE (CTS, gratificaciones, EsSalud)',
    tips: 'Propina voluntaria',
    notes: ['Tasa reducida temporal de IGV para MYPE de restaurantes: confirmar vigencia']
  },
  CL: {
    name: 'Chile', currency: 'CLP', symbol: '$', tax_name: 'IVA', tax_rate: 19,
    fiscal_authority: 'SII',
    einvoice: 'Boleta y factura electrónica del SII',
    einvoice_provider: null,
    data_protection: 'Ley 19.628, reemplazada por la Ley 21.719 desde el 1 de diciembre de 2026',
    labor: 'Código del Trabajo',
    tips: 'Propina sugerida 10 % voluntaria (Ley 20.918), informada en la cuenta',
    notes: []
  },
  AR: {
    name: 'Argentina', currency: 'ARS', symbol: '$', tax_name: 'IVA', tax_rate: 21,
    fiscal_authority: 'ARCA (ex AFIP)',
    einvoice: 'Factura electrónica ARCA',
    einvoice_provider: null,
    data_protection: 'Ley 25.326 de Protección de Datos Personales',
    labor: 'Ley de Contrato de Trabajo 20.744 y convenio gastronómico',
    tips: 'Propina voluntaria',
    notes: []
  },
  EC: {
    name: 'Ecuador', currency: 'USD', symbol: '$', tax_name: 'IVA', tax_rate: 15,
    fiscal_authority: 'SRI',
    einvoice: 'Comprobantes electrónicos autorizados por el SRI',
    einvoice_provider: null,
    data_protection: 'Ley Orgánica de Protección de Datos Personales (2021)',
    labor: 'Código del Trabajo',
    tips: 'Recargo de servicio del 10 % según el establecimiento',
    notes: []
  },
  UY: {
    name: 'Uruguay', currency: 'UYU', symbol: '$', tax_name: 'IVA', tax_rate: 22,
    fiscal_authority: 'DGI',
    einvoice: 'Comprobante fiscal electrónico (CFE) de la DGI',
    einvoice_provider: null,
    data_protection: 'Ley 18.331 de Protección de Datos Personales',
    labor: 'Normativa laboral y consejos de salarios del sector',
    tips: 'Propina voluntaria',
    notes: ['Reducciones de IVA por pago electrónico en servicios gastronómicos: validar vigencia']
  },
  PA: {
    name: 'Panamá', currency: 'USD', symbol: 'B/.', tax_name: 'ITBMS', tax_rate: 7,
    fiscal_authority: 'DGI',
    einvoice: 'Factura electrónica DGI (PAC autorizado)',
    einvoice_provider: null,
    data_protection: 'Ley 81 de 2019 de Protección de Datos Personales',
    labor: 'Código de Trabajo',
    tips: 'Propina voluntaria',
    notes: ['ITBMS 10 % en bebidas alcohólicas']
  },
  DO: {
    name: 'República Dominicana', currency: 'DOP', symbol: 'RD$', tax_name: 'ITBIS', tax_rate: 18,
    fiscal_authority: 'DGII',
    einvoice: 'Comprobante fiscal electrónico (e-CF) de la DGII',
    einvoice_provider: null,
    data_protection: 'Ley 172-13 de Protección de Datos Personales',
    labor: 'Código de Trabajo',
    tips: 'Propina legal del 10 % para el personal',
    notes: []
  },
  CR: {
    name: 'Costa Rica', currency: 'CRC', symbol: '₡', tax_name: 'IVA', tax_rate: 13,
    fiscal_authority: 'Ministerio de Hacienda',
    einvoice: 'Comprobante electrónico de Hacienda',
    einvoice_provider: null,
    data_protection: 'Ley 8968 de Protección de la Persona frente al Tratamiento de sus Datos Personales',
    labor: 'Código de Trabajo',
    tips: 'Cargo de servicio del 10 % según la ley',
    notes: []
  },
  BR: {
    name: 'Brasil', currency: 'BRL', symbol: 'R$', tax_name: 'ICMS', tax_rate: 17,
    fiscal_authority: 'SEFAZ (estatal)',
    einvoice: 'NFC-e / NF-e autorizada por la SEFAZ del estado',
    einvoice_provider: null,
    data_protection: 'LGPD — Lei 13.709/2018',
    labor: 'CLT',
    tips: 'Gorjeta (taxa de serviço) regulada por la Lei 13.419/2017',
    notes: ['Reforma tributaria (CBS/IBS) en transición: validar con contador', 'La interfaz está en español']
  },
  OTHER: {
    name: 'Otro país', currency: 'USD', symbol: '$', tax_name: 'IVA', tax_rate: 0,
    fiscal_authority: 'Autoridad tributaria local',
    einvoice: 'Validar el régimen de facturación local antes de operar',
    einvoice_provider: null,
    data_protection: 'Validar la ley local de datos personales',
    labor: 'Validar la legislación laboral local',
    tips: 'Validar la regulación local',
    notes: []
  }
};

const VERIFY = 'Parámetros de referencia revisados el ' + REVIEWED_AT +
  '. No constituyen asesoría legal ni tributaria: valídalos con tu contador o abogado local antes de operar.';

function listCountries() {
  return Object.entries(COUNTRIES).map(([code, c]) => ({ code, ...c }));
}

function getCountry(code) {
  return COUNTRIES[code] ? { code, ...COUNTRIES[code] } : null;
}

module.exports = { COUNTRIES, LEGAL_VERSION, REVIEWED_AT, VERIFY, listCountries, getCountry };
