# Working in this repository

Pendulum is built in Claude Code sessions. This file holds the rules they
follow here; where other instructions differ, this file applies to this
repository.

## The project

A portfolio project: interactive browser pieces built on one paper, checked
equation by equation (`physics/`). Every tracked file, commit and pull request
is written for a reader assessing the work. Tracked text is in English.

## Decisions

- The author decides technologies, formats, constraints, algorithms, and how
  anything looks or feels. Bring a recommendation and wait for the answer in
  the author's own words; not objecting is not a yes.
- How something looks or feels is decided by seeing it: build the recommended
  option for the author to try, keep the others on record, ask afterwards.
- Technical and product decisions go into `docs/decisions.md` in the pull
  request that acts on them, with reason and evidence. A changed decision is a
  new entry that names the one it replaces.

## Slices and pull requests

- One pull request per slice, on a branch from `main`. Commit each coherent
  piece as soon as it is done and green.
- Commit subjects: `type(scope): what now exists, as a sentence` (`feat`,
  `fix`, `docs`, `test`, `build`, `ci`, `chore`, `refactor`). No co-author
  trailers.
- Pull request bodies follow `.github/pull_request_template.md`.
- A session merges its own pull request once CI is green, with a merge commit,
  and never merges red.
- Automated code review runs only on changes the author names, or on a change
  a session judges critical and proposes for review (what, how, at what cost)
  once the author approves.

## Tests

- Test first where an answer can be checked: the physics against the oracle's
  fixtures, the parameter registry, the shareable address. Physics tests cite
  the registry ids they check (`EQ-n`, `TX-n`, `PH-n`).
- Nothing is implemented from the paper without reading its entry in
  `physics/equations.yaml`: several printed equations carry misprints.
- Drawing and interaction are judged by looking. Playwright checks that every
  page opens without error in Chromium, Firefox and WebKit.

## Tools

- Read the current documentation or source of a tool before configuring it.
- Python runs through uv in `physics/oracle`; Node tools through
  `package.json` scripts.
- Run `git config core.hooksPath .githooks` once per clone. The pre-commit
  hook scans staged changes with gitleaks, lints staged workflows with
  actionlint, and refuses a commit it cannot check.

## Hygiene

- The repository is public: no private names, machines, accounts, paths or
  working notes in tracked files, commits or pull requests.
- The paper, its source and any verbatim conversion never enter git
  (`physics/README.md` says why).
