// Graph writes for automated runs. Two SurrealDB HTTP traps (see root CLAUDE.md):
// 1. HTTP 200 does not mean success — check every per-statement status.
// 2. datetime fields reject ISO strings — set them via time::now() in SurrealQL.
export async function writeRunDoc({ date, battery, models, summaryLine, results }) {
  const base = process.env.SURREAL_URL ?? 'http://mac-mini.tail3fdfa9.ts.net:8822'
  const user = process.env.SURREAL_USER
  const pass = process.env.SURREAL_PASS
  const db = process.env.SURREAL_DB ?? 'graph_test'
  if (!user || !pass) throw new Error('SURREAL_USER/PASS not set')

  const id = `winthropic_index_run_${date.replaceAll('-', '_')}`
  const title = `Winthropic Index run :: ${date} (battery ${battery}, ${models.join(', ')})`
  const sql = `UPSERT document:${id} CONTENT {
    title: ${JSON.stringify(title)},
    summary: ${JSON.stringify(summaryLine)},
    content: ${JSON.stringify(JSON.stringify(results))},
    tags: ['winthropic', 'index', 'eval_run'],
    created_at: time::now(),
    updated_at: time::now()
  };`

  const res = await fetch(`${base}/sql`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'surreal-ns': 'ephemeral_empire',
      'surreal-db': db,
      Authorization: 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64'),
    },
    body: sql,
  })
  if (!res.ok) throw new Error(`graph write HTTP ${res.status}: ${await res.text()}`)
  const out = await res.json()
  const failed = out.filter((r) => r.status !== 'OK')
  if (failed.length) {
    throw new Error(`graph write statement failed: ${JSON.stringify(failed)}`)
  }
  return { id: `document:${id}`, db }
}
