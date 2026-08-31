const API_URL = 'https://api.anthropic.com/v1/messages'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Fixed request shape on purpose: temperature 0, no system prompt.
// Changing anything here breaks longitudinal comparability of the Index.
export async function complete({ model, prompt, maxTokens = 1024 }) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set — run under eegsec')

  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        temperature: 0,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (res.status === 429 || res.status >= 500) {
      await sleep(1500 * 2 ** attempt)
      continue
    }
    if (!res.ok) throw new Error(`API ${res.status} for ${model}: ${await res.text()}`)
    const body = await res.json()
    return {
      text: body.content.map((b) => b.text ?? '').join(''),
      usage: body.usage,
      stopReason: body.stop_reason,
    }
  }
  throw new Error(`API retries exhausted for ${model}`)
}
