"""Deciding identities by evaluation at 50 significant digits.

Two expressions are taken as identical when they agree to about 45 digits at
several random points where nothing degenerates: angles away from multiples of
pi/2 and from one another, angular velocities and accelerations away from zero and
from one another, masses and lengths unequal. A non-identity then shows up as a
relative residual of order one. Symbolic simplification is never used: on these
expressions it is slow and can exhaust memory, while evaluation is cheap and exact
enough.
"""

from __future__ import annotations

import functools
import itertools
import math
import random

import lagrangian as lag
import mpmath
import sympy as sp

DIGITS = 50
N_MAX = 6
POINT_COUNT = 6
SEED = 191012610

HOLDS_BELOW = mpmath.mpf("1e-35")
FAILS_ABOVE = mpmath.mpf("1e-3")

ARGS = lag.symbols(N_MAX).all()


def _spread(rng: random.Random, count: int, lo: float, hi: float, gap: float, signed: bool):
    """count magnitudes in [lo, hi], pairwise at least gap apart (also after signs)."""
    while True:
        values = [
            rng.uniform(lo, hi) * (rng.choice((-1, 1)) if signed else 1) for _ in range(count)
        ]
        if all(abs(a - b) >= gap for a, b in itertools.combinations(values, 2)):
            return values


def away(angle: float, margin: float) -> bool:
    return abs(math.sin(angle)) > margin and abs(math.cos(angle)) > margin


# Every check of the paper uses at most four angles, and those keep the wide margin.
# Angles 5 and 6 only serve the n = 5, 6 checks of the compact form; seven points
# (the six angles and zero) cannot all sit 0.2 apart modulo pi/2 without nearly
# filling it, so they get a narrower margin.
ANGLE_MARGINS = (0.2, 0.2, 0.2, 0.2, 0.12, 0.12)


def _generic_angles(rng: random.Random, margins=ANGLE_MARGINS):
    """Angles away from multiples of pi/2, and pairwise differences too, drawn one
    at a time; a draw that finds no room left starts over."""
    while True:
        angles = []
        for margin in margins:
            for _ in range(10_000):
                candidate = rng.uniform(-2.9, 2.9)
                if away(candidate, margin) and all(away(candidate - b, margin) for b in angles):
                    angles.append(candidate)
                    break
            else:
                break
        if len(angles) == len(margins):
            return angles


def sample_points(count: int = POINT_COUNT, seed: int = SEED) -> list[dict[sp.Symbol, mpmath.mpf]]:
    rng = random.Random(seed)
    s = lag.symbols(N_MAX)
    points = []
    for _ in range(count):
        values = {
            "theta": _generic_angles(rng, ANGLE_MARGINS[:N_MAX]),
            "omega": _spread(rng, N_MAX, 0.4, 2.0, 0.15, signed=True),
            "alpha": _spread(rng, N_MAX, 0.4, 2.0, 0.15, signed=True),
            "dtheta": _spread(rng, N_MAX, 0.3, 1.5, 0.1, signed=True),
            "m": _spread(rng, N_MAX, 0.5, 3.0, 0.15, signed=False),
            "l": _spread(rng, N_MAX, 0.4, 2.0, 0.1, signed=False),
        }
        point = {}
        for name, numbers in values.items():
            group = getattr(s, name)
            for i, number in enumerate(numbers, start=1):
                # A binary float converts to mpf exactly, so the point is the same
                # at every precision.
                point[group[i]] = mpmath.mpf(number)
        point[lag.g] = mpmath.mpf(rng.uniform(5.0, 15.0))
        points.append(point)
    return points


POINTS = sample_points()


@functools.cache
def _compiled(expr: sp.Expr):
    stray = expr.free_symbols - set(ARGS)
    if stray:
        raise ValueError(f"unknown symbols: {sorted(map(str, stray))}")
    return sp.lambdify(ARGS, expr, modules="mpmath")


@functools.cache
def _values_at_default_points(expr: sp.Expr) -> tuple[mpmath.mpf, ...]:
    return tuple(_evaluate(expr, POINTS))


def _evaluate(expr: sp.Expr, points) -> list[mpmath.mpf]:
    function = _compiled(expr)
    with mpmath.workdps(DIGITS):
        return [mpmath.mpf(function(*[point[a] for a in ARGS])) for point in points]


def evaluate(expr, points=None) -> list[mpmath.mpf]:
    # The reference expressions recur in many tests; compiling and evaluating each
    # once keeps the suite fast.
    expr = sp.sympify(expr)
    if points is None:
        return list(_values_at_default_points(expr))
    return _evaluate(expr, points)


def residual(lhs, rhs, points=None) -> mpmath.mpf:
    """Largest relative difference over the points, relative to max(1, |lhs|, |rhs|)."""
    with mpmath.workdps(DIGITS):
        pairs = zip(evaluate(lhs, points), evaluate(rhs, points), strict=True)
        return max(abs(a - b) / max(1, abs(a), abs(b)) for a, b in pairs)


def holds(lhs, rhs) -> bool:
    return residual(lhs, rhs) < HOLDS_BELOW


def fails(lhs, rhs) -> bool:
    return residual(lhs, rhs) > FAILS_ABOVE
