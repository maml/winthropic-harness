#!/usr/bin/env node
// Winthropic Index eval harness: run the versioned battery against Claude
// models, score deterministically, append the run to data/runs/, optionally
// summarize into the graph (--graph; defaults to graph_test via SURREAL_DB).
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { complete } from './lib/anthropic.js'
import { score } from './lib/score.js'
import { writeRunDoc } from './lib/graph.js'

const here = dirname(fileURLToPath(import.meta.url))

const DEFAULT_MODELS = [
  'claude-haiku-4-5-20251001',
  'claude-sonnet-5',
  'claude-opus-5',
]

function parseArgs(argv) {
  const args = { models: null, limit: Infinity, graph: false, battery: 'v1' }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--models') args.models = argv[++i].split(',')
    else if (argv[i] === '--limit') args.limit = Number(argv[++i])
    else if (argv[i] === '--graph') args.graph = true
    else if (argv[i] === '--battery') args.battery = argv[++i]
    else throw new Error(`unknown arg: ${argv[i]}`)
  }
  return args
}

async function runTask(model, task) {
  const started = Date.now()
  try {
    const { text, usage, stopReason, temperature } = await complete({ model, prompt: task.prompt })
    return {
      taskId: task.id,
      category: task.category,
      model,
      pass: score(task, text),
      ms: Date.now() - started,
      usage,
      stopReason,
      temperature,
      output: text.slice(0, 2000),
    }
  } catch (err) {
    return {
      taskId: task.id,
      category: task.category,
      model,
      pass: false,
      ms: Date.now() - started,
      error: String(err),
    }
  }
}

function aggregate(results) {
  const byModel = {}
  for (const r of results) {
    const m = (byModel[r.model] ??= { passed: 0, total: 0, byCategory: {}, tokens: { in: 0, out: 0 } })
    m.total++
    if (r.pass) m.passed++
    const c = (m.byCategory[r.category] ??= { passed: 0, total: 0 })
    c.total++
    if (r.pass) c.passed++
    if (r.usage) {
      m.tokens.in += r.usage.input_tokens ?? 0
      m.tokens.out += r.usage.output_tokens ?? 0
    }
  }
  return byModel
}

const args = parseArgs(process.argv.slice(2))
const models = args.models ?? DEFAULT_MODELS
const battery = JSON.parse(await readFile(join(here, 'battery', `${args.battery}.json`), 'utf8'))
const tasks = battery.tasks.slice(0, args.limit)
const date = new Date().toISOString().slice(0, 10)

console.log(`Winthropic Index :: battery ${battery.version}, ${tasks.length} tasks × ${models.length} models`)

const results = []
for (const model of models) {
  const modelResults = await Promise.all(tasks.map((t) => runTask(model, t)))
  results.push(...modelResults)
}

const byModel = aggregate(results)
for (const [model, m] of Object.entries(byModel)) {
  console.log(`${model}: ${m.passed}/${m.total} (in ${m.tokens.in} / out ${m.tokens.out} tokens)`)
}

// A run where every call errored is an outage/auth problem, not Index data.
// Record it separately and never overwrite a good daily record with it.
if (results.every((r) => r.error)) {
  const outDir = join(here, 'data', 'runs')
  await mkdir(outDir, { recursive: true })
  const failFile = join(outDir, `${date}.failed.json`)
  await writeFile(failFile, JSON.stringify({ date, battery: battery.version, models, results }, null, 2) + '\n')
  console.error(`all calls failed — wrote ${failFile}, skipping run file and graph write`)
  process.exit(1)
}

const run = {
  date,
  ranAt: new Date().toISOString(),
  battery: battery.version,
  models,
  byModel,
  results,
}

const outDir = join(here, 'data', 'runs')
await mkdir(outDir, { recursive: true })
const outFile = join(outDir, `${date}.json`)
await writeFile(outFile, JSON.stringify(run, null, 2) + '\n')
console.log(`wrote ${outFile}`)

if (args.graph) {
  const summaryLine = Object.entries(byModel)
    .map(([model, m]) => `${model} ${m.passed}/${m.total}`)
    .join('; ')
  const { id, db } = await writeRunDoc({
    date,
    battery: battery.version,
    models,
    summaryLine: `Daily Index run, battery ${battery.version}: ${summaryLine}`,
    results: run,
  })
  console.log(`wrote ${id} (db: ${db})`)
}
