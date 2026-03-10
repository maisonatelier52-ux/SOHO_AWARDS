const { json, parseBody } = require('../_lib/utils');
const { requireAdmin } = require('../_lib/admin');
const { listPrivacyRequests, updatePrivacyRequest } = require('../_lib/repository');

module.exports = async function handler(req, res) {
  const actor = requireAdmin(req, res);
  if (!actor) return;

  try {
    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');
      const rows = await listPrivacyRequests({
        status: url.searchParams.get('status') || '',
        priority: url.searchParams.get('priority') || '',
        q: url.searchParams.get('q') || '',
        limit: url.searchParams.get('limit') || 25,
        offset: url.searchParams.get('offset') || 0
      });
      return json(res, 200, { rows });
    }

    if (req.method === 'PATCH') {
      const body = await parseBody(req);
      if (!body || !body.id) return json(res, 400, { message: 'Privacy ticket ID is required.' });
      const updated = await updatePrivacyRequest(body.id, {
        status: body.status,
        priority: body.priority,
        ownerName: body.ownerName,
        dueAt: body.dueAt,
        identityVerified: body.identityVerified,
        authorityVerified: body.authorityVerified,
        notes: body.notes
      }, actor);
      if (!updated) return json(res, 404, { message: 'Privacy ticket not found.' });
      return json(res, 200, { message: 'Privacy ticket updated.', row: updated });
    }

    return json(res, 405, { message: 'Method not allowed' });
  } catch (err) {
    return json(res, 500, { message: err.message || 'Could not process privacy admin request.' });
  }
};
