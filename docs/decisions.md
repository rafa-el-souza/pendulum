# Decisions

Each decision that shapes Pendulum, with its reason and the evidence behind
it, oldest first. A changed decision gets a new entry that names the one it
replaces; entries are not rewritten. Questions still open are at the end.

## 1. The paper stays out of the repository

*2026-11-15.* The PDF, its LaTeX source and any verbatim conversion of it are
never tracked. `physics/oracle/paper.py` rebuilds a local reference copy from
arXiv and checks it against pinned digests.

**Why.** arXiv distributes the paper under its non-exclusive licence, which
gives readers no right to redistribute it.

**Evidence.** [`physics/README.md`](../physics/README.md), "The paper is not
in this repository".

## 2. The physics is checked by an oracle in Python, outside the product

*2026-11-15.* Before anything moves on screen, every display equation of the
paper is compared with a derivation of its own. The checks are Python with
SymPy, NumPy, SciPy and mpmath, locked and run with uv, used in development
only and never shipped. They are three independent routes (the Euler-Lagrange
equations, the limits of sections 4 and 5, and Newton's law with the rod
tensions, written without the paper) and a cross-check between them.

**Why.** Computer algebra and arbitrary precision turn "is this printed
equation right?" into a test with a yes or a no. Routes that share nothing
cannot share a mistake.

**Evidence.** 400 tests in `physics/oracle/`. Of 92 display equations, 73 are
right as printed, 14 carry a misprint and 5 hold under a stated reading; the
registry, [`physics/equations.yaml`](../physics/equations.yaml), has each one.

## 3. Kept as if public, under the MIT licence

*2026-11-15.* The repository is private for now and is written as if it were
public: tracked files, commits and pull requests are for a reader assessing
the work, and working notes between sessions stay out of git. The code is MIT.

## 4. The first piece: the chain in the hand

*2026-11-15.* Pendulum is several interactive pieces. The first is one chain
pendulum to grab and throw, whose number of masses runs from one to a rope
while it moves, with twins released a hair apart that show chaos by fanning
out. The others are not decided yet.

**Why.** Chosen after trying a sketch of it. It follows the paper's own arc,
from one pendulum to n to the rope, and puts the physics in the hand.

## 5. The physics in the browser: rod tensions on the CPU, RK4 stepped by the tension

*2026-11-15.* The chain is computed on the CPU in double precision, by the
rod-tension form (`PH-4`), integrated with classical RK4 on the angles. The
substep comes from the fastest vibration of the chain, which the rod tensions
give at each step.

**Why.** Measured on two cores of a 2020 laptop processor without a GPU, with
Node 26, for a chain of n equal masses of 1 m and 1 kg in total. Energy error
is the worst value over one minute, as a fraction of the energy that lifts the
chain to the horizontal.

- The tension form costs time proportional to n and kept errors near 1e-15 up
  to 16 384 rods. The dense form, (38) or the compact one, costs n² to build
  and n³ to solve, and its conditioning reaches 3.7 million at 256 masses.
- A JavaScript port of the tension form matched the oracle within 4e-16 on 81
  states from 1 to 1 024 masses. One evaluation costs about 37 ns per mass, linear
  up to 100 000 masses.
- With few masses, RK4 wins by orders of magnitude: a double pendulum dropped
  from the horizontal at 960 steps per second keeps its energy within 1e-8 per
  minute, at 0.007 ms per frame. Euler, Verlet on the angles and RK2 do not.
- With many masses the step is set by stability, since the fastest vibration
  is near 2n√(g/L). A long chain dropped from the horizontal cracks like a whip:
  with 512 masses every fixed step up to 7 680 per second breaks, and with 128
  only 7 680 survives. With the step taken from the tension, RK4
  carries 128 masses through the whip with an energy error of 7e-3, at 3.3 ms
  per frame (8.9 ms at the peak). 512 masses thrown hard need 50 ms per frame,
  which does not fit in real time.

**Revisit when** a piece needs tens of thousands of pendulums at once. Single
precision on a GPU holds numerically (one evaluation errs by 2e-7 to 2e-6 up
to 8 192 masses) and becomes necessary only at that scale.

## 6. Drawing: WebGL2 only, called directly, without a library

*2026-11-15.*

**Why.** WebGL2 works in every major browser, 97.3% of global usage
(caniuse, 2026-11-15). WebGPU does not yet: Firefox enables it only on Windows
and on macOS 26 with Apple Silicon, not on Linux or Android, and desktop
Safari only from macOS 26. The same minimal program was built directly and
with each candidate library. A library saved 14 to 43 of its 144 lines and
added, compressed, 13 kB (twgl), 14 kB (ogl), 128 kB (three), 158 kB (pixi)
or 216 kB (three with WebGPU). regl reaches float textures and instancing only
through WebGL1 extensions; twgl and ogl had no release in over twelve months;
pixi failed silently twice; three on WebGPU does not take GLSL shaders.

**Revisit when** a piece needs GPU compute.

## 7. One app, no framework

*2026-11-15.* One app with several pieces, each on its own route, over a
shared core: physics, drawing and parameters. No UI framework. Styling is CSS
Modules over design tokens.

**Why.** Each piece is a fullscreen canvas with a few controls, and there will
be several pieces.

## 8. Language and tools

*2026-11-15.* TypeScript ~6.0, Vite 8, Vitest 5, ESLint 9, Prettier 3,
Playwright 1.65.

**Why.** A small, current toolchain with a test runner and browser automation
built for Vite. typescript-eslint 8.72.2 accepts TypeScript below 6.1 only
(checked 2026-11-15), so TypeScript 7 waits for it.

## 9. How correctness is tested

*2026-11-15.* The oracle writes fixtures in JSON that Vitest reads, compared
within 1e-12. Over long horizons, where the motion is chaotic and trajectories
cannot be compared, invariants such as the energy are checked instead.
Playwright opens every page in Chromium, Firefox and WebKit and fails on any
error. Tests come first where an answer can be checked: the physics, the
parameter registry, the shareable address. Drawing and interaction are judged
by looking at them.

**Evidence.** The sketch's port of the physics matched the oracle within
4e-16 under this method.

## 10. One registry of parameters

*2026-11-15.* Each parameter is declared once: name, range, default and how it
enters the model. That declaration feeds the control on screen, the shareable
address, the slow drift of a parameter over time and the axis along which the
twins differ.

**Why.** A new parameter is one entry and its effect, and nothing is built
twice.

## 11. A process sized to the project

*2026-11-15.* One pull request per slice, merged once CI is green. CI runs
the oracle's lint and tests and a secret scan of every commit; a pre-commit
hook scans staged changes. Automated code review runs only on changes the
author names, or that a session judges critical and the author approves.
Decisions live in this file, one entry each. Requirement ids exist only for
the physics (`EQ`, `TX`, `PH`). Work happens in Claude Code sessions that
follow [`CLAUDE.md`](../CLAUDE.md).

**Why.** Rigor in proportion to a portfolio of interactive pieces made by one
person: the checks that protect something real stay (the physics against the
oracle, secrets out of the history), and the ceremony goes.

## 12. Hosting: GitHub Pages, on a subdomain of the author's own domain

*2026-11-15.* The site will be published by GitHub Pages, under a subdomain
of the author's own domain, once the repository is public. Until then it has
no public address.

**Why.** On GitHub's free plan, Pages publishes public repositories only. It
needs no server and no account beyond GitHub, serves HTTPS, and takes a
custom domain through one DNS record. Two other homes were weighed: a server
shared with another project, which would tie the two together (one proxy, one
deploy key, one lifecycle), and a third-party static host, which adds an
account. Every URL in the build is relative (decision 7), so the site works
under any of them.

## 13. The repository is public

*2026-11-15.* The repository is public. This replaces the first sentence of
decision 3, which kept it private for the time being; the rest of decision 3
stands. Tracked files, commits and pull requests are written for a reader
assessing the work, working notes stay out of git, and the code is MIT.

**What follows.** GitHub Pages can now publish the site (decision 12). `main`
can also be set to require the CI jobs to pass before a merge, which GitHub's
free plan offers only to public repositories.

## 14. Published at the repository's GitHub Pages address first

*2026-11-15.* The site is published now at
<https://rafa-el-souza.github.io/pendulum/>, the address GitHub Pages gives
this repository. The author's subdomain stays the final address (decision 12)
and comes once its DNS records are in place; this entry adds to decision 12
and replaces nothing. Each push to `main` publishes the build that CI has just
opened in the three engines, and only after every CI job has passed.

**Why.** So that each slice can be tried on a laptop and on a phone as soon as
it is merged, before the subdomain's DNS records exist.

## 15. Time is a parameter, and the frame budget slows it

*2026-11-15.* The speed of time is one of a piece's parameters (decision
10), from slow motion to faster than real time. The author chooses its
starting value by trying. When the physics of a frame does not fit its budget
of 6 ms, time runs slower than asked, and the time control shows the speed
actually reached. This settles the open question of what happens when the
frame budget runs out.

**Why.** It was the author's idea: slow motion as one more control, not as a
limit. The chain is simulated 1 m long and drawn a few centimetres tall, so at
real time it swings like a miniature filmed in slow motion. A real chain of
that size would swing three to six times faster. A speed control fixes that
look and makes slow motion something to play with, and the budget's slowing
needs no message of its own, because the control it lowers shows it.

**Evidence.** Two masses cost microseconds of physics per frame, while 512
masses thrown hard need about 50 ms per frame on the machine of decision 5. So
only long chains thrown hard reach the budget.

## 16. Controls are discreet, fade away, and each has a key

*2026-11-15.* A piece's controls stay out of sight until the pointer moves,
a finger lifts or a key is pressed, and fade after a moment of stillness.
Keyboard focus keeps them in sight, and reduced motion makes them appear
without fading. Every control has its key, shown beside it where a pointer
hovers. How discreet they are, and when they fade, the author decides by
trying.

**Why.** The author asked for discreet controls that disappear, for a more
immersive piece, and for keys for them.

## 17. Time starts at 0.8 of real time

*2026-11-15.* A piece's time starts at 0.8 of real time, with 0.9 one step
up. This entry gives decision 15 the starting value it left to the author,
and replaces the part of its reason that expected real time to look like slow
motion: tried on the published piece, real time already looked fast.

**Why.** The author tried the first piece at its placeholder, twice real time,
found even real time fast, and named 0.8 or 0.9. The piece opens at the lower
of the two, and the other is one key away. The physics of scale in decision
15 stands; what a speed looks like is settled by trying it.

## Open

- **Dimension.** The first piece is planar; depth may come with later pieces.
- **Frame budget and target devices.** The sketch budgets 6 ms per frame for
  the physics and 4 ms for the twins; real devices will set the numbers.
- **Which browser versions** count as the major browsers.
- **Accessibility.** Keyboard control and a pause always within reach from the
  start; reduced motion and the rest still to be decided.
- **Languages.**
- **Visual identity.**
- **Friction.** It is not in the paper. Whether the first piece has it, and of
  which kind, is open.
- **The order in which parameters arrive.**
