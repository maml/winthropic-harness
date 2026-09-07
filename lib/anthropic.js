const API_URL = 'https://api.anthropic.com/v1/messages'
const MODELS_URL = 'https://api.anthropic.com/v1/models'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Fixed request shape on purpose: temperature 0 where the model accepts it,
// no system prompt. Claude 5 models reject `temperature` outright (400:
// "`temperature` is deprecated for this model"), so those run at the model's
// default sampling — recorded per result as temperature: null, because it
// matters for longitudinal comparability.
const noTemperature = new Set()

export async function complete({ model, prompt, maxTokens = 1024 }) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set')

  for (let attempt = 0; attempt < 4; attempt++) {
    const withTemp = !noTemperature.has(model)
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        // Identity-linked API keys require the workspace id on every request.
        ...(process.env.ANTHROPIC_WORKSPACE_ID
          ? { 'anthropic-workspace-id': process.env.ANTHROPIC_WORKSPACE_ID }
          : {}),
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        ...(withTemp ? { temperature: 0 } : {}),
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (res.status === 429 || res.status >= 500) {
      await sleep(1500 * 2 ** attempt)
      continue
    }
    if (!res.ok) {
      const text = await res.text()
      if (res.status === 400 && withTemp && text.includes('`temperature` is deprecated')) {
        noTemperature.add(model)
        continue
      }
      throw new Error(`API ${res.status} for ${model}: ${text}`)
    }
    const body = await res.json()
    return {
      text: body.content.map((b) => b.text ?? '').join(''),
      usage: body.usage,
      stopReason: body.stop_reason,
      temperature: withTemp ? 0 : null,
    }
  }
  throw new Error(`API retries exhausted for ${model}`)
}

// The models list as the API serves it to this key, once per run, so the
// site can keep first-seen and last-seen dates per model id (the lifecycle
// board). Zero tokens. Never fails a run: null on any error, and the run
// record simply omits the poll for that day.
export const normalizeModels = (body) =>
  (Array.isArray(body?.data) ? body.data : [])
    .filter((m) => m && typeof m.id === 'string' && m.id)
    .map((m) => ({ id: m.id, displayName: m.display_name ?? null, createdAt: m.created_at ?? null }))

export async function listModels() {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null
  const headers = {
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    ...(process.env.ANTHROPIC_WORKSPACE_ID ? { 'anthropic-workspace-id': process.env.ANTHROPIC_WORKSPACE_ID } : {}),
  }
  try {
    const out = []
    let after = null
    for (let page = 0; page < 10; page++) {
      const res = await fetch(`${MODELS_URL}?limit=100${after ? `&after_id=${encodeURIComponent(after)}` : ''}`, { headers })
      if (!res.ok) return null
      const body = await res.json()
      out.push(...normalizeModels(body))
      if (!body.has_more || !body.last_id) break
      after = body.last_id
    }
    return out
  } catch {
    return null
  }
}
