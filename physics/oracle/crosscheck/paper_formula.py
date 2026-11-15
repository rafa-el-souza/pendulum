"""The paper's general equations of motion, printed as (38) and (47), for any n.

Equation (38) is one equation per angle: for each j, a sum that must vanish.
It is transcribed here twice. ``residual_38_literal`` follows the print term by
term, loops and all, so that it can be read against the page. ``residual_38``
is the same sum in array form, fast enough for hundreds of masses, and is
tested against the literal one.

Nothing here is simplified by hand: the point of this module is to hold the
formula exactly as the paper states it, so that other routes to the same
physics can be compared against it.

Indices are zero-based here and one-based in the paper; sigma and phi only
compare two indices, so the shift changes nothing.
"""

import math

import numpy as np
from numpy.typing import NDArray

Vector = NDArray[np.float64]


def sigma(j: int, k: int) -> float:
    """The paper's sigma_{jk}: one when j <= k, zero otherwise."""
    return 1.0 if j <= k else 0.0


def phi(j: int, k: int) -> float:
    """The paper's phi_{jk}: zero when j == k, one otherwise."""
    return 0.0 if j == k else 1.0


def residual_38_literal(
    theta: Vector, omega: Vector, alpha: Vector, m: Vector, l: Vector, g: float
) -> Vector:
    """Left-hand side of (38) for every j, summed in the order it is printed."""
    n = len(theta)
    residual = np.zeros(n)
    for j in range(n):
        total = 0.0
        for k in range(n):
            masses = sum(m[q] * sigma(j, q) for q in range(k, n))
            total += g * l[j] * math.sin(theta[j]) * m[k] * sigma(j, k)
            total += m[k] * l[j] ** 2 * alpha[j] * sigma(j, k)
            total += masses * l[j] * l[k] * math.sin(theta[j] - theta[k]) * omega[j] * omega[k]
            total += (
                masses
                * l[j]
                * l[k]
                * (
                    math.sin(theta[k] - theta[j]) * (omega[j] - omega[k]) * omega[k]
                    + phi(j, k) * math.cos(theta[j] - theta[k]) * alpha[k]
                )
            )
        residual[j] = total
    return residual


def residual_38(
    theta: Vector, omega: Vector, alpha: Vector, m: Vector, l: Vector, g: float
) -> Vector:
    """Left-hand side of (38) for every j, in array form."""
    n = len(theta)
    index = np.arange(n)
    below = np.cumsum(m[::-1])[::-1]  # below[i]: the masses at or below rod i
    # sum_{q >= k} m_q sigma_{jq} keeps the q that are >= k and >= j.
    masses = below[np.maximum.outer(index, index)]
    difference = theta[:, None] - theta[None, :]  # theta_j - theta_k
    lengths = np.outer(l, l)
    gravity = g * l * np.sin(theta) * below
    own_inertia = below * l**2 * alpha
    third = masses * lengths * np.sin(difference) * np.outer(omega, omega)
    fourth = (
        masses
        * lengths
        * (
            np.sin(-difference) * (omega[:, None] - omega[None, :]) * omega[None, :]
            + (1.0 - np.eye(n)) * np.cos(difference) * alpha[None, :]
        )
    )
    return gravity + own_inertia + third.sum(axis=1) + fourth.sum(axis=1)


def residual_38_mp(ctx, theta, omega, alpha, m, l, g) -> list:
    """Left-hand side of (38) in an mpmath context, summed in the order it is printed.

    Every argument holds numbers of that context. At fifty digits this tells
    "equal" from "equal up to the rounding of double precision".
    """
    n = len(theta)
    residual = []
    for j in range(n):
        total = ctx.mpf(0)
        for k in range(n):
            masses = sum((m[q] * sigma(j, q) for q in range(k, n)), ctx.mpf(0))
            total += g * l[j] * ctx.sin(theta[j]) * m[k] * sigma(j, k)
            total += m[k] * l[j] ** 2 * alpha[j] * sigma(j, k)
            total += masses * l[j] * l[k] * ctx.sin(theta[j] - theta[k]) * omega[j] * omega[k]
            total += (
                masses
                * l[j]
                * l[k]
                * (
                    ctx.sin(theta[k] - theta[j]) * (omega[j] - omega[k]) * omega[k]
                    + phi(j, k) * ctx.cos(theta[j] - theta[k]) * alpha[k]
                )
            )
        residual.append(total)
    return residual


def accelerations_from_38(theta: Vector, omega: Vector, m: Vector, l: Vector, g: float) -> Vector:
    """The angular accelerations that make (38) hold for every j.

    (38) is affine in the accelerations, so its linear part is read off by
    evaluating it on unit vectors, with no algebra done on the formula.
    """
    n = len(theta)
    constant = residual_38(theta, omega, np.zeros(n), m, l, g)
    linear = np.empty((n, n))
    for k in range(n):
        unit = np.zeros(n)
        unit[k] = 1.0
        linear[:, k] = residual_38(theta, omega, unit, m, l, g) - constant
    return np.linalg.solve(linear, -constant)


def residual_47_literal(
    theta: Vector,
    omega: Vector,
    alpha: Vector,
    m: Vector,
    l: Vector,
    g: float,
    as_printed: bool,
) -> Vector:
    """Left-hand side of (47), the second derivation's formula, for every q.

    (47) is printed with one angular velocity too many in its fourth term:
    ``as_printed`` keeps it, and without it the formula is the corrected one.
    """
    n = len(theta)
    residual = np.zeros(n)
    for q in range(n):
        total = 0.0
        for k in range(q, n):
            total += g * m[k] * l[q] * math.sin(theta[q])
            total += m[k] * l[q] ** 2 * alpha[q]
            for i in range(k + 1):
                extra = omega[q] if as_printed else 1.0
                total += m[k] * l[i] * l[q] * omega[i] * omega[q] * math.sin(theta[q] - theta[i])
                total += (
                    m[k]
                    * l[i]
                    * l[q]
                    * omega[i]
                    * extra
                    * math.sin(theta[i] - theta[q])
                    * (omega[q] - omega[i])
                )
                total += m[k] * l[i] * l[q] * phi(i, q) * math.cos(theta[i] - theta[q]) * alpha[i]
        residual[q] = total
    return residual


def residual_47(
    theta: Vector,
    omega: Vector,
    alpha: Vector,
    m: Vector,
    l: Vector,
    g: float,
    as_printed: bool,
) -> Vector:
    """Left-hand side of (47) for every q, in array form."""
    n = len(theta)
    index = np.arange(n)
    below = np.cumsum(m[::-1])[::-1]
    # sum_{k >= q} m_k sum_{i <= k} f(i, q) keeps, for each i, the k that are >= q and >= i.
    masses = below[np.maximum.outer(index, index)]  # rows q, columns i
    difference = theta[:, None] - theta[None, :]  # theta_q - theta_i
    lengths = np.outer(l, l)
    extra = omega[:, None] if as_printed else 1.0
    second = masses * lengths * np.outer(omega, omega) * np.sin(difference)
    fourth = (
        masses
        * lengths
        * omega[None, :]
        * extra
        * np.sin(-difference)
        * (omega[:, None] - omega[None, :])
    )
    fifth = masses * lengths * (1.0 - np.eye(n)) * np.cos(difference) * alpha[None, :]
    return (
        g * below * l * np.sin(theta)
        + below * l**2 * alpha
        + second.sum(axis=1)
        + fourth.sum(axis=1)
        + fifth.sum(axis=1)
    )
