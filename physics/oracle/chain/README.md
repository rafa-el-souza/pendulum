# Chain pendulum through constraint forces

An independent route to the dynamics of a planar chain pendulum with $n$ point
masses: Newton's second law for every mass, with the rod tensions as unknown
forces, plus the rigid-rod constraints. No Lagrangian, no generalized-coordinate
equations of motion and no mass matrix appear anywhere in the code or in the
tests, so the angular accelerations computed here can be used to check such
equations from the outside.

| file | what it is |
|---|---|
| `chain.py` | the $O(n)$ solver: `accelerations`, `tensions`, `solve` (both at once), `energy` |
| `dense.py` | the same Newton problem as one dense KKT system, solved by LU; a cross-check for algebra slips |
| `highprec.py` | the tension system at arbitrary precision with mpmath, for measuring rounding error |
| `test_chain.py` | the tests (pytest, about 10 s) |
| `accuracy.py` | the accuracy and cost study behind the last section (about 20 s) |

All functions take float64 arrays `theta`, `omega`, `m`, `l` of shape `(n,)` and a
float `g`, and return numpy arrays (`energy` returns a float).

## The system

The plane has $x$ to the right and $y$ up, and gravity is $\mathbf g = (0, -g)$.
A fixed pivot sits at the origin. Rod $i$ ($i = 1..n$) is massless and rigid, has
length $l_i$, and joins mass $i-1$ to mass $i$; "mass 0" is the pivot. The joints are
free hinges, and there is no friction and there are no collisions. $\theta_i$ is the
absolute angle of rod $i$ from the downward vertical:

$$x_i = \sum_{k \le i} l_k \sin\theta_k, \qquad y_i = -\sum_{k \le i} l_k \cos\theta_k .$$

Write $\mathbf e_i = (\sin\theta_i, -\cos\theta_i)$ for the unit vector from mass $i-1$
to mass $i$, and $\mathbf n_i = (\cos\theta_i, \sin\theta_i) = d\mathbf e_i / d\theta_i$
for its normal. Their products are

$$\mathbf e_i \cdot \mathbf e_j = \cos(\theta_j - \theta_i), \qquad \mathbf n_i \cdot \mathbf e_j = \sin(\theta_j - \theta_i), \qquad \mathbf n_i \cdot \mathbf e_i = 0 .$$

For the joint between rods $i$ and $i+1$, write
$c_i = \cos(\theta_{i+1} - \theta_i)$ and $s_i = \sin(\theta_{i+1} - \theta_i)$.

## Derivation

**Unknowns.** The unknowns are the Cartesian accelerations $\mathbf a_i$ of the
masses ($2n$ numbers) and the rod tensions $T_i$ ($n$ numbers). A positive tension
pulls the two ends of its rod together: rod $i$ pushes mass $i$ with
$-T_i \mathbf e_i$ and mass $i-1$ with $+T_i \mathbf e_i$. The pivot takes whatever
rod 1 puts on it and does not move, so $\mathbf a_0 = 0$.

**Newton's second law, mass by mass.** With $T_{n+1} = 0$,

$$m_i \mathbf a_i = m_i \mathbf g - T_i \mathbf e_i + T_{i+1} \mathbf e_{i+1}, \qquad i = 1..n .$$

**The constraints, differentiated twice.** Each rod keeps its length,
$|\mathbf r_i - \mathbf r_{i-1}|^2 = l_i^2$ with $\mathbf r_0 = 0$. Differentiating
twice in time gives

$$(\mathbf r_i - \mathbf r_{i-1}) \cdot (\mathbf a_i - \mathbf a_{i-1}) + |\mathbf v_i - \mathbf v_{i-1}|^2 = 0 .$$

Since $\mathbf r_i - \mathbf r_{i-1} = l_i \mathbf e_i$ and
$\mathbf v_i - \mathbf v_{i-1} = l_i \omega_i \mathbf n_i$, this reads

$$\mathbf e_i \cdot (\mathbf a_i - \mathbf a_{i-1}) = -l_i \omega_i^2 .$$

**The banded tension system.** Substituting Newton's law into the constraint
of rod $i$ couples $T_i$ only to $T_{i-1}$ and $T_{i+1}$. For $i \ge 2$ gravity
cancels in $\mathbf a_i - \mathbf a_{i-1}$. For $i = 1$ the pivot does not
accelerate, and $\mathbf e_1 \cdot \mathbf g = g \cos\theta_1$ is left over. With
$1/m_0 := 0$ and $T_0 = T_{n+1} = 0$ the result is

$$\Big(\frac{1}{m_{i-1}} + \frac{1}{m_i}\Big) T_i - \frac{c_{i-1}}{m_{i-1}} T_{i-1} - \frac{c_i}{m_i} T_{i+1} = l_i \omega_i^2 + \delta_{i1}\, g \cos\theta_1, \qquad i = 1..n,$$

that is, $A T = b$ with $A$ symmetric tridiagonal:

$$A_{ii} = \frac{1}{m_{i-1}} + \frac{1}{m_i} \;\; (A_{11} = 1/m_1), \qquad A_{i,i+1} = A_{i+1,i} = -\frac{c_i}{m_i}, \qquad b_i = l_i \omega_i^2 + \delta_{i1}\, g \cos\theta_1 .$$

$A = J M^{-1} J^{\mathsf T}$, where $J$ is the $n \times 2n$ constraint Jacobian with
unit-vector rows ($\mathbf e_i^{\mathsf T}$ at mass $i$, $-\mathbf e_i^{\mathsf T}$ at
mass $i-1$) and $M = \mathrm{diag}(m_i I_2)$. $J$ has full row rank in every
configuration: $J^{\mathsf T}\lambda = 0$ forces $\lambda_n \mathbf e_n = 0$ at the
last mass, then $\lambda_{n-1} = 0$, and so on up the chain. So $A$ is symmetric
positive definite for every state, the tensions always exist and are unique, and
elimination needs no pivoting.

**$O(n)$ elimination.** `chain.py` factors $A = L D L^{\mathsf T}$ from the top
rod down, with pivots $p_i = (1 + \kappa_i)/m_i$:

$$\kappa_1 = 0, \qquad \kappa_{i+1} = \frac{m_{i+1}}{m_i}\,\frac{s_i^2 + \kappa_i}{1 + \kappa_i},$$

$$y_1 = b_1, \qquad y_{i+1} = b_{i+1} + \frac{c_i}{1 + \kappa_i}\, y_i,$$

$$T_n = \frac{m_n\, y_n}{1 + \kappa_n}, \qquad T_i = \frac{m_i\, y_i + c_i\, T_{i+1}}{1 + \kappa_i} .$$

The pivot recurrence is the usual
$p_{i+1} = A_{i+1,i+1} - A_{i,i+1}^2 / p_i$ rewritten. Substituting $p_i = (1+\kappa_i)/m_i$
gives

$$\frac{1}{m_i} - \frac{c_i^2}{m_i (1 + \kappa_i)} = \frac{s_i^2 + \kappa_i}{m_i (1 + \kappa_i)},$$

which adds only non-negative numbers. The usual form subtracts nearly equal
numbers when a joint is nearly straight or a light mass sits above a heavy one.
For a straight chain ($s_i = 0$), $\kappa_i = 0$ throughout.

The joint angles enter only through $s_i$ and $c_i$. The float64 difference
$\theta_{i+1} - \theta_i$ is exact near $0$ (Sterbenz) but rounded near $\pm\pi$
and for large angles. That would leave $s_i$ of a nearly folded joint with an
absolute rather than a relative error, which extreme mass ratios amplify (see
the last section). So `chain.py` carries the difference as an exact sum
$h + \ell$ (Knuth's TwoSum) and uses $\sin h + \ell \cos h$ and $\cos h - \ell \sin h$.

**Recovering $\alpha$.** Differentiating $\mathbf r_i - \mathbf r_{i-1} = l_i \mathbf e_i$
twice gives $\mathbf a_i - \mathbf a_{i-1} = l_i \alpha_i \mathbf n_i - l_i \omega_i^2 \mathbf e_i$,
so $\alpha_i$ is the normal component of the relative acceleration:

$$\alpha_i = \frac{\mathbf n_i \cdot (\mathbf a_i - \mathbf a_{i-1})}{l_i} .$$

Put Newton's accelerations into this. Rod $i$ has no component along $\mathbf n_i$
at either end. For $i \ge 2$ gravity accelerates both ends alike. For $i = 1$ the
pivot does not move, and $\mathbf n_1 \cdot \mathbf g = -g \sin\theta_1$ is left over.
What remains is

$$l_i\, \alpha_i = \frac{s_i}{m_i}\, T_{i+1} - \frac{s_{i-1}}{m_{i-1}}\, T_{i-1} - \delta_{i1}\, g \sin\theta_1,$$

where the first term is absent for $i = n$ and the second for $i = 1$. The
$\mathbf e_i$ component of the same relative acceleration is the constraint
again. For $n = 1$ this gives $\alpha_1 = -(g/l_1)\sin\theta_1$ and
$T_1 = m_1 (l_1 \omega_1^2 + g \cos\theta_1)$.

**Energy.** $E = \sum_i \tfrac12 m_i |\mathbf v_i|^2 + m_i g\, y_i$, with
$\mathbf v_i = \sum_{k \le i} l_k \omega_k \mathbf n_k$. The potential is zero at the
height of the pivot.

## The two other solvers

`dense.py` builds the positions $\mathbf r_i$ and velocities $\mathbf v_i$ by summing
rod vectors. It takes the constraints as
$\phi_j = (|\mathbf r_j - \mathbf r_{j-1}|^2 - l_j^2)/2$, whose Jacobian rows are
$\pm(\mathbf r_j - \mathbf r_{j-1})$ taken from those positions, and solves the
$3n \times 3n$ saddle-point system

$$\begin{pmatrix} M & J^{\mathsf T} \\ J & 0 \end{pmatrix} \begin{pmatrix} \mathbf a \\ \mu \end{pmatrix} = \begin{pmatrix} \mathbf f \\ -\big(|\mathbf v_j - \mathbf v_{j-1}|^2\big)_j \end{pmatrix}$$

with `numpy.linalg.solve` (LU with partial pivoting). Here $\mathbf f$ is the
gravity force. It reads $T_j = \mu_j |\mathbf r_j - \mathbf r_{j-1}|$ and
$\alpha_j = \big((\mathbf r_j - \mathbf r_{j-1}) \times (\mathbf a_j - \mathbf a_{j-1})\big) / |\mathbf r_j - \mathbf r_{j-1}|^2$.
It shares no code and no intermediate quantity with `chain.py`. It costs $O(n^3)$
and is meant for $n$ up to a few hundred.

`highprec.py` solves $A T = b$ in its plain form, without $\kappa$, at `dps`
decimal digits. It takes $c_i$ as $\mathbf e_i \cdot \mathbf e_{i+1}$ from absolute
sines and cosines, and reads $\alpha$ from the full Cartesian Newton accelerations
through the cross product. It treats the float64 inputs as exact binary numbers and
costs $O(n)$, so it measures the rounding error of the float64 solvers at any $n$.
`solve_mp` returns mpmath numbers, which can be used to check a closed-form
equation of motion far below float64 rounding; `solve_float` rounds them to float64.

## What the tests establish

Below, eps $= 2^{-52} \approx 2.2 \cdot 10^{-16}$. Random states have unequal masses
log-uniform in $[0.1, 10]$, lengths in $[0.2, 5]$ and $g \in [1, 20]$. Their angles
are small ($\sigma = 0.2$), large (uniform in $[-\pi, \pi]$) or many turns (uniform in
$[-6\pi, 6\pi]$). Their speeds are at rest, moderate ($\omega_i \sim \sqrt{g/l_i}$) or
fast ($10\sqrt{g/l_i}$, so centripetal terms are about 100 times gravity). All seeds
are fixed.

- **Single rod**: `chain.py` matches the elementary pendulum,
  $\alpha = -(g/l)\sin\theta$ and $T = m(l\omega^2 + g\cos\theta)$, to 4 eps.
- **Hanging rest state** ($n$ up to 1000): $\alpha = 0$ exactly and
  $T_i = g\sum_{k \ge i} m_k$ to $4n$ eps.
- **Collinear chains** ($n$ up to 100 000), straight or folded back at random
  joints, with arbitrary $\omega$. All rod forces are parallel to $\mathbf e_1$, so
  Newton's law alone gives $\alpha_1 = -(g/l_1)\sin\theta_1$, $\alpha_{k \ge 2} = 0$ and
  $\sigma_i T_i = \sum_{j \ge i} m_j (g\cos\theta_1 + \sum_{k \le j} \sigma_k l_k \omega_k^2)$
  with $\sigma_k = \mathbf e_k \cdot \mathbf e_1 = \pm 1$. This closed form holds for
  every $n$ and is not a special case of the code. The $n = 100\,000$ case runs in
  about 0.06 s, which a dense method could not do in memory.
- **`dense.py`** agrees on random states for $n \in \{1, 2, 3, 5, 8, 16, 64, 256\}$,
  in all nine angle and speed regimes, to $10^{-11}$ of the angular scale
  $\max|\alpha| + \max(\omega_i^2 + g/l_i)$ and of $\max|T|$. Measured: $6 \cdot 10^{-14}$
  and $4 \cdot 10^{-14}$, almost all of it `dense.py`'s own rounding.
- **`highprec.py`** at 40 to 80 digits agrees to a normwise relative error below
  $10^{-13}$ for $\alpha$ and $T$. This covers random states for every $n$ above
  (measured: $1.8 \cdot 10^{-15}$ and $8 \cdot 10^{-16}$), chains of 4096 equal
  masses (nearly straight hanging, nearly straight inverted, smooth swinging),
  masses spread over 12 and 24 orders of magnitude, a nearly folded joint between
  masses $10^{-10}$ and $10^{10}$, and angles of magnitude up to $10^9$ rad.
- **Newton's law for every mass** ($n$ up to 1024) uses the accelerations that the
  returned $\alpha$ implies through the kinematics,
  $\mathbf a_i = \sum_{k \le i} l_k(\alpha_k \mathbf n_k - \omega_k^2 \mathbf e_k)$, and the
  returned $T$. Then $m_i \mathbf a_i - m_i \mathbf g + T_i \mathbf e_i - T_{i+1} \mathbf e_{i+1}$
  vanishes to 64 eps of the sum of the magnitudes of its terms (measured: a few
  eps). These $2n$ equations in $2n$ unknowns have a single solution, so this check
  alone fixes both $\alpha$ and $T$.
- **The constraints**: with Newton's accelerations from the returned $T$,
  $\tfrac12\, d^2|\mathbf r_i - \mathbf r_{i-1}|^2/dt^2$ vanishes to 128 eps of its terms,
  and $\alpha_i = \mathbf n_i \cdot (\mathbf a_i - \mathbf a_{i-1})/l_i$ holds.
- **Instantaneous power balance**:
  $dE/dt = \sum_i \mathbf v_i \cdot (m_i \mathbf a_i - m_i \mathbf g) = 0$ with the
  kinematic $\mathbf a_i$, at one instant and with no integration, to 64 eps of its
  terms (measured: below 1 eps).
- **`energy` along the flow**: a fourth-order central difference of `energy` along
  $(\omega, \alpha)$ vanishes to $10^{-8}$ of its two parts, which do not vanish
  (measured: $1.3 \cdot 10^{-10}$).
- **Energy along trajectories**: ten seconds of chaotic motion, integrated by
  `solve_ivp` (DOP853) for $n \in \{2, 3, 5, 8\}$ at rtol = atol $= 10^{-6}$,
  $10^{-9}$ and $10^{-12}$. The relative energy drift stays within 100 times the
  tolerance and shrinks at least thirtyfold per step (measured: 0.6 to 18 times the
  tolerance, shrinking 120- to 10 000-fold).
- **Symmetries** ($n$ up to 64):
  - mirror $(\theta, \omega) \to (-\theta, -\omega)$ gives $-\alpha$ and the same $T$
    (bit for bit, in practice);
  - time reversal $\omega \to -\omega$ leaves $\alpha$ and $T$ unchanged;
  - scaling all masses by $c$ leaves $\alpha$ unchanged and multiplies $T$ by $c$;
  - scaling all lengths and $g$ by $c$ leaves $\alpha$ unchanged and multiplies $T$
    by $c$;
  - $(\omega, g) \to (s\omega, s^2 g)$ multiplies $\alpha$ and $T$ by $s^2$;
  - whole turns added to any angle change nothing.

  Each holds to 64 eps, or to the rounding of $\theta + 2\pi k$ itself.
- **`energy`** matches $\tfrac12 m l^2 \omega^2 - m g l \cos\theta$ for one rod, and a
  mass-by-mass walk down the chain for several.
- **Interface**: lists are accepted, inputs are never modified, and malformed input
  (wrong shapes, $n = 0$, non-positive masses or lengths, non-finite values) raises
  `ValueError`.

## Accuracy and limits (from `accuracy.py`)

Errors are measured against `highprec.py`, taking the float64 inputs as exact.

- **Normwise**: $\max_i|\Delta\alpha_i| / \max_i|\alpha_i|$ and the same for $T$
  were at most $2.1 \cdot 10^{-14}$ in every regime tried. These were random states
  for $n$ from 1 to 16 384; long equal-mass chains (nearly straight hanging,
  inverted, smooth swinging); masses spread over up to 24 orders of magnitude;
  $\omega$ up to $10^6\sqrt{g/l}$; angles up to $10^9$ rad; and 3000 adversarial
  chains with $n \le 6$, masses over 24 decades, lengths over 6, and straight,
  nearly straight and nearly folded joints.
- **Componentwise**: a single $\alpha_i$ can be much smaller than the two terms
  it is the difference of, and its relative error then grows. In a smooth swinging
  chain of 16 384 rods, the worst relative error of an $\alpha_i$ above $10^{-8}$ of
  the largest is $9 \cdot 10^{-10}$. Measured against the magnitude of its own
  terms, every error stays below $2.5 \cdot 10^{-13}$.
- **Rounding the joint difference instead of carrying it exactly**:
  - on the adversarial chains the worst normwise error was $2 \cdot 10^{-2}$ and
    the 99th percentile $9 \cdot 10^{-8}$;
  - at angles near $10^6$ rad the error was about $10^{-10}$, and near $10^9$ rad
    about $5 \cdot 10^{-7}$.

  This is the one regime where a straightforward implementation loses accuracy.
- **`dense.py`** is less accurate when centripetal terms dominate (normwise
  $2 \cdot 10^{-12}$ for one rod at $\omega \sim 30\sqrt{g/l}$). Its cross product
  then takes a small $\alpha$ out of a large acceleration.
- **Cost**: one call costs about $26\,\mu$s at $n = 10$, 0.5 ms at $n = 1000$,
  0.06 s at $n = 10^5$ and 0.6 s at $n = 10^6$. The cost is linear in $n$; the
  sweep is a plain Python loop.

## Running

From `physics/oracle`:

```
uv run --no-sync pytest chain -q
uv run --no-sync python chain/accuracy.py
```
