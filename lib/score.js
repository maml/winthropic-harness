import vm from 'node:vm'

const normalize = (s) =>
  s.trim().toLowerCase().replace(/[*_`]/g, '').replace(/[.。!]+$/, '').replace(/\s+/g, ' ')

const lastNumber = (s) => {
  const matches = s.match(/-?\d+(?:\.\d+)?/g)
  return matches ? Number(matches[matches.length - 1]) : NaN
}

const stripFences = (s) => {
  const m = s.match(/```(?:json|js|javascript)?\s*\n?([\s\S]*?)```/)
  return m ? m[1] : s
}

function scoreJsFunc(scorer, output) {
  const code = stripFences(output)
  const ctx = vm.createContext(Object.create(null))
  try {
    vm.runInContext(code, ctx, { timeout: 1000 })
    if (typeof ctx[scorer.fn] !== 'function') return false
    return scorer.vectors.every(([args, expected]) => {
      const got = vm.runInContext(
        `JSON.stringify(${scorer.fn}(...${JSON.stringify(args)}))`,
        ctx,
        { timeout: 500 }
      )
      return got === JSON.stringify(expected)
    })
  } catch {
    return false
  }
}

export function score(task, output) {
  const s = task.scorer
  switch (s.type) {
    case 'exact':
      return normalize(output) === normalize(String(s.expected))
    case 'numeric': {
      const got = lastNumber(output)
      return Number.isFinite(got) && Math.abs(got - s.expected) <= (s.tolerance ?? 0)
    }
    case 'regex':
      return new RegExp(s.pattern, s.flags ?? '').test(output.trim())
    case 'json_eq': {
      try {
        const got = JSON.parse(stripFences(output).trim())
        return JSON.stringify(sortKeys(got)) === JSON.stringify(sortKeys(s.expected))
      } catch {
        return false
      }
    }
    case 'jsfunc':
      return scoreJsFunc(s, output)
    default:
      throw new Error(`unknown scorer type: ${s.type}`)
  }
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map((k) => [k, sortKeys(value[k])])
    )
  }
  return value
}

export const SCORER_TYPES = ['exact', 'numeric', 'regex', 'json_eq', 'jsfunc']
