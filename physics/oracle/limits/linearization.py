"""First-principles small-oscillation model of the planar pendulum of n point masses.

Built from the Lagrangian alone, without the paper's general formula (38), so that sections 4
and 5 of the paper can be checked against something that does not depend on (38).

Model (the paper's Figure 4): a fixed pivot, massless rigid rods of lengths l_1..l_n, rod a at
the angle theta_a from the downward vertical, the point mass m_i at the lower end of rod i.
With x to the right and y up,

    x_i = sum_{a<=i} l_a sin(theta_a),        y_i = -sum_{a<=i} l_a cos(theta_a),
    T = 1/2 sum_{a,b} l_a l_b mu_max(a,b) cos(theta_a - theta_b) thetadot_a thetadot_b,
    U = sum_i m_i g y_i = -g sum_a l_a mu_a cos(theta_a),

where mu_a = m_a + ... + m_n is the mass that rod a carries. The rest state theta = 0 is an
equilibrium, so the consistent linearization is M theta'' + K theta = 0 with

    M_ab = l_a l_b mu_max(a,b)        (kinetic matrix at rest),
    K_ab = delta_ab g l_a mu_a        (Hessian of U at rest).

In the horizontal displacements (x_0 = 0 at the pivot; theta_a = (x_a - x_{a-1}) / l_a at
linear order) the same quadratic Lagrangian reads 1/2 sum_i m_i xdot_i^2 - 1/2 sum_a g mu_a
(x_a - x_{a-1})^2 / l_a: a diagonal mass matrix and a tridiagonal stiffness whose rod-a entry
is the rod's tension g mu_a over its length.

The closed forms above are checked against sympy's own differentiation of T and U, built from
the positions, in ``test_sections_4_5.py``.

Index convention: sequences here are 0-based (``masses[0]`` is m_1). Arithmetic is generic so
that mpmath numbers pass through at full precision; the eigenvalue routines use numpy.
"""

import math

import numpy as np
import sympy
from scipy.linalg import eigh


def hanging_masses(masses):
    """mu_a = m_a + ... + m_n, the mass hanging from rod a (0-based)."""
    mu = [None] * len(masses)
    total = 0
    for a in range(len(masses) - 1, -1, -1):
        total = total + masses[a]
        mu[a] = total
    return mu


def theta_mass_matrix(masses, lengths):
    """Kinetic matrix at rest in the angles: M_ab = l_a l_b mu_max(a,b)."""
    mu = hanging_masses(masses)
    n = len(masses)
    return [[lengths[a] * lengths[b] * mu[max(a, b)] for b in range(n)] for a in range(n)]


def theta_stiffness_matrix(masses, lengths, g):
    """Hessian of the potential at rest in the angles: diagonal, g l_a mu_a."""
    mu = hanging_masses(masses)
    n = len(masses)
    zero = 0 * g
    return [[g * lengths[a] * mu[a] if a == b else zero for b in range(n)] for a in range(n)]


def x_mass_matrix(masses):
    """Kinetic matrix at rest in the horizontal displacements: diag(m_i)."""
    n = len(masses)
    zero = 0 * masses[0]
    return [[masses[a] if a == b else zero for b in range(n)] for a in range(n)]


def x_stiffness_matrix(masses, lengths, g):
    """Hessian of 1/2 sum_a (g mu_a / l_a)(x_a - x_{a-1})^2, the potential at quadratic order."""
    mu = hanging_masses(masses)
    n = len(masses)
    zero = 0 * g
    stiffness = [[zero] * n for _ in range(n)]
    for a in range(n):
        spring = g * mu[a] / lengths[a]
        stiffness[a][a] = stiffness[a][a] + spring
        if a > 0:
            stiffness[a - 1][a - 1] = stiffness[a - 1][a - 1] + spring
            stiffness[a][a - 1] = stiffness[a][a - 1] - spring
            stiffness[a - 1][a] = stiffness[a - 1][a] - spring
    return stiffness


def difference_matrix(lengths):
    """D with theta = D x at linear order: theta_a = (x_a - x_{a-1}) / l_a, x_{-1} = pivot = 0."""
    n = len(lengths)
    zero = 0 * lengths[0]
    d = [[zero] * n for _ in range(n)]
    for a in range(n):
        d[a][a] = 1 / lengths[a]
        if a > 0:
            d[a][a - 1] = -1 / lengths[a]
    return d


def matvec(matrix, vector):
    return [sum((row[b] * vector[b] for b in range(len(vector))), 0 * vector[0]) for row in matrix]


def matmul(left, right):
    inner = len(right)
    return [
        [
            sum((left[a][c] * right[c][b] for c in range(inner)), 0 * left[a][0])
            for b in range(len(right[0]))
        ]
        for a in range(len(left))
    ]


def transpose(matrix):
    return [list(column) for column in zip(*matrix)]


def exact_residual(theta, dtheta, ddtheta, masses, lengths, g, sin=math.sin, cos=math.cos):
    """d/dt dL/dthetadot_j - dL/dtheta_j of the full nonlinear chain, for every j.

    Derived by hand from T and U above:
    sum_k l_j l_k mu_max(j,k) [cos(theta_j - theta_k) theta''_k + sin(theta_j - theta_k)
    thetadot_k^2] + g l_j mu_j sin(theta_j). The test file checks it against sympy's
    Euler-Lagrange equations of T - U.
    """
    mu = hanging_masses(masses)
    n = len(masses)
    out = []
    for j in range(n):
        total = g * lengths[j] * mu[j] * sin(theta[j])
        for k in range(n):
            coupling = lengths[j] * lengths[k] * mu[max(j, k)]
            diff = theta[j] - theta[k]
            total = total + coupling * (cos(diff) * ddtheta[k] + sin(diff) * dtheta[k] ** 2)
        out.append(total)
    return out


def linear_residual(theta, ddtheta, masses, lengths, g):
    """(M theta'' + K theta)_j, the consistently linearized equations of motion."""
    inertia = matvec(theta_mass_matrix(masses, lengths), ddtheta)
    restoring = matvec(theta_stiffness_matrix(masses, lengths, g), theta)
    return [inertia[j] + restoring[j] for j in range(len(masses))]


def x_linear_residual(x, xddot, masses, lengths, g):
    """(M_x x'' + K_x x)_j, the same linear system in horizontal displacements (x_0 excluded)."""
    inertia = matvec(x_mass_matrix(masses), xddot)
    restoring = matvec(x_stiffness_matrix(masses, lengths, g), x)
    return [inertia[j] + restoring[j] for j in range(len(masses))]


# --- symbolic ground truth -------------------------------------------------------------------


def symbolic_chain(n):
    """T and U of the n-mass chain built from the positions, with sympy (no hand algebra)."""
    t = sympy.Symbol("t", real=True)
    angles = [sympy.Function(f"theta{a + 1}", real=True)(t) for a in range(n)]
    masses = sympy.symbols(f"m1:{n + 1}", positive=True)
    lengths = sympy.symbols(f"l1:{n + 1}", positive=True)
    g = sympy.Symbol("g", positive=True)
    xs, ys = [], []
    x_pos, y_pos = sympy.Integer(0), sympy.Integer(0)
    for a in range(n):
        x_pos = x_pos + lengths[a] * sympy.sin(angles[a])
        y_pos = y_pos - lengths[a] * sympy.cos(angles[a])
        xs.append(x_pos)
        ys.append(y_pos)
    kinetic = (
        sum(masses[i] * (sympy.diff(xs[i], t) ** 2 + sympy.diff(ys[i], t) ** 2) for i in range(n))
        / 2
    )
    potential = sum(masses[i] * g * ys[i] for i in range(n))
    return {
        "t": t,
        "angles": angles,
        "masses": masses,
        "lengths": lengths,
        "g": g,
        "T": kinetic,
        "U": potential,
    }


def _plain_symbols(n):
    q = sympy.symbols(f"q1:{n + 1}", real=True)
    qd = sympy.symbols(f"qd1:{n + 1}", real=True)
    qdd = sympy.symbols(f"qdd1:{n + 1}", real=True)
    return q, qd, qdd


def _to_plain(expr, chain, q, qd, qdd):
    t = chain["t"]
    # Highest derivatives first, or the substitution of theta(t) would mangle them.
    second = {sympy.diff(a, t, 2): qdd[i] for i, a in enumerate(chain["angles"])}
    first = {sympy.diff(a, t): qd[i] for i, a in enumerate(chain["angles"])}
    zeroth = {a: q[i] for i, a in enumerate(chain["angles"])}
    return expr.subs(second).subs(first).subs(zeroth)


def symbolic_euler_lagrange(n):
    """Exact Euler-Lagrange expressions d/dt dL/dthetadot_j - dL/dtheta_j in plain symbols."""
    chain = symbolic_chain(n)
    t = chain["t"]
    lagrangian = chain["T"] - chain["U"]
    q, qd, qdd = _plain_symbols(n)
    equations = []
    for a in chain["angles"]:
        momentum = sympy.diff(lagrangian, sympy.diff(a, t))
        expr = sympy.diff(momentum, t) - sympy.diff(lagrangian, a)
        equations.append(_to_plain(expr, chain, q, qd, qdd))
    return chain, (q, qd, qdd), equations


def symbolic_quadratic_matrices(n):
    """M and K as Hessians of T (in the rates) and U (in the angles) at the rest state."""
    chain = symbolic_chain(n)
    q, qd, qdd = _plain_symbols(n)
    kinetic = _to_plain(chain["T"], chain, q, qd, qdd)
    potential = _to_plain(chain["U"], chain, q, qd, qdd)
    rest = {qi: 0 for qi in q}
    mass = sympy.Matrix(n, n, lambda a, b: sympy.diff(kinetic, qd[a], qd[b]).subs(rest))
    stiffness = sympy.Matrix(n, n, lambda a, b: sympy.diff(potential, q[a], q[b]).subs(rest))
    return chain, mass.applyfunc(sympy.simplify), stiffness.applyfunc(sympy.simplify)


# --- normal modes ----------------------------------------------------------------------------


def normal_modes(masses, lengths, g, count):
    """Lowest ``count`` angular frequencies and x-mode shapes of the linearized chain.

    Solved as the generalized symmetric problem K_x v = omega^2 M_x v (well conditioned, unlike
    the dense angle form whose condition number grows like n^2). Columns of the returned array
    are M_x-orthonormal.
    """
    stiffness = np.array(x_stiffness_matrix(list(masses), list(lengths), g), dtype=float)
    mass = np.array(x_mass_matrix(list(masses)), dtype=float)
    count = min(count, len(masses))
    eigenvalues, vectors = eigh(stiffness, mass, subset_by_index=[0, count - 1])
    return np.sqrt(eigenvalues), vectors


def normal_frequencies_theta(masses, lengths, g, count):
    """Same frequencies from the angle form K_theta v = omega^2 M_theta v (a cross-check)."""
    mu = np.cumsum(np.asarray(masses, dtype=float)[::-1])[::-1]
    ell = np.asarray(lengths, dtype=float)
    index = np.arange(len(ell))
    mass = np.outer(ell, ell) * mu[np.maximum.outer(index, index)]
    stiffness = np.diag(g * ell * mu)
    count = min(count, len(ell))
    eigenvalues = eigh(stiffness, mass, subset_by_index=[0, count - 1], eigvals_only=True)
    return np.sqrt(eigenvalues)


def uniform_chain(total_mass, total_length, count):
    """Masses and lengths of the paper's section-5 chain: n equal masses M/n on rods L/n."""
    return [total_mass / count] * count, [total_length / count] * count
