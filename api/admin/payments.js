const { json } = require('../_lib/utils');
const { requireAdmin } = require('../_lib/admin');
const { listPayments } = require('../_lib/repository');

module.exports = async function handler(req, res) {
  const actor = requireAdmin(req, res);
  if (!actor) return;
  if (req.method !== 'GET') return json(res, 405, { message: 'Method not allowed' });

  try {
    const url = new URL(req.url, 'http://localhost');
    const rows = await listPayments({
      provider: url.searchParams.get('provider') || '',
      verificationStatus: url.searchParams.get('verificationStatus') || '',
      q: url.searchParams.get('q') || '',
      limit: url.searchParams.get('limit') || 25,
      offset: url.searchParams.get('offset') || 0
    });
    return json(res, 200, { rows });
  } catch (err) {
    return json(res, 500, { message: err.message || 'Could not load payments.' });
  }
};
