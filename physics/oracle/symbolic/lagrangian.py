"""First-principles equations of motion of a planar chain of n point masses.

Only the geometry of the paper's figures is used here, never one of its equations:
the pivot is the origin, x points right and y up, rod i has length l_i and carries
the point mass m_i at its lower end, and theta_i is the angle of rod i from the
downward vertical through its upper end, positive towards +x. Positions follow from
that geometry; velocities, energies and Euler-Lagrange expressions follow by
differentiation alone.

Expressions are returned in plain symbols so that they can be evaluated: theta_i,
omega_i (first time derivative of theta_i), alpha_i (second time derivative),
dtheta_i (the differential of theta_i, an independent symbol), m_i, l_i and g.
Nothing here simplifies; identities are decided numerically in numeric.py.
"""

from __future__ import annotations

import functools
from dataclasses import dataclass

import sympy as sp
from sympy.calculus.euler import euler_equations
from sympy.core.function import AppliedUndef

t = sp.Symbol("t", real=True)
g = sp.Symbol("g", positive=True)


@dataclass(frozen=True, eq=False)
class Symbols:
    """The symbols of an n-mass chain, indexed from 1 as in the paper."""

    n: int
    theta: dict[int, sp.Symbol]
    omega: dict[int, sp.Symbol]
    alpha: dict[int, sp.Symbol]
    dtheta: dict[int, sp.Symbol]
    m: dict[int, sp.Symbol]
    l: dict[int, sp.Symbol]

    def all(self) -> list[sp.Symbol]:
        groups = (self.theta, self.omega, self.alpha, self.dtheta, self.m, self.l)
        return [group[i] for group in groups for i in range(1, self.n + 1)] + [g]


@functools.cache
def symbols(n: int) -> Symbols:
    # Same names and assumptions give the same SymPy symbols, so the chain of n
    # masses shares its symbols with every longer chain.
    idx = range(1, n + 1)
    return Symbols(
        n=n,
        theta={i: sp.Symbol(f"theta{i}", real=True) for i in idx},
        omega={i: sp.Symbol(f"omega{i}", real=True) for i in idx},
        alpha={i: sp.Symbol(f"alpha{i}", real=True) for i in idx},
        dtheta={i: sp.Symbol(f"dtheta{i}", real=True) for i in idx},
        m={i: sp.Symbol(f"m{i}", positive=True) for i in idx},
        l={i: sp.Symbol(f"l{i}", positive=True) for i in idx},
    )


@functools.cache
def _angle_functions(n: int) -> dict[int, sp.Expr]:
    return {i: sp.Function(f"theta{i}")(t) for i in range(1, n + 1)}


def _to_time(expr: sp.Expr, n: int) -> sp.Expr:
    s, f = symbols(n), _angle_functions(n)
    return expr.xreplace({s.theta[i]: f[i] for i in s.theta})


def _to_plain(expr: sp.Expr, n: int) -> sp.Expr:
    s, f = symbols(n), _angle_functions(n)
    replacements = {}
    for i in range(1, n + 1):
        # xreplace works top-down, so the second derivative is caught whole before
        # its inner first derivative or function could be matched.
        replacements[f[i].diff(t, 2)] = s.alpha[i]
        replacements[f[i].diff(t)] = s.omega[i]
        replacements[f[i]] = s.theta[i]
    plain = expr.xreplace(replacements)
    leftover = plain.atoms(sp.Derivative) | plain.atoms(AppliedUndef)
    if leftover:
        raise ValueError(f"time-dependent terms left after substitution: {leftover}")
    return plain


def _check_chain(expr: sp.Expr, n: int) -> None:
    stray = sp.sympify(expr).free_symbols - set(symbols(n).all())
    if stray:
        raise ValueError(f"symbols outside the {n}-mass chain: {sorted(map(str, stray))}")


# Geometry and energies


@functools.cache
def positions(n: int) -> dict[int, tuple[sp.Expr, sp.Expr]]:
    """(x_i, y_i) of every mass, built rod by rod from the pivot."""
    s = symbols(n)
    x = y = sp.Integer(0)
    out = {}
    for i in range(1, n + 1):
        # The downward vertical (0, -1) turned by theta_i towards +x is (sin, -cos).
        x = x + s.l[i] * sp.sin(s.theta[i])
        y = y - s.l[i] * sp.cos(s.theta[i])
        out[i] = (x, y)
    return out


@functools.cache
def velocities(n: int) -> dict[int, tuple[sp.Expr, sp.Expr]]:
    """(dx_i/dt, dy_i/dt) of every mass, by differentiating the positions in time."""
    return {
        i: tuple(_to_plain(sp.diff(_to_time(c, n), t), n) for c in xy)
        for i, xy in positions(n).items()
    }


@functools.cache
def differentials(n: int) -> dict[int, tuple[sp.Expr, sp.Expr]]:
    """(dx_i, dy_i) as linear forms in the independent differentials dtheta_k."""
    s = symbols(n)
    return {
        i: tuple(sp.Add(*[c.diff(s.theta[k]) * s.dtheta[k] for k in range(1, n + 1)]) for c in xy)
        for i, xy in positions(n).items()
    }


@functools.cache
def kinetic_energies(n: int) -> dict[int, sp.Expr]:
    s = symbols(n)
    return {
        i: sp.Rational(1, 2) * s.m[i] * (vx**2 + vy**2) for i, (vx, vy) in velocities(n).items()
    }


@functools.cache
def potential_energies(n: int) -> dict[int, sp.Expr]:
    s = symbols(n)
    return {i: s.m[i] * g * y for i, (_, y) in positions(n).items()}


def kinetic(n: int) -> sp.Expr:
    return sp.Add(*kinetic_energies(n).values())


def potential(n: int) -> sp.Expr:
    return sp.Add(*potential_energies(n).values())


def lagrangian(n: int) -> sp.Expr:
    return kinetic(n) - potential(n)


# Euler-Lagrange expressions, d/dt(dL/d omega_j) - dL/d theta_j, by two routes


@functools.cache
def _lagrangian_in_time(n: int) -> sp.Expr:
    s = symbols(n)
    total = sp.Integer(0)
    for i, (x, y) in positions(n).items():
        xt, yt = _to_time(x, n), _to_time(y, n)
        total += sp.Rational(1, 2) * s.m[i] * (xt.diff(t) ** 2 + yt.diff(t) ** 2) - s.m[i] * g * yt
    return total


@functools.cache
def euler_lagrange(n: int) -> dict[int, sp.Expr]:
    """The reference: d/dt(dL/d(dtheta_j/dt)) - dL/dtheta_j for each coordinate j."""
    f = _angle_functions(n)
    lag = _lagrangian_in_time(n)
    out = {}
    for j in range(1, n + 1):
        momentum = lag.diff(f[j].diff(t))
        out[j] = _to_plain(momentum.diff(t) - lag.diff(f[j]), n)
    return out


@functools.cache
def euler_lagrange_by_sympy(n: int) -> dict[int, sp.Expr]:
    """The same expressions through sympy.calculus.euler, a separate implementation."""
    f = _angle_functions(n)
    equations = euler_equations(_lagrangian_in_time(n), [f[i] for i in range(1, n + 1)], t)
    # euler_equations returns dL/dq - d/dt dL/dqdot = 0, the opposite sign.
    return {j: _to_plain(-eq.lhs, n) for j, eq in zip(range(1, n + 1), equations, strict=True)}


def time_derivative(expr: sp.Expr, n: int) -> sp.Expr:
    """d/dt of an expression in theta and omega, by the chain rule along a motion."""
    s = symbols(n)
    _check_chain(expr, n)
    if any(expr.has(a) for a in s.alpha.values()):
        raise ValueError("the chain rule here covers expressions in theta and omega only")
    return sp.Add(
        *[
            expr.diff(s.theta[i]) * s.omega[i] + expr.diff(s.omega[i]) * s.alpha[i]
            for i in range(1, n + 1)
        ]
    )


def euler_lagrange_of(lag: sp.Expr, n: int) -> dict[int, sp.Expr]:
    """Euler-Lagrange expressions of any Lagrangian given in theta and omega."""
    s = symbols(n)
    return {
        j: time_derivative(lag.diff(s.omega[j]), n) - lag.diff(s.theta[j]) for j in range(1, n + 1)
    }


# The pieces the paper groups its terms into


def gravity_term(n: int, j: int) -> sp.Expr:
    """dU/dtheta_j."""
    return potential(n).diff(symbols(n).theta[j])


def velocity_term(n: int, j: int) -> sp.Expr:
    """-dT/dtheta_j."""
    return -kinetic(n).diff(symbols(n).theta[j])


def inertia_term(n: int, j: int) -> sp.Expr:
    """d/dt(dT/d omega_j)."""
    return time_derivative(kinetic(n).diff(symbols(n).omega[j]), n)


@functools.cache
def mass_matrix(n: int) -> dict[tuple[int, int], sp.Expr]:
    """A_jk = d^2 T / d omega_j d omega_k; T is the quadratic form (1/2) omega.A.omega."""
    s, kin = symbols(n), kinetic(n)
    return {
        (j, k): kin.diff(s.omega[j]).diff(s.omega[k])
        for j in range(1, n + 1)
        for k in range(1, n + 1)
    }


@functools.cache
def kinetic_diagonal(n: int) -> sp.Expr:
    """The omega_i^2 part of T, (1/2) sum_i A_ii omega_i^2; the rest is the cross part."""
    s, a = symbols(n), mass_matrix(n)
    return sp.Add(*[sp.Rational(1, 2) * a[i, i] * s.omega[i] ** 2 for i in range(1, n + 1)])


def inertia_diagonal(n: int, j: int) -> sp.Expr:
    return time_derivative(kinetic_diagonal(n).diff(symbols(n).omega[j]), n)


def inertia_off_diagonal(n: int, j: int) -> sp.Expr:
    cross = kinetic(n) - kinetic_diagonal(n)
    return time_derivative(cross.diff(symbols(n).omega[j]), n)


# The compact form established from the above (checked against it in the tests,
# never used as a reference itself)


def tail_mass(n: int, j: int) -> sp.Expr:
    """M_j = m_j + ... + m_n, the mass hanging from rod j."""
    return sp.Add(*[symbols(n).m[i] for i in range(j, n + 1)])


def compact_eom(n: int, j: int) -> sp.Expr:
    r"""\sum_k M_{max(j,k)} l_j l_k [cos(th_j-th_k) alpha_k + sin(th_j-th_k) omega_k^2]
    + g M_j l_j sin(th_j)."""
    s = symbols(n)
    th, w, a, ln = s.theta, s.omega, s.alpha, s.l
    coupling = sp.Add(
        *[
            tail_mass(n, max(j, k))
            * ln[j]
            * ln[k]
            * (sp.cos(th[j] - th[k]) * a[k] + sp.sin(th[j] - th[k]) * w[k] ** 2)
            for k in range(1, n + 1)
        ]
    )
    return coupling + g * tail_mass(n, j) * ln[j] * sp.sin(th[j])


def compact_mass_matrix(n: int) -> dict[tuple[int, int], sp.Expr]:
    s = symbols(n)
    return {
        (j, k): tail_mass(n, max(j, k)) * s.l[j] * s.l[k] * sp.cos(s.theta[j] - s.theta[k])
        for j in range(1, n + 1)
        for k in range(1, n + 1)
    }


def compact_forcing(n: int) -> dict[int, sp.Expr]:
    """b_j in A(theta) alpha = b(theta, omega)."""
    s = symbols(n)
    th, w, ln = s.theta, s.omega, s.l
    return {
        j: -sp.Add(
            *[
                tail_mass(n, max(j, k)) * ln[j] * ln[k] * sp.sin(th[j] - th[k]) * w[k] ** 2
                for k in range(1, n + 1)
            ]
        )
        - g * tail_mass(n, j) * ln[j] * sp.sin(th[j])
        for j in range(1, n + 1)
    }


if __name__ == "__main__":
    for n in (1, 2):
        for j, expr in euler_lagrange(n).items():
            print(f"n={n} j={j}: {expr}")
