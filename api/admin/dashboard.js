const { json } = require('../_lib/utils');
const { requireAdmin } = require('../_lib/admin');
const { getDashboardData } = require('../_lib/repository');

module.exports = async function handler(req, res) {
  const actor = requireAdmin(req, res);
  if (!actor) return;
  if (req.method !== 'GET') return json(res, 405, { message: 'Method not allowed' });

  try {
    const url = new URL(req.url, 'http://localhost');
    const limit = Number(url.searchParams.get('limit') || 12);
    const data = await getDashboardData(limit);
    return json(res, 200, data);
  } catch (err) {
    return json(res, 500, { message: err.message || 'Could not load dashboard data.' });
  }
};
