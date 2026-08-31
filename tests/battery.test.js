import test from 'node:test'
import assert from 'node:assert'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SCORER_TYPES, score } from '../lib/score.js'

const here = dirname(fileURLToPath(import.meta.url))
const battery = JSON.parse(await readFile(join(here, '..', 'battery', 'v1.json'), 'utf8'))

test('battery declares a version', () => {
  assert.match(battery.version, /^v\d+$/)
})

test('task ids are unique and well-formed', () => {
  const ids = battery.tasks.map((t) => t.id)
  assert.equal(new Set(ids).size, ids.length)
  for (const id of ids) assert.match(id, /^[a-z0-9_]+$/)
})

test('every task has a category, prompt, and valid scorer', () => {
  for (const task of battery.tasks) {
    assert.ok(task.category, task.id)
    assert.ok(task.prompt?.length > 10, task.id)
    assert.ok(SCORER_TYPES.includes(task.scorer.type), `${task.id}: ${task.scorer.type}`)
    if (task.scorer.type === 'jsfunc') {
      assert.ok(task.scorer.fn, task.id)
      assert.ok(Array.isArray(task.scorer.vectors) && task.scorer.vectors.length > 0, task.id)
    }
    if (task.scorer.type === 'regex') {
      assert.doesNotThrow(() => new RegExp(task.scorer.pattern, task.scorer.flags ?? ''), task.id)
    }
  }
})

test('a known-good answer passes each non-jsfunc task scorer', () => {
  const goldens = {
    sanity_arith: '400',
    math_avg_speed: '87.5',
    count_letters: '3',
    extract_date: '2024-03-07',
    logic_liars: 'Bob',
    classify_sentiment: 'negative',
    follow_format_primes: '2,3,5',
    constraint_no_e: 'A vast sky hangs high atop all towns',
    exact_word_count: 'soft gray cold quiet falling',
    json_emit: '{"name":"winthrop","version":1}',
  }
  for (const task of battery.tasks) {
    if (task.scorer.type === 'jsfunc') continue
    assert.ok(task.id in goldens, `no golden answer for ${task.id}`)
    assert.equal(score(task, goldens[task.id]), true, task.id)
  }
})
