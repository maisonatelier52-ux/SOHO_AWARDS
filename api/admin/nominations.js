const { json, parseBody } = require('../_lib/utils');
const { requireAdmin } = require('../_lib/admin');
const { listNominations, updateNomination } = require('../_lib/repository');

module.exports = async function handler(req, res) {
  const actor = requireAdmin(req, res);
  if (!actor) return;

  try {
    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');
      const rows = await listNominations({
        status: url.searchParams.get('status') || '',
        screeningStatus: url.searchParams.get('screeningStatus') || '',
        q: url.searchParams.get('q') || '',
        limit: url.searchParams.get('limit') || 25,
        offset: url.searchParams.get('offset') || 0
      });
      return json(res, 200, { rows });
    }

    if (req.method === 'PATCH') {
      const body = await parseBody(req);
      if (!body || !body.id) return json(res, 400, { message: 'Nomination ID is required.' });
      const updated = await updateNomination(body.id, {
        status: body.status,
        screeningStatus: body.screeningStatus,
        assignedOwner: body.assignedOwner,
        dueAt: body.dueAt,
        notes: body.notes
      }, actor);
      if (!updated) return json(res, 404, { message: 'Nomination not found.' });
      return json(res, 200, { message: 'Nomination updated.', row: updated });
    }

    return json(res, 405, { message: 'Method not allowed' });
  } catch (err) {
    return json(res, 500, { message: err.message || 'Could not process nomination admin request.' });
  }
};
