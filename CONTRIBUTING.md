# Contributing

## Workflow

- **Trunk-based.** `main` is protected and always deployable. Work on short-lived branches:
  `refactor/<step>-<topic>`, `fix/<topic>`, `perf/<topic>`, `chore/<topic>`.
- **One concern per PR**, ideally < 400 changed lines. Squash-merge.
- **Conventional Commits** (enforced by commitlint): `feat|fix|refactor|perf|test|docs|chore|ci(scope): …`.
- Run `pnpm verify` before opening a PR; CI runs the same gates.
- Run `/code-review` (Claude Code) on the branch before requesting review; do a larger review at
  each phase boundary.

## Refactor rules

1. A **pure refactor commit never changes a test expectation.** If an expectation must change,
   that is a behaviour change and goes in its own commit.
2. Extract → type → unit-test → delete the old code, one module per PR, in the order given in
   [docs/refactor-plan.md](docs/refactor-plan.md).
3. Extracted pure logic must match the legacy oracle fixtures in `tests/fixtures/legacy/`.

## Fixing bugs

Bugs are fixed as we go, but every fix is traceable:

1. `test(<scope>): reproduce BUG-00X …` — a failing test (or remove the `test.fail()` marker of
   the existing known-bug spec once fixed).
2. `fix(<scope>): … (BUG-00X)` — the fix, in its own commit.
3. Update [docs/known-bugs.md](docs/known-bugs.md) and list the change under
   **Behaviour changes** in the PR description.

## Visual baselines

- Visual tests run in Docker (`pnpm test:visual`) because GPU output differs between machines.
- Baselines change **only** in a commit named `test(visual): update baselines — <reason>`, and the
  reviewer checks the Playwright HTML report diff (`playwright-report/`).

## Definition of done

- [ ] CI green (typecheck, lint, format, unit, e2e, visual)
- [ ] New logic has unit tests; pure modules keep ≥ 90 % line coverage
- [ ] No new `any`, `eslint-disable` or `@ts-ignore` without a justifying comment
- [ ] Behaviour changes listed in the PR; `docs/known-bugs.md` updated
- [ ] ADR added for architectural decisions
- [ ] Manual QA: drive 2 min in every camera, cycle biomes & stations;
      audio PRs: listen to every station; UI/input PRs: test on a phone
