// Cumplimiento legal por país: perfiles públicos (para el registro), documentos
// legales y el estado de cumplimiento del restaurante autenticado.
const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('../db');
const { authMiddleware } = require('../auth');
const { listCountries, getCountry, LEGAL_VERSION, REVIEWED_AT, VERIFY } = require('../compliance');
const ah = require('../utils/asyncHandler');

const router = express.Router();
const LEGAL_DOCS = { terminos: 'terminos.md', privacidad: 'privacidad.md' };

router.get('/countries', (req, res) => {
  res.json({ legal_version: LEGAL_VERSION, reviewed_at: REVIEWED_AT, disclaimer: VERIFY, countries: listCountries() });
});

router.get('/legal/:doc', (req, res) => {
  const file = LEGAL_DOCS[req.params.doc];
  if (!file) return res.status(404).json({ error: 'Documento no encontrado' });
  res.type('text/markdown').send(fs.readFileSync(path.join(__dirname, '..', 'legal', file), 'utf8'));
});

// Estado de cumplimiento del restaurante: lo que falta configurar para operar legalmente
router.get('/status', authMiddleware, ah(async (req, res) => {
  const r = await db.get('SELECT * FROM restaurants WHERE id = ?', [req.user.restaurant_id]);
  const fiscal = await db.get('SELECT * FROM fiscal_settings WHERE restaurant_id = ?', [r.id]);
  const approvers = await db.get(
    `SELECT COUNT(*) as n FROM users WHERE restaurant_id = ? AND active = 1 AND auth_pin_hash IS NOT NULL AND role IN ('admin','gerencia')`, [r.id]);
  const profile = getCountry(r.country) || getCountry('OTHER');
  const checks = [
    { key: 'terms', label: 'Términos y política de privacidad aceptados', ok: !!r.legal_accepted_at,
      detail: r.legal_accepted_at ? `Versión ${r.legal_version} el ${r.legal_accepted_at.slice(0, 10)}` : 'Acepta los términos vigentes' },
    { key: 'legal_current', label: 'Términos en la versión vigente', ok: r.legal_version === LEGAL_VERSION,
      detail: `Vigente: ${LEGAL_VERSION}` },
    { key: 'tax', label: `Impuesto configurado (${r.tax_name} ${r.tax_rate} %)`, ok: r.tax_rate > 0 || r.country === 'OTHER',
      detail: `Referencia para ${profile.name}: ${profile.tax_name} ${profile.tax_rate} %` },
    { key: 'tax_id', label: 'Datos fiscales del negocio (razón social y documento fiscal)', ok: !!(fiscal && fiscal.tax_id && fiscal.legal_name),
      detail: 'Facturación → Configuración' },
    { key: 'einvoice', label: `Facturación con validez legal (${profile.fiscal_authority})`,
      ok: !!(fiscal && fiscal.provider && fiscal.provider !== 'none'),
      detail: profile.einvoice + (profile.einvoice_provider ? ` · Proveedor integrado: ${profile.einvoice_provider}` : ' · Proveedor por integrar o registro manual') },
    { key: 'pin', label: 'Al menos un supervisor con PIN de autorización', ok: Number(approvers.n) > 0,
      detail: 'Mi clave / PIN' }
  ];
  res.json({ profile, checks, disclaimer: VERIFY, legal_version: LEGAL_VERSION });
}));

// Aceptar la versión vigente de términos (solo el administrador)
router.post('/accept', authMiddleware, ah(async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Solo el administrador acepta los términos en nombre del negocio' });
  await db.run('UPDATE restaurants SET legal_version = ?, legal_accepted_at = ?, legal_accepted_by = ?, legal_accepted_ip = ? WHERE id = ?',
    [LEGAL_VERSION, db.nowIso(), req.user.id, req.headers['x-forwarded-for'] || req.ip || null, req.user.restaurant_id]);
  res.json({ ok: true });
}));

module.exports = router;
