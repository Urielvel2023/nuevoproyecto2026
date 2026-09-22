const PDFDocument = require('pdfkit');

// Genera el PDF de una factura/documento fiscal. Devuelve un Buffer.
// Sirve tanto para documentos ya emitidos por un proveedor certificado
// (muestra CUFE/folio fiscal) como para borradores internos (lo marca
// claramente como "documento interno, sin validez fiscal").
function generateInvoicePdf({ restaurant, fiscalSettings, taxDocument, order }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const currency = restaurant.currency_symbol || '$';
    const fmt = (n) => `${currency}${Number(n || 0).toLocaleString('es-CO', { maximumFractionDigits: 2 })}`;

    doc.fontSize(18).text(fiscalSettings.legal_name || restaurant.name, { continued: false });
    if (fiscalSettings.tax_id) doc.fontSize(10).text(`NIT/RFC/RUC: ${fiscalSettings.tax_id}`);
    if (fiscalSettings.address) doc.fontSize(10).text(fiscalSettings.address);
    doc.moveDown();

    doc.fontSize(14).text(
      taxDocument.document_type === 'nota_credito' ? 'NOTA CRÉDITO' : 'FACTURA DE VENTA',
      { align: 'right' }
    );
    doc.fontSize(12).text(taxDocument.full_number, { align: 'right' });
    doc.fontSize(9).text(`Fecha: ${(taxDocument.issued_at || taxDocument.created_at || '').slice(0, 19).replace('T', ' ')}`, { align: 'right' });

    if (taxDocument.status === 'emitida' && taxDocument.cufe) {
      doc.fontSize(9).fillColor('green').text(`CUFE/Folio fiscal: ${taxDocument.cufe}`, { align: 'right' });
      doc.fillColor('black');
    } else {
      doc.fontSize(9).fillColor('red')
        .text('DOCUMENTO INTERNO — sin validez fiscal (configura un proveedor certificado)', { align: 'right', width: 495 });
      doc.fillColor('black');
    }

    doc.moveDown();
    doc.fontSize(11).text(`Cliente: ${taxDocument.customer_name || 'Consumidor final'}`);
    if (taxDocument.customer_tax_id) doc.text(`Identificación: ${taxDocument.customer_tax_id}`);
    if (taxDocument.customer_email) doc.text(`Correo: ${taxDocument.customer_email}`);
    doc.moveDown();

    doc.fontSize(11).text('Detalle', { underline: true });
    doc.moveDown(0.5);
    (order?.items || []).forEach((item) => {
      doc.fontSize(10).text(
        `${item.quantity} x ${item.name_snapshot} — ${fmt(item.price_snapshot)} c/u = ${fmt(item.price_snapshot * item.quantity)}`
      );
    });

    doc.moveDown();
    doc.fontSize(10).text(`Subtotal: ${fmt(taxDocument.subtotal)}`, { align: 'right' });
    doc.text(`Impuesto: ${fmt(taxDocument.tax_amount)}`, { align: 'right' });
    doc.fontSize(13).text(`Total: ${fmt(taxDocument.total)}`, { align: 'right' });

    if (taxDocument.error_message) {
      doc.moveDown();
      doc.fontSize(8).fillColor('gray').text(`Nota: ${taxDocument.error_message}`, { width: 495 });
      doc.fillColor('black');
    }

    doc.end();
  });
}

module.exports = { generateInvoicePdf };
