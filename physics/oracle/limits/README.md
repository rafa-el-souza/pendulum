# Sections 4 and 5 of arXiv:1910.12610v2, checked

Equation-by-equation verdicts for the printed equations (48)-(85) of Yesilyurt's
"Equations of Motion Formulation of a Pendulum Containing N-point Masses": the
small-oscillation approximation (section 4) and the limit of infinitely many point masses,
the hanging rope (section 5). Numbers are the ones printed in the PDF.

Result: 31 `ok`, 2 `misprint` ((53), (62)), 5 `notation` ((60), (67), (70), (71), (73)),
no `wrong`. Section 4 is algebraically faithful but inconsistent in order; the linearized
system (54), the difference equation (65)/(66) and the rope equation (74) are right.

## Run

From `physics/oracle`:

```sh
uv run --no-sync pytest limits -q                  # the checks, about 10 s
uv run --no-sync python limits/convergence.py      # rewrites convergence.md
```

## Files

- `linearization.py`: the ground truth, from the Lagrangian alone (not from the paper's
  (38)): the exact Euler-Lagrange residual of the n-mass chain and its linearization,
  M_ab = l_a l_b sum_{i>=max(a,b)} m_i and K = diag(g l_a sum_{i>=a} m_i) in the angles,
  diag(m) and a tridiagonal stiffness in the horizontal displacements; sympy builders that
  re-derive them; normal modes with `scipy.linalg.eigh`.
- `printed_sections_4_5.py`: literal transcriptions keyed by printed number; `ERRATA` holds the
  printed and corrected LaTeX of each misprint, `READINGS` the reading under which each
  `notation` equation holds.
- `rope.py`: the continuous rope: omega_k = (j_{0,k}/2) sqrt(g/L) and
  Psi_k(y) = J0(j_{0,k} sqrt(1 - y/L)).
- `test_sections_4_5.py`: one test per printed number where a test can decide it. A misprint
  is asserted both ways (printed fails, corrected passes); a `notation` equation fails under
  the literal reading and passes under the stated one. Also the convergence of the chain's
  frequencies and mode shapes to the rope's, and a consistency check of `verdicts.json`.
- `convergence.py`, `convergence.md`: the N-mass chain against the rope along the paper's
  doubling sequence, N = 1, 2, ..., 1024 (and 3, 6, ..., 768), with observed orders.
- `verdicts.json`: one object per printed number from 48 to 85.

## Conventions

- In section 5, y is the distance below the support along the rope (0 at the support, L at
  the free end), not the figures' upward y axis.
- `printed_sections_4_5.py` indexes from 1 like the paper (x_0 = 0 is the pivot);
  `linearization.py` indexes from 0.
- Identities are decided at 50 significant digits on random points with unequal values.
