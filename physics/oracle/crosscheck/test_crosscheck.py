"""Three routes to the same accelerations, compared on random states.

1. The paper's general formula (38), transcribed as printed.
2. The compact form, which is (38) with the accelerations isolated.
3. The constraint-force formulation in ``chain/``, derived from Newton's law
   and the rod constraints by someone who had not seen the paper's formula.

(1) against (2) is an identity between two expressions, checked with arbitrary
accelerations. (1) against (3) is the check that matters: the paper reaches
(38) by inspecting n = 1, 2, 3, and a symbolic derivation only reaches a
handful of masses, while this comparison runs to hundreds.

The tolerances are the measured worst cases with about three decades of
margin: 8e-17 of the term size for the residuals in double precision, 1e-52
at fifty digits, and the conditioning of the mass matrix times the rounding
unit for the accelerations.
"""

import math

import compact
import highprec
import mpmath
import numpy as np
import pytest
from paper_formula import (
    accelerations_from_38,
    residual_38,
    residual_38_literal,
    residual_38_mp,
    residual_47,
    residual_47_literal,
)

import chain

G = 9.81
EPS = float(np.finfo(np.float64).eps)
SIZES = (1, 2, 3, 4, 5, 8, 16, 64, 256)


def random_system(n: int, seed: int):
    """A state far from anything special: large angles, large velocities, unequal parts."""
    rng = np.random.default_rng(seed)
    theta = rng.uniform(-math.pi, math.pi, n)
    omega = rng.uniform(-4.0, 4.0, n)
    m = rng.uniform(0.2, 5.0, n)
    l = rng.uniform(0.2, 2.0, n)
    return theta, omega, m, l


def scale_of(theta, omega, alpha, m, l) -> float:
    """Size of the largest group of terms in (38), to judge a residual against."""
    below = np.cumsum(m[::-1])[::-1]
    return float(np.max(below * l * (G + np.sum(l) * (np.max(np.abs(alpha)) + np.max(omega**2)))))


def collinear_system(n: int, seed: int):
    """Every rod on one line through the pivot, some folded back, with any velocities."""
    rng = np.random.default_rng(seed)
    folded = rng.integers(0, 2, n)
    folded[0] = 0
    first = rng.uniform(-math.pi, math.pi)
    return (
        first,
        folded,
        rng.uniform(-4.0, 4.0, n),
        rng.uniform(0.2, 5.0, n),
        rng.uniform(0.2, 2.0, n),
    )


@pytest.mark.parametrize("n", (1, 2, 3, 4, 6, 9))
def test_eq38_array_form_is_the_literal_sum(n):
    """EQ-38: the array transcription equals the term-by-term one."""
    rng = np.random.default_rng(100 + n)
    for seed in range(5):
        theta, omega, m, l = random_system(n, 1000 * n + seed)
        alpha = rng.uniform(-5.0, 5.0, n)
        literal = residual_38_literal(theta, omega, alpha, m, l, G)
        array = residual_38(theta, omega, alpha, m, l, G)
        assert np.max(np.abs(literal - array)) <= 1e-13 * scale_of(theta, omega, alpha, m, l)


@pytest.mark.parametrize("n", SIZES)
def test_eq38_is_the_compact_form(n):
    """EQ-38 and the compact form are the same function of state and accelerations."""
    rng = np.random.default_rng(200 + n)
    for seed in range(5):
        theta, omega, m, l = random_system(n, 2000 * n + seed)
        alpha = rng.uniform(-5.0, 5.0, n)
        printed = residual_38(theta, omega, alpha, m, l, G)
        ours = compact.residual(theta, omega, alpha, m, l, G)
        assert np.max(np.abs(printed - ours)) <= 1e-13 * scale_of(theta, omega, alpha, m, l)


def test_eq38_for_one_mass_is_the_simple_pendulum():
    """EQ-38 with n = 1 gives EQ-1."""
    theta, omega, m, l = np.array([0.7]), np.array([1.3]), np.array([2.0]), np.array([0.8])
    assert accelerations_from_38(theta, omega, m, l, G)[0] == pytest.approx(
        -G / l[0] * math.sin(theta[0]), rel=1e-14
    )


@pytest.mark.parametrize("n", SIZES)
def test_eq38_holds_for_the_constraint_force_accelerations(n):
    """EQ-38 vanishes at the accelerations that Newton's law with rod tensions gives."""
    for seed in range(5):
        theta, omega, m, l = random_system(n, 3000 * n + seed)
        alpha = chain.accelerations(theta, omega, m, l, G)
        printed = residual_38(theta, omega, alpha, m, l, G)
        assert np.max(np.abs(printed)) <= 1e-13 * scale_of(theta, omega, alpha, m, l)


@pytest.mark.parametrize("n", (1, 2, 3, 5, 8, 16))
def test_eq38_holds_to_fifty_digits(n):
    """EQ-38, summed as printed at fifty digits, vanishes at the constraint-force accelerations."""
    ctx = mpmath.MPContext()
    ctx.dps = 50
    for seed in range(3):
        theta, omega, m, l = random_system(n, 5000 * n + seed)
        alpha, _ = highprec.solve_mp(theta, omega, m, l, G, dps=50)
        exact = [[ctx.mpf(float(x)) for x in values] for values in (theta, omega, m, l)]
        printed = residual_38_mp(ctx, exact[0], exact[1], alpha, exact[2], exact[3], ctx.mpf(G))
        size = scale_of(theta, omega, np.array([float(a) for a in alpha]), m, l)
        assert max(abs(x) for x in printed) <= 1e-45 * size


@pytest.mark.parametrize("n", (2, 3, 8, 64, 256))
def test_eq38_on_a_collinear_chain(n):
    """EQ-38 gives a straight or folded chain the accelerations Newton's law dictates.

    With every rod on one line, all rod forces are parallel to that line, so
    across it each mass accelerates under gravity alone: the first angle obeys
    the simple-pendulum law and no other angle accelerates, whatever the
    velocities. The statement needs no solver, so it tests (38) on its own.
    """
    for seed in range(5):
        first, folded, omega, m, l = collinear_system(n, 6000 * n + seed)
        theta = first + math.pi * folded
        alpha = np.zeros(n)
        alpha[0] = -G / l[0] * math.sin(first)
        printed = residual_38(theta, omega, alpha, m, l, G)
        assert np.max(np.abs(printed)) <= 1e-12 * scale_of(theta, omega, alpha, m, l)


@pytest.mark.parametrize("n", (2, 3, 8, 16))
def test_eq38_on_a_collinear_chain_to_fifty_digits(n):
    """The collinear statement at fifty digits, where pi is not rounded away."""
    ctx = mpmath.MPContext()
    ctx.dps = 50
    for seed in range(3):
        first, folded, omega, m, l = collinear_system(n, 7000 * n + seed)
        theta = [ctx.mpf(first) + ctx.pi * int(fold) for fold in folded]
        exact = [[ctx.mpf(float(x)) for x in values] for values in (omega, m, l)]
        alpha = [ctx.mpf(0)] * n
        alpha[0] = -ctx.mpf(G) / exact[2][0] * ctx.sin(ctx.mpf(first))
        printed = residual_38_mp(ctx, theta, exact[0], alpha, exact[1], exact[2], ctx.mpf(G))
        size = scale_of(np.array([float(t) for t in theta]), omega, np.zeros(n), m, l)
        assert max(abs(x) for x in printed) <= 1e-45 * size


@pytest.mark.parametrize("n", SIZES)
def test_three_routes_give_the_same_accelerations(n):
    """EQ-38, the compact form and the constraint-force formulation agree.

    The two dense solves cannot do better than the conditioning of the mass
    matrix allows, so that is the yardstick.
    """
    for seed in range(5):
        theta, omega, m, l = random_system(n, 4000 * n + seed)
        from_tensions = chain.accelerations(theta, omega, m, l, G)
        from_paper = accelerations_from_38(theta, omega, m, l, G)
        from_compact = compact.accelerations(theta, omega, m, l, G)
        size = np.max(np.abs(from_tensions))
        allowed = 100.0 * EPS * np.linalg.cond(compact.mass_matrix(theta, m, l)) * size
        assert np.max(np.abs(from_paper - from_tensions)) <= allowed
        assert np.max(np.abs(from_compact - from_tensions)) <= allowed


@pytest.mark.parametrize("n", (1, 2, 3, 4, 6, 9))
def test_eq47_array_form_is_the_literal_sum(n):
    """EQ-47: the array transcription equals the term-by-term one, printed and corrected."""
    rng = np.random.default_rng(800 + n)
    for seed in range(5):
        theta, omega, m, l = random_system(n, 8000 * n + seed)
        alpha = rng.uniform(-5.0, 5.0, n)
        size = scale_of(theta, omega, alpha, m, l) * (1.0 + np.max(np.abs(omega)))
        for as_printed in (True, False):
            literal = residual_47_literal(theta, omega, alpha, m, l, G, as_printed)
            array = residual_47(theta, omega, alpha, m, l, G, as_printed)
            assert np.max(np.abs(literal - array)) <= 1e-13 * size


@pytest.mark.parametrize("n", SIZES)
def test_eq47_corrected_is_eq38(n):
    """EQ-47 without the extra angular velocity is the same function as EQ-38."""
    rng = np.random.default_rng(900 + n)
    for seed in range(5):
        theta, omega, m, l = random_system(n, 9000 * n + seed)
        alpha = rng.uniform(-5.0, 5.0, n)
        first = residual_38(theta, omega, alpha, m, l, G)
        second = residual_47(theta, omega, alpha, m, l, G, as_printed=False)
        assert np.max(np.abs(first - second)) <= 1e-13 * scale_of(theta, omega, alpha, m, l)


@pytest.mark.parametrize("n", SIZES[1:])
def test_eq47_as_printed_is_not_eq38(n):
    """EQ-47 as printed differs from EQ-38 for two masses or more, by far more than rounding."""
    rng = np.random.default_rng(950 + n)
    for seed in range(5):
        theta, omega, m, l = random_system(n, 9500 * n + seed)
        alpha = rng.uniform(-5.0, 5.0, n)
        first = residual_38(theta, omega, alpha, m, l, G)
        second = residual_47(theta, omega, alpha, m, l, G, as_printed=True)
        assert np.max(np.abs(first - second)) >= 1e-3 * np.max(np.abs(first))


def test_eq47_as_printed_is_right_for_one_mass():
    """With a single mass the term that carries the misprint vanishes."""
    theta, omega, m, l = random_system(1, 42)
    alpha = np.array([0.37])
    first = residual_38(theta, omega, alpha, m, l, G)
    second = residual_47(theta, omega, alpha, m, l, G, as_printed=True)
    assert np.max(np.abs(first - second)) <= 1e-13 * scale_of(theta, omega, alpha, m, l)
