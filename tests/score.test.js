import test from 'node:test'
import assert from 'node:assert'
import { score } from '../lib/score.js'

const t = (scorer) => ({ id: 'x', category: 'x', scorer })

test('exact: normalizes case, whitespace, trailing period, markdown emphasis', () => {
  const task = t({ type: 'exact', expected: 'Bob' })
  assert.equal(score(task, ' bob.\n'), true)
  assert.equal(score(task, '**Bob**'), true)
  assert.equal(score(task, 'The liar is Bob'), false)
})

test('numeric: takes last number, honors tolerance', () => {
  assert.equal(score(t({ type: 'numeric', expected: 400 }), 'The answer is 400'), true)
  assert.equal(score(t({ type: 'numeric', expected: 400 }), '399'), false)
  assert.equal(score(t({ type: 'numeric', expected: 87.5, tolerance: 0.01 }), '87.50'), true)
  assert.equal(score(t({ type: 'numeric', expected: 400 }), 'no digits here'), false)
})

test('regex: applied to trimmed raw output', () => {
  const task = t({ type: 'regex', pattern: '^2,3,5$' })
  assert.equal(score(task, ' 2,3,5 \n'), true)
  assert.equal(score(task, '2, 3, 5'), false)
})

test('regex: no-letter-e constraint with lookaheads', () => {
  const task = t({ type: 'regex', pattern: '^(?=[^eE]*$)(?=.*sky).{20,}$', flags: 'is' })
  assert.equal(score(task, 'A vast sky hangs high atop all towns'), true)
  assert.equal(score(task, 'Sky is dark, birds fly at dawn again'), true)
  assert.equal(score(task, 'The sky is very blue over the meadow'), false)
})

test('json_eq: parses, ignores key order and fences', () => {
  const task = t({ type: 'json_eq', expected: { name: 'winthrop', version: 1 } })
  assert.equal(score(task, '{"version": 1, "name": "winthrop"}'), true)
  assert.equal(score(task, '```json\n{"name":"winthrop","version":1}\n```'), true)
  assert.equal(score(task, '{"name":"winthrop","version":"1"}'), false)
  assert.equal(score(task, 'not json'), false)
})

test('jsfunc: runs vectors against the extracted function', () => {
  const task = t({
    type: 'jsfunc',
    fn: 'reverseWords',
    vectors: [[['one two three'], 'three two one'], [['solo'], 'solo']],
  })
  const good = '```js\nfunction reverseWords(s) { return s.split(" ").reverse().join(" ") }\n```'
  const bad = '```js\nfunction reverseWords(s) { return s }\n```'
  assert.equal(score(task, good), true)
  assert.equal(score(task, bad), false)
  assert.equal(score(task, 'no code at all'), false)
})

test('jsfunc: infinite loop in submitted code fails, not hangs', () => {
  const task = t({ type: 'jsfunc', fn: 'f', vectors: [[[1], 1]] })
  assert.equal(score(task, '```js\nfunction f(n) { while (true) {} }\n```'), false)
})

test('unknown scorer type throws', () => {
  assert.throws(() => score(t({ type: 'nope' }), 'x'))
})
