# The physics, checked

This project is built on one paper:

> Boran Yeşilyurt, *Equations of Motion Formulation of a Pendulum Containing
> N-point Masses*, [arXiv:1910.12610v2](https://arxiv.org/abs/1910.12610v2).

It derives the equations of motion of a planar pendulum made of n point masses
on massless rods, gives one formula for any n, and shows that with infinitely
many masses the pendulum becomes a hanging rope. Before any of it is turned
into something that moves on a screen, every display equation of the paper was
checked. This directory holds the result and the means to repeat it.

## What is here

- **`equations.yaml`**, the registry. One entry per display equation of the
  paper (`EQ-38`), by the number printed in the PDF, with what the equation
  says, whether it is right as printed, and the test that decides it. Then the
  findings on the paper's prose (`TX-3`) and the statements this project relies
  on, in its own notation (`PH-3`). Code and tests cite these ids.
- **`oracle/`**, the checks: Python, used in development only, never shipped
  to the browser.

  | Directory | What it establishes |
  |---|---|
  | `symbolic/` | Sections 2, 3 and 6. The Euler-Lagrange equations derived from the positions of the masses, for one to four masses, and every printed equation compared with them. |
  | `limits/` | Sections 4 and 5. The linearized pendulum, the difference equation for equal masses, the hanging rope and its modes, and how fast the first converges to the last. |
  | `chain/` | The same system from Newton's law with the rod tensions as unknowns, written without the paper. A second route to the accelerations, in a number of operations proportional to n. |
  | `crosscheck/` | The paper's formulas (38) and (47) evaluated for any n, against the compact form and against `chain/`, up to 256 masses and at fifty digits. |
  | `registry/` | Tests that hold `equations.yaml` to its own rules. |
  | `paper.py` | Builds the local reference copy of the paper (below). |

## What was found

Of the paper's 92 display equations, 73 are right as printed, 14 carry a
misprint, and 5 hold only under a reading that the entry states. None is wrong
beyond a small correction. The registry has each one; the ones that matter most:

- **The general formula, (38), is right.** It equals the Euler-Lagrange
  equations for one to four masses, it is the same function as the compact form
  `PH-3` up to 256 masses, and it vanishes to fifty digits at the accelerations
  that Newton's law with rod tensions gives.
- **The second derivation's formula, (46) and (47), is misprinted.** Its fourth
  term has one angular velocity too many, which leaves the term with the wrong
  dimensions. Without it, the formula is (38) term by term. As printed, the two
  derivations do not agree for two masses or more.
- **The small-angle section keeps some cubic terms and drops another**, so its
  general line (51) is neither the linearization nor a consistent cubic
  approximation. The linearized equation that section 5 starts from, (54), is
  right.
- **The rope.** The limit equation (74) is the wave equation of a hanging rope.
  The paper stops at the remark that Bessel's equation appears; carried through,
  the frequencies are half the zeros of the Bessel function J0 times the square
  root of g/L (`PH-8`). A chain of N equal masses approaches the rope mode by
  mode: each low mode is slower than the rope's by one part in 4N, while the
  modes above about 1.6 times the square root of N are faster (`PH-9`).

## How it was checked

Each equation was transcribed literally, misprints included, and compared with
a derivation that takes nothing from the paper. Identities are decided by
evaluating both sides at random points with fifty significant digits: an
identity leaves a residual near 1e-50, anything else a residual of order one.
For a misprint, the test asserts both that the printed form fails and that the
corrected form holds, so the test files are the errata.

Three passes were kept apart on purpose: the derivation from the Lagrangian,
the limits, and the constraint-force route were each done without sight of the
others, and the last without sight of the paper. Every finding that says the
paper is wrong, and every statement the project relies on, was then handed to a
second review as a bare claim, without the route that led to it, and checked
again from the paper up. `second_check` in the registry records the outcome.

The passes and the second review were done by Claude agents. None of their
claims is taken on trust: each one ended as a test in this directory, which
anyone can run.

The second review confirmed every claim and attached a condition to four. It
also corrected the first pass twice: the chain is not slower than the rope in
every mode, only in the low ones, and the paper's second derivation needs its
earlier misprints corrected as well as the one in its final formula. Both are
in the registry as it stands, and the first is now a test.

## The paper is not in this repository

arXiv distributes the paper under its non-exclusive licence, which gives
readers no right to redistribute it. The repository tracks the recipe instead:

```sh
cd physics/oracle
uv run python paper.py
```

fetches the LaTeX source from arXiv, checks it against pinned digests and
writes `reference/` at the repository root (ignored by git): the source, the
paper as Markdown with every display equation carrying its printed number, and
the same equations as data. It needs [pandoc](https://pandoc.org) on the PATH.
With `pdftotext` (poppler) and a PDF of the paper at hand, it also confirms the
printed numbers against the pages.

The numbers matter because the source labels its equations with names that
look like numbers and are not: the equation labelled `23` is printed as (38).
Everything here cites printed numbers.

## Running the checks

```sh
cd physics/oracle
uv sync
uv run pytest                              # everything, about half a minute
uv run python limits/convergence.py        # rewrites limits/convergence.md
uv run python chain/accuracy.py            # the rounding-error study of chain/
```

## Conventions

- x to the right, y up, gravity along -y, the pivot at the origin.
- The angle of rod i is measured from the downward vertical and is absolute,
  not relative to the rod above: mass i sits at x = sum of l_k sin(theta_k),
  y = minus the sum of l_k cos(theta_k), over the rods down to i.
- In the paper's section 5, y is the distance below the support, the opposite
  of the figures' y axis.
