"""Arbitrary-precision reference for the chain pendulum, with mpmath.

Solves the tridiagonal tension system of README.md in its plain form (diagonal
1/m_{i-1} + 1/m_i, off-diagonal -cos(theta_{i+1} - theta_i)/m_i, no rescaled
pivots) by Gaussian elimination at ``dps`` decimal digits, then recovers alpha
from the full Cartesian accelerations given by Newton's law.  It shares the
system's entries with chain.py but neither its elimination nor its recovery of
alpha, and it costs O(n) operations, so it measures the rounding error of
chain.py and dense.py at any n.

Every input number is converted exactly (a float64 is a binary fraction), so the
result is the exact answer for the state handed in, to about ``dps`` digits
less what the conditioning of the system takes away.
"""

from collections.abc import Sequence

import mpmath
import numpy as np
from numpy.typing import NDArray

__all__ = ["solve_float", "solve_mp"]


def solve_mp(
    theta: Sequence,
    omega: Sequence,
    m: Sequence,
    l: Sequence,
    g: object,
    dps: int = 50,
) -> tuple[list, list]:
    """Return ``(alpha, tension)`` as lists of mpmath numbers at ``dps`` digits.

    Accepts floats, numpy floats, integers, strings or mpmath numbers.  Uses a
    private mpmath context, so the global ``mpmath.mp`` precision is untouched.
    """
    ctx = mpmath.MPContext()
    ctx.dps = dps
    th = [ctx.mpf(x) for x in theta]
    om = [ctx.mpf(x) for x in omega]
    mass = [ctx.mpf(x) for x in m]
    length = [ctx.mpf(x) for x in l]
    grav = ctx.mpf(g)
    n = len(th)
    if not (len(om) == len(mass) == len(length) == n >= 1):
        raise ValueError("theta, omega, m and l must have the same length n >= 1")

    unit = [(ctx.sin(t), -ctx.cos(t)) for t in th]
    inverse_mass = [1 / x for x in mass]

    diag = [inverse_mass[0]] + [inverse_mass[i - 1] + inverse_mass[i] for i in range(1, n)]
    off = [
        -(unit[i][0] * unit[i + 1][0] + unit[i][1] * unit[i + 1][1]) * inverse_mass[i]
        for i in range(n - 1)
    ]
    rhs = [length[i] * om[i] ** 2 for i in range(n)]
    rhs[0] += -grav * unit[0][1]

    # Plain Gaussian elimination without pivoting: the matrix is symmetric
    # positive definite, and at this precision cancellation does not matter.
    pivot = list(diag)
    for i in range(1, n):
        w = off[i - 1] / pivot[i - 1]
        pivot[i] -= w * off[i - 1]
        rhs[i] -= w * rhs[i - 1]
    tension = [ctx.mpf(0)] * n
    tension[-1] = rhs[-1] / pivot[-1]
    for i in range(n - 2, -1, -1):
        tension[i] = (rhs[i] - off[i] * tension[i + 1]) / pivot[i]

    # a_i = (0, -g) + (T_{i+1} e_{i+1} - T_i e_i) / m_i, and alpha_i is the
    # component of a_i - a_{i-1} along the rod normal, divided by l_i.
    accel = []
    for i in range(n):
        fx = -tension[i] * unit[i][0]
        fy = -tension[i] * unit[i][1]
        if i + 1 < n:
            fx += tension[i + 1] * unit[i + 1][0]
            fy += tension[i + 1] * unit[i + 1][1]
        accel.append((fx * inverse_mass[i], fy * inverse_mass[i] - grav))
    alpha = []
    previous = (ctx.mpf(0), ctx.mpf(0))
    for i in range(n):
        dx = accel[i][0] - previous[0]
        dy = accel[i][1] - previous[1]
        alpha.append((unit[i][0] * dy - unit[i][1] * dx) / length[i])
        previous = accel[i]
    return alpha, tension


def solve_float(
    theta: Sequence,
    omega: Sequence,
    m: Sequence,
    l: Sequence,
    g: object,
    dps: int = 50,
) -> tuple[NDArray[np.float64], NDArray[np.float64]]:
    """``solve_mp`` rounded to float64 arrays."""
    alpha, tension = solve_mp(theta, omega, m, l, g, dps)
    return np.array([float(x) for x in alpha]), np.array([float(x) for x in tension])
