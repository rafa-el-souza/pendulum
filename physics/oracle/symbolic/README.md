# Symbolic check of sections 2, 3 and 6 of the paper

Every display equation of sections 2, 3 and 6 of B. Yesilyurt, "Equations of Motion
Formulation of a Pendulum Containing N-point Masses" (arXiv:1910.12610v2), that is
(1) to (47) with (46.1) to (46.4), the definitions of sigma_jk and phi_jk, and (86),
checked against a derivation from first principles. Equations are cited by their
printed numbers.

Run from `physics/oracle`:

```sh
uv run --no-sync pytest symbolic -q        # add -s to print every residual
uv run --no-sync python symbolic/lagrangian.py   # prints the n = 1, 2 equations
```

The suite takes about ten seconds and needs no network.

## Files

- `lagrangian.py`: the reference. Positions from the geometry of the figures only
  (angles from the downward vertical, x right, y up), then velocities, kinetic and
  potential energy, the Lagrangian and the Euler-Lagrange expressions
  d/dt(dL/d(theta_j-dot)) - dL/d(theta_j) for any n, by differentiation alone. Also
  the pieces the paper groups its terms into, and the compact form established here
  (checked against the reference, never used as one).
- `numeric.py`: decides identities by evaluating both sides at six seeded random
  points at 50 significant digits. Points keep angles and their differences away from
  multiples of pi/2 and take unequal masses, lengths, velocities and accelerations.
  An identity leaves a relative residual near 1e-50 (threshold 1e-35); a
  non-identity leaves one of order 0.1 to 1 (threshold 1e-3). Nothing is simplified
  symbolically.
- `printed_sections_2_3.py`: the printed equations transcribed literally, keyed by printed
  number in `PRINTED`, each with its printed LaTeX in the docstring. Where the
  verdict is misprint, the corrected form sits beside it (`CORRECTED`).
- `test_sections_2_3.py`: one test per printed number. An equation that is right as
  printed must hold; for a misprint the printed form must fail and the corrected form
  hold, so the file doubles as the errata. Further tests check prose claims between
  the equations, the oracle itself (three routes to the Euler-Lagrange expressions
  agree), and that `verdicts.json` covers the range.
- `verdicts.json`: one verdict per equation (`ok`, `misprint`, `wrong`, `notation`,
  `unchecked`), with the problem, the corrected LaTeX, what was checked and the test
  that checks it.
