const providers = {
  none: require('./providers/none'),
  manual: require('./providers/manual'),
  alegra: require('./providers/alegra'),
  facturama: require('./providers/facturama'),
  nubefact: require('./providers/nubefact')
};

// Emite (o intenta emitir) un documento fiscal a través del proveedor
// certificado configurado por el restaurante. Devuelve siempre un resultado
// consistente { status, provider_document_id, cufe, raw_response, error_message }
// independientemente del proveedor usado.
async function issueDocument(ctx) {
  const impl = providers[ctx.settings.provider] || providers.none;
  return impl.issue(ctx);
}

module.exports = { issueDocument, providers: Object.keys(providers) };
