# Horizon Drift

An endless, tranquil road trip through shifting retrowave horizons — a procedural three.js world
with a generative Tone.js synth radio.

> **Status:** being refactored from a single-file prototype into a maintainable TypeScript app.
> See [docs/refactor-plan.md](docs/refactor-plan.md). The original lives in
> [`legacy/index.html`](legacy/index.html) and serves as the behaviour oracle.

## Requirements

- Node 24 (`.nvmrc`), pnpm 12
- Docker (for visual regression tests)

## Commands

| Command                                              | What it does                                                                   |
| ---------------------------------------------------- | ------------------------------------------------------------------------------ |
| `pnpm install`                                       | Install dependencies and git hooks                                             |
| `pnpm dev`                                           | Dev server: app at <http://localhost:5173/>, prototype at `/legacy/index.html` |
| `pnpm build` / `pnpm preview`                        | Production build to `dist/` and preview it                                     |
| `pnpm typecheck` / `pnpm lint` / `pnpm format:check` | Static checks                                                                  |
| `pnpm test`                                          | Unit tests (Vitest)                                                            |
| `pnpm test:e2e`                                      | Smoke + known-bug e2e tests against the built app and the prototype            |
| `pnpm test:visual`                                   | Visual regression tests in the Playwright Docker image                         |
| `pnpm test:visual:update`                            | Re-generate visual baselines (only in a dedicated commit)                      |
| `pnpm fixtures:legacy`                               | Re-capture oracle fixtures from the legacy prototype                           |
| `pnpm verify`                                        | Everything CI runs                                                             |

## Controls

`W/S` or `↑/↓` throttle/brake · `A/D` or `←/→` steer · `C` cruise control · `R` next station ·
`B` next biome · `V` camera · `L` headlights · `H` minimal HUD

## Docs

- [Contributing & workflow](CONTRIBUTING.md)
- [Refactor plan](docs/refactor-plan.md)
- [Known bugs](docs/known-bugs.md)
- [Architecture decisions](docs/adr/)
