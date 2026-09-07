# Winthropic Harness

The eval harness behind the [Winthropic Index](https://winthropic.com): a small, versioned battery of tasks run daily against Claude models to measure drift over time. This repo is published so anyone can replay a day's run against their own API key and diff it against the published record.

Winthropic is an independent watchdog. It is not affiliated with Anthropic.

## Replay a run

Requires Node 20 or newer and an Anthropic API key. There are no npm dependencies to install.

```sh
git clone https://github.com/maml/winthropic-harness && cd winthropic-harness
ANTHROPIC_API_KEY=sk-ant-... node run.js --models claude-opus-5 --battery v1
```

The run prints a pass count per model and writes the full record to `data/runs/<date>.json`. Compare it with the published record for that day at `https://winthropic.com/api/runs/<date>.json`.

Flags:

| Flag | Meaning |
|------|---------|
| `--models a,b` | Comma-separated model ids. Defaults to the daily set in `run.js`. |
| `--battery v1` | Battery version to run. Defaults to `v1`. |
| `--limit N` | Run only the first N tasks. Useful as a smoke test. |
| `--graph` | Also write a summary document to a SurrealDB instance. Needs `SURREAL_URL`, `SURREAL_USER`, `SURREAL_PASS`. You do not need this. |

If your key is identity-linked to a workspace, set `ANTHROPIC_WORKSPACE_ID` as well.

## Why results are comparable

The point of the Index is longitudinal comparison, so the request shape never changes:

- Temperature 0 where the model accepts it, fixed `max_tokens`, no system prompt. Claude 5 models reject `temperature`, so they run at default sampling and each result records `temperature: null`.
- The battery is versioned (`battery/v1.json`). Results are only comparable within one version. Changing a task means a new battery file, never an edit in place.
- Scoring is deterministic (`lib/score.js`): exact match, numeric with tolerance, regex, JSON equality, or a fixed set of test vectors run against returned code. No model grades another model.
- Each run record also carries `available`: the models list the API served this key that day (id, display name, created date), polled once per run at zero token cost. It feeds the lifecycle board at winthropic.com/lifecycle. A day the poll fails simply omits the field.
- Runs under `data/runs/` are append-only. A day where every call failed is written as `<date>.failed.json` and never replaces a good record.

Because sampling is not fully deterministic even at temperature 0, expect an occasional one-task difference between your replay and the published run. A consistent gap across several days is the signal the Index exists to catch.

## Layout

```
run.js            entry point
battery/v1.json   the tasks and their scorers
lib/anthropic.js  Messages API client (fetch, retries, temperature fallback)
lib/score.js      deterministic scorers
lib/graph.js      optional SurrealDB summary write
data/runs/        one JSON record per day
tests/            node:test suites, no network
```

```sh
npm test
```

## Source of truth

This repo is a read-only mirror of the `harness/` directory in the private Winthropic monorepo, published with `git subtree`. Issues are welcome here. Pull requests are read but land upstream first.

## License

MIT.
