const API_URL = 'https://api.anthropic.com/v1/messages'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Fixed request shape on purpose: temperature 0 where the model accepts it,
// no system prompt. Claude 5 models reject `temperature` outright (400:
// "`temperature` is deprecated for this model"), so those run at the model's
// default sampling — recorded per result as temperature: null, because it
// matters for longitudinal comparability.
const noTemperature = new Set()

export async function complete({ model, prompt, maxTokens = 1024 }) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set — run under eegsec')

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
