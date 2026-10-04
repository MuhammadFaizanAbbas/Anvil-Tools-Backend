// PostgREST returns 416/PGRST103 for an exact-count range past the last row.
// Confirm the filtered count before treating that specific error as an empty page.
async function readPage(query, countQuery, offset) {
  const result = await query;
  if (offset > 0 && result.status === 416 && result.error?.code === 'PGRST103') {
    const total = await countQuery();
    if (total.error) throw total.error;
    if (Number.isSafeInteger(total.count) && total.count >= 0 && offset >= total.count) {
      return { data: [], count: total.count };
    }
  }
  if (result.error) throw result.error;
  return result;
}

module.exports = { readPage };
