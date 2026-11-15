# Pendulum

Interactive browser pieces built on one physics paper. Before any of it
reached a screen, the paper was checked equation by equation.

The paper is Boran Yeşilyurt's *Equations of Motion Formulation of a Pendulum
Containing N-point Masses*
([arXiv:1910.12610v2](https://arxiv.org/abs/1910.12610v2)). It covers a
planar pendulum of n point masses, gives one formula for any n, and shows the
hanging rope it becomes as n grows.

## What is here today

- **The paper, checked.** Every display equation was compared with a
  derivation of its own. Of 92, 73 are right as printed, 14 carry a misprint
  and 5 hold under a stated reading. The registry, the 400 tests that decide
  it and what was found are in [`physics/`](physics/README.md).
- **The decisions**, each with its reason and the measurements behind it,
  and the questions still open: [`docs/decisions.md`](docs/decisions.md).
- **The web app's skeleton** in [`web/`](web/): one page per piece over a
  shared core, opened in Chromium, Firefox and WebKit on every change. The
  first piece's page has its stage and nothing on it yet.
- **The physics in the browser**, in [`web/src/physics/`](web/src/physics/):
  the chain by the rod-tension route in double precision, and its motion in
  time by RK4 in substeps taken from the rod tensions. It is tested against
  answers the oracle writes, within 1e-12, against the paper's general
  formula, and by the energy along chaotic motion. Nothing draws it yet.

Next comes that first piece: a chain to grab and throw, whose number of
masses runs from one to a rope while it moves, with twins that fan out to show
chaos. Every piece is meant to run fullscreen in the major browsers.

## How it is built

In Claude Code sessions, following [`CLAUDE.md`](CLAUDE.md). Each slice of
work is one pull request, merged once CI is green. CI runs the oracle's lint
and tests, the web app's checks with every page in three browser engines, and
a secret scan of every commit.

## Running the checks

Needs [uv](https://docs.astral.sh/uv/) and [Node](https://nodejs.org/) 26;
the pre-commit hook also needs
[gitleaks](https://github.com/gitleaks/gitleaks).

```sh
git config core.hooksPath .githooks   # once per clone: secret scan before each commit

cd physics/oracle
uv sync
uv run pytest                         # every equation of the paper, about half a minute
uv run ruff check
uv run ruff format --check

cd ../../web
npm ci
npm run typecheck
npm run lint
npm run format:check
npm test                              # unit tests
npm run e2e                           # every page in the three engines
npm run dev                           # the app, at http://127.0.0.1:5173/
```

`npm run e2e` needs Playwright's browsers; `npm run e2e:browsers` installs
them with their system packages on Ubuntu, as CI does.

## Layout

| Path | What it holds |
|---|---|
| `physics/` | the check of the paper: the registry, the oracle, the oracle's answers that the browser's physics is tested against, and how to rebuild a local copy of the paper |
| `web/` | the browser app: the registry of pieces, one page per piece, the shared core in `src/core/`, the physics in `src/physics/`, unit tests beside the code and browser tests in `e2e/` |
| `docs/decisions.md` | the decisions, their reasons and evidence, and the open questions |
| `.github/` | CI and the pull request template |
| `.githooks/` | the pre-commit secret scan |
| `CLAUDE.md` | the rules the sessions that build Pendulum follow |

## Licence

MIT; see [LICENSE](LICENSE). The paper is not part of the repository:
[`physics/README.md`](physics/README.md) says why, and how to rebuild a local
copy.
