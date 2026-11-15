"""Equation-by-equation checks of sections 4 and 5 of arXiv:1910.12610v2, printed numbers (48)-(85).

One test per printed number where a test can decide it. Identities are decided at 50
significant digits on random points with unequal values (residuals near 1e-45 for an identity,
order one otherwise). For a misprint the printed form fails and the corrected form passes, both
asserted, so this file is the errata. For a ``notation`` verdict the literal reading fails and
the stated reading passes. The ground truth is the first-principles model of
``linearization.py``; the rope is ``rope.py``.

Run from physics/oracle:  uv run --no-sync pytest limits -q
"""

import itertools
import json
import math
import random
from fractions import Fraction
from pathlib import Path

import linearization as lin
import mpmath
import numpy as np
import printed_sections_4_5 as pe
import pytest
import rope
import sympy
from convergence import observed_orders, study

mpmath.mp.dps = 50
TOL = mpmath.mpf(10) ** -40
HERE = Path(__file__).resolve().parent
J0_ZEROS = [mpmath.besseljzero(0, k) for k in (1, 2, 3, 4)]


# --- helpers ---------------------------------------------------------------------------------


def uniform(r, lo, hi):
    return mpmath.mpf(lo) + (mpmath.mpf(hi) - mpmath.mpf(lo)) * mpmath.mpf(r.random())


def same(a, b, scale=1):
    size = max(mpmath.mpf(scale), abs(a), abs(b))
    return abs(a - b) <= TOL * size


def differs(a, b, scale=1):
    size = max(mpmath.mpf(scale), abs(a), abs(b))
    return abs(a - b) > mpmath.mpf(10) ** -6 * size


def one_based(values):
    return [None] + list(values)


def random_chain(r, n, angle=1):
    """Unequal masses and lengths, a random g, and a random (not small) state."""
    masses = [uniform(r, 0.5, 3) for _ in range(n)]
    lengths = [uniform(r, 0.3, 2) for _ in range(n)]
    th = [uniform(r, -angle, angle) for _ in range(n)]
    dth = [uniform(r, -2, 2) for _ in range(n)]
    ddth = [uniform(r, -3, 3) for _ in range(n)]
    return masses, lengths, th, dth, ddth, uniform(r, 5, 15)


def random_uniform_chain(r, n):
    """Section 5: one mass m, one length l; x_0 = 0 at the pivot; two phantom entries past n."""
    m, l, g = uniform(r, 0.5, 3), uniform(r, 0.2, 1.5), uniform(r, 5, 15)
    x = [mpmath.mpf(0)] + [uniform(r, -1, 1) for _ in range(n + 2)]
    xdd = [mpmath.mpf(0)] + [uniform(r, -1, 1) for _ in range(n + 2)]
    return m, l, g, x, xdd


def eq54_uniform(j, n, x, xdd, m, l, g):
    """(54) for equal masses and lengths with theta_j = (x_j - x_{j-1})/l."""
    th = pe.angles_from_x(x, l, n)
    thdd = pe.angles_from_x(xdd, l, n)
    return pe.eq54(j, n, th, thdd, one_based([m] * n), one_based([l] * n), g)


def smooth_field(yv):
    """A smooth test profile with x(0) = 0 and its first three y-derivatives."""
    a = mpmath.mpf("1.3")
    value = mpmath.sin(a * yv) + mpmath.mpf("0.2") * yv**3 - mpmath.mpf("0.5") * yv
    first = a * mpmath.cos(a * yv) + mpmath.mpf("0.6") * yv**2 - mpmath.mpf("0.5")
    second = -(a**2) * mpmath.sin(a * yv) + mpmath.mpf("1.2") * yv
    third = -(a**3) * mpmath.cos(a * yv) + mpmath.mpf("1.2")
    return value, first, second, third


def last_orders(values):
    """log2 ratios of consecutive magnitudes."""
    return [math.log2(float(abs(a) / abs(b))) for a, b in itertools.pairwise(values)]


LENGTH, MASS, G = 2.0, 3.0, 9.81


def discrete_mode(count, k=0):
    """Mode k of the N = count chain, scaled to 1 at the free end like the rope's Psi_k(L)."""
    masses, lengths = lin.uniform_chain(MASS, LENGTH, count)
    omega, vectors = lin.normal_modes(masses, lengths, G, k + 1)
    v = vectors[:, k] / vectors[-1, k]
    return float(omega[k]), [0.0] + [float(c) for c in v]


def rope_values(y_value, k=1):
    psi, dpsi, ddpsi = rope.mode_derivatives(k, mpmath.mpf(y_value), mpmath.mpf(LENGTH))
    omega = rope.frequency(k, mpmath.mpf(LENGTH), mpmath.mpf(G))
    return float(omega), float(psi), float(dpsi), float(ddpsi)


# --- section 4 -------------------------------------------------------------------------------


def test_eq48_sine_approximant_error_is_cubic():
    for e in range(2, 12):
        th = mpmath.mpf(10) ** -e
        ratio = (mpmath.sin(th) - pe.eq48(th)) / th**3
        assert abs(ratio + mpmath.mpf(1) / 6) < th**2


def test_eq49_cosine_approximant_error_is_quartic():
    # cos(theta) - 1 cancels about 2e digits, hence the extra precision.
    with mpmath.workdps(100):
        for e in range(2, 12):
            th = mpmath.mpf(10) ** -e
            ratio = (mpmath.cos(th) - pe.eq49(th)) / th**4
            assert abs(ratio - mpmath.mpf(1) / 24) < th**2


def test_eq50_is_eq38_truncated_and_expanded():
    """First member: (38) with (48)-(49) substituted. Second member: its expansion."""
    for n in range(1, 9):
        masses, lengths, th, dth, ddth, g = random_chain(random.Random(100 + n), n)
        args = (one_based(th), one_based(dth), one_based(ddth), one_based(masses))
        for j in range(1, n + 1):
            first = pe.eq50_first(j, n, *args, one_based(lengths), g)
            substituted = pe.eq38(j, n, *args, one_based(lengths), g, sin=pe.eq48, cos=pe.eq49)
            second = pe.eq50_second(j, n, *args, one_based(lengths), g)
            assert same(first, substituted)
            assert same(first, second)


def test_eq51_restates_eq50():
    for n in range(1, 9):
        masses, lengths, th, dth, ddth, g = random_chain(random.Random(300 + n), n)
        args = (one_based(th), one_based(dth), one_based(ddth), one_based(masses))
        for j in range(1, n + 1):
            assert same(
                pe.eq51(j, n, *args, one_based(lengths), g),
                pe.eq50_second(j, n, *args, one_based(lengths), g),
            )


def test_section4_truncation_is_not_consistent_in_order():
    """(51) keeps cubic terms yet lacks the cubic term of sin(theta_j); (54) is consistent.

    With theta = eps a, thetadot = eps b, theta'' = eps c and the exact equations E:
    E - (51) = -g l_j mu_j theta_j^3 / 6 + O(eps^5), while E - (54) = O(eps^3), not smaller.
    """
    eps = mpmath.mpf(10) ** -12
    for n in range(1, 7):
        r = random.Random(400 + n)
        masses, lengths, _, b, c, g = random_chain(r, n)
        # |a_j| >= 1/2 so that the missing cubic term is visibly nonzero for every j.
        a = [uniform(r, 0.5, 1) * r.choice((-1, 1)) for _ in range(n)]
        th = [eps * v for v in a]
        dth = [eps * v for v in b]
        ddth = [eps * v for v in c]
        exact = lin.exact_residual(th, dth, ddth, masses, lengths, g, mpmath.sin, mpmath.cos)
        mu = lin.hanging_masses(masses)
        args = (one_based(th), one_based(dth), one_based(ddth), one_based(masses))
        for j in range(1, n + 1):
            e51 = pe.eq51(j, n, *args, one_based(lengths), g)
            e54 = pe.eq54(
                j, n, one_based(th), one_based(ddth), one_based(masses), one_based(lengths), g
            )
            missing = -g * lengths[j - 1] * mu[j - 1] * th[j - 1] ** 3 / 6
            gap51 = (exact[j - 1] - e51) / eps**3
            assert abs(gap51 - missing / eps**3) < mpmath.mpf(10) ** -15
            assert abs(gap51) > mpmath.mpf(10) ** -3
            gap54 = exact[j - 1] - e54
            assert abs(gap54 / eps**2) < mpmath.mpf(10) ** -9
            assert abs(gap54 / eps**3) > mpmath.mpf(10) ** -3


def test_eq52_simple_pendulum_lines():
    for seed in range(5):
        masses, lengths, th, dth, ddth, g = random_chain(random.Random(500 + seed), 1)
        first, second, third = pe.eq52_lines(th[0], dth[0], ddth[0], masses[0], lengths[0], g)
        general = pe.eq51(
            1,
            1,
            one_based(th),
            one_based(dth),
            one_based(ddth),
            one_based(masses),
            one_based(lengths),
            g,
        )
        assert same(first, general)
        assert same(first, second)
        assert same(third, second / (masses[0] * lengths[0] ** 2))


def test_eq53_printed_fails_corrected_passes():
    for seed in range(6):
        masses, lengths, th, dth, ddth, g = random_chain(random.Random(600 + seed), 2)
        args = (one_based(th), one_based(dth), one_based(ddth), one_based(masses))
        target = pe.eq51(1, 2, *args, one_based(lengths), g)
        assert same(pe.eq53_corrected(*args, one_based(lengths), g), target)
        assert differs(pe.eq53_printed(*args, one_based(lengths), g), target)


# --- section 5: the linearized system --------------------------------------------------------


def test_eq54_is_the_first_principles_linearization():
    for n in range(1, 11):
        masses, lengths, th, _, ddth, g = random_chain(random.Random(700 + n), n)
        truth = lin.linear_residual(th, ddth, masses, lengths, g)
        for j in range(1, n + 1):
            printed = pe.eq54(
                j, n, one_based(th), one_based(ddth), one_based(masses), one_based(lengths), g
            )
            assert same(printed, truth[j - 1])


def test_eq54_drops_exactly_the_terms_named_in_the_text():
    for n in range(1, 9):
        masses, lengths, th, dth, ddth, g = random_chain(random.Random(800 + n), n)
        m, ell = one_based(masses), one_based(lengths)
        t1, d1, a1 = one_based(th), one_based(dth), one_based(ddth)
        for j in range(1, n + 1):
            named = sum(
                pe.tail(j, k, n, m)
                * ell[j]
                * ell[k]
                * (
                    t1[j] * d1[k] ** 2
                    - t1[k] * d1[k] ** 2
                    - pe.phi(j, k) * a1[k] * t1[j] ** 2 / 2
                    - pe.phi(j, k) * a1[k] * t1[k] ** 2 / 2
                    + t1[k] * t1[j] * pe.phi(j, k) * a1[k]
                )
                for k in range(1, n + 1)
            )
            gap = pe.eq51(j, n, t1, d1, a1, m, ell, g) - pe.eq54(j, n, t1, a1, m, ell, g)
            assert same(gap, named)


def test_first_principles_matrices_match_sympy():
    for n in range(1, 7):
        chain, mass, stiffness = lin.symbolic_quadratic_matrices(n)
        closed_mass = lin.theta_mass_matrix(list(chain["masses"]), list(chain["lengths"]))
        closed_stiffness = lin.theta_stiffness_matrix(
            list(chain["masses"]), list(chain["lengths"]), chain["g"]
        )
        for a in range(n):
            for b in range(n):
                assert sympy.expand(mass[a, b] - closed_mass[a][b]) == 0
                assert sympy.expand(stiffness[a, b] - closed_stiffness[a][b]) == 0


def test_exact_residual_matches_sympy_euler_lagrange():
    for n in range(1, 4):
        chain, (q, qd, qdd), equations = lin.symbolic_euler_lagrange(n)
        symbols = [*q, *qd, *qdd, *chain["masses"], *chain["lengths"], chain["g"]]
        functions = [sympy.lambdify(symbols, e, modules="mpmath") for e in equations]
        masses, lengths, th, dth, ddth, g = random_chain(random.Random(900 + n), n)
        exact = lin.exact_residual(th, dth, ddth, masses, lengths, g, mpmath.sin, mpmath.cos)
        values = [*th, *dth, *ddth, *masses, *lengths, g]
        for j in range(n):
            assert same(functions[j](*values), exact[j])


def test_x_form_is_the_angle_form_transformed():
    for n in range(1, 9):
        masses, lengths, *_, g = random_chain(random.Random(1000 + n), n)
        d = lin.difference_matrix(lengths)
        dt = lin.transpose(d)
        mass_x = lin.matmul(dt, lin.matmul(lin.theta_mass_matrix(masses, lengths), d))
        stiff_x = lin.matmul(dt, lin.matmul(lin.theta_stiffness_matrix(masses, lengths, g), d))
        for a in range(n):
            for b in range(n):
                assert same(mass_x[a][b], lin.x_mass_matrix(masses)[a][b], 10)
                assert same(stiff_x[a][b], lin.x_stiffness_matrix(masses, lengths, g)[a][b], 10)


def test_eq55_density_constant_along_the_refinement():
    n, l, m = 3, Fraction(2, 3), Fraction(5, 7)
    for p in range(11):
        n_p, l_p, m_p = pe.sequential(n, l, m, p)
        assert pe.eq55(n_p * m_p, n_p * l_p) == m / l
        # The prose before the definitions: with the mass per point kept, mu doubles per step.
        assert pe.eq55(n_p * m, n_p * l_p) == 2**p * m / l


def test_eq56_first_sum():
    for n in range(1, 11):
        m, l, g, x, _ = random_uniform_chain(random.Random(1100 + n), n)
        for j in range(1, n + 1):
            left, middle, right = pe.eq56(j, n, x, m, l, g)
            assert same(left, middle) and same(middle, right)


def test_eq57_second_sum():
    for n in range(1, 11):
        m, l, _, _, xdd = random_uniform_chain(random.Random(1200 + n), n)
        for j in range(1, n + 1):
            left, middle, right = pe.eq57(j, n, xdd, m, l)
            assert same(left, middle) and same(middle, right)


def test_eq58_third_sum_below():
    for n in range(1, 11):
        m, l, _, _, xdd = random_uniform_chain(random.Random(1300 + n), n)
        for j in range(1, n + 1):
            left, right = pe.eq58(j, n, xdd, m, l)
            assert same(left, right)


def test_eq59_third_sum_below_telescoped():
    for n in range(1, 11):
        m, l, _, _, xdd = random_uniform_chain(random.Random(1400 + n), n)
        for j in range(1, n + 1):
            left, right = pe.eq59(j, n, xdd, m, l)
            assert same(left, right)


def test_eq60_holds_while_the_written_terms_exist():
    """j <= n - 2 literally; j = n - 1 too, its term past the chain having coefficient 0."""
    for n in range(2, 11):
        m, l, _, _, xdd = random_uniform_chain(random.Random(1500 + n), n)
        for j in range(1, n):
            left, middle, right = pe.eq60(j, n, xdd, m, l)
            assert same(left, middle) and same(middle, right)


def test_eq60_last_mass_needs_the_reading():
    """At j = n the left side is an empty sum and the right side is (ml^2/l)(xdd_{n+1} - xdd_{n+2})."""
    for n in range(1, 11):
        m, l, _, _, xdd = random_uniform_chain(random.Random(1600 + n), n)
        left, middle, right = pe.eq60(n, n, xdd, m, l)
        assert left == 0
        assert differs(right, left) and differs(middle, left)
        assert same(right, m * l**2 / l * (xdd[n + 1] - xdd[n + 2]))
        zero_extended = xdd[: n + 1] + [mpmath.mpf(0), mpmath.mpf(0)]
        left, middle, right = pe.eq60(n, n, zero_extended, m, l)
        assert same(left, middle) and same(middle, right)


def test_eq61_closed_form_all_j():
    for n in range(1, 11):
        m, l, _, _, xdd = random_uniform_chain(random.Random(1700 + n), n)
        for j in range(1, n + 1):
            left, right = pe.eq61(j, n, xdd, m, l)
            assert same(left, right)


def test_eq62_printed_fails_corrected_passes():
    for n in range(1, 11):
        r = random.Random(1800 + n)
        m, l, g, x, xdd = random_uniform_chain(r, n)
        s = uniform(r, 2, 5)
        for j in range(1, n + 1):
            truth = eq54_uniform(j, n, x, xdd, m, l, g)
            assembled = (
                pe.eq56(j, n, x, m, l, g)[2]
                + pe.eq57(j, n, xdd, m, l)[2]
                + pe.eq59(j, n, xdd, m, l)[1]
                + pe.eq61(j, n, xdd, m, l)[1]
            )
            corrected = pe.eq62_corrected(j, n, x, xdd, m, l, g)
            assert same(corrected, truth) and same(corrected, assembled)
            if j < n:  # at j = n the bracket that s multiplies is zero
                assert differs(pe.eq62_printed(j, n, x, xdd, m, l, g, s), truth)


def test_eq63_after_cancellations():
    for n in range(1, 11):
        m, l, g, x, xdd = random_uniform_chain(random.Random(1900 + n), n)
        for j in range(1, n + 1):
            assert same(pe.eq63(j, n, x, xdd, m, l, g), pe.eq62_corrected(j, n, x, xdd, m, l, g))
            assert same(pe.eq63(j, n, x, xdd, m, l, g), eq54_uniform(j, n, x, xdd, m, l, g))


def test_eq64_rearranges_eq63():
    for n in range(1, 11):
        m, l, g, x, xdd = random_uniform_chain(random.Random(2000 + n), n)
        for j in range(1, n + 1):
            left, right = pe.eq64(j, n, x, xdd, m, l, g)
            assert same(left - right, pe.eq63(j, n, x, xdd, m, l, g))


def test_eq65_is_the_first_principles_equation():
    """m (65)_j = (M_x x'' + K_x x)_j for every j, the last one included; and
    m l (65)_j = (63)_j - (63)_{j+1}, which is how the paper gets it."""
    for n in range(1, 11):
        m, l, g, x, xdd = random_uniform_chain(random.Random(2100 + n), n)
        truth = lin.x_linear_residual(x[1 : n + 1], xdd[1 : n + 1], [m] * n, [l] * n, g)
        for j in range(1, n + 1):
            printed = pe.eq65(j, n, x, xdd, l, g)
            assert same(m * printed, truth[j - 1])
            below = pe.eq63(j + 1, n, x, xdd, m, l, g) if j < n else 0
            assert same(m * l * printed, pe.eq63(j, n, x, xdd, m, l, g) - below)


def test_eq66_rewrites_eq65_in_sequential_form():
    for n in range(1, 9):
        r = random.Random(2200 + n)
        m, l, g, x, xdd = random_uniform_chain(r, n * 4)
        for p in range(3):
            n_p, l_p, _ = pe.sequential(n, l, m, p)
            for j in range(1, n_p + 1):
                rhs = pe.eq66_rhs(j, n_p, l_p, x, g)
                assert same(rhs, xdd[j] - pe.eq65(j, n_p, x, xdd, l_p, g))


def test_eq66_is_first_order_consistent_with_eq74():
    """Truncation error of (66) against (74): g l_p x_yy / 2 + O(l_p^2) at interior points and at
    the free end; against the rope of length L + l_p/2 it is O(l_p^2)."""
    L, g = mpmath.mpf(2), mpmath.mpf("9.81")
    for fraction in (mpmath.mpf(1) / 2, mpmath.mpf(1)):
        y_star = fraction * L
        _, x1, x2, _ = smooth_field(y_star)
        target = pe.eq74_rhs(L, y_star, x1, x2, g)
        taus, leading_gaps, longer = [], [], []
        for p in range(4, 13):
            n_p, l_p, _ = pe.sequential(1, L, 1, p)
            j = int(fraction * n_p)
            x = [smooth_field(i * l_p)[0] for i in range(n_p + 2)]
            tau = pe.eq66_rhs(j, n_p, l_p, x, g) - target
            taus.append(tau)
            leading_gaps.append(tau - g * l_p * x2 / 2)
            longer.append(
                pe.eq66_rhs(j, n_p, l_p, x, g) - pe.eq74_rhs(L + l_p / 2, y_star, x1, x2, g)
            )
        assert all(abs(o - 1) < 0.02 for o in last_orders(taus)[-3:])
        assert all(abs(o - 2) < 0.05 for o in last_orders(leading_gaps)[-3:])
        assert all(abs(o - 2) < 0.05 for o in last_orders(longer)[-3:])


# --- section 5: the limit p -> infinity --------------------------------------------------------


def test_eq67_reading_on_discrete_modes():
    y_star = 0.75 * LENGTH
    omega, psi, _, _ = rope_values(y_star)
    target = -(omega**2) * psi  # x_tt(y, 0) for x = Psi(y) cos(omega t)
    errors, fixed = [], []
    for p in range(3, 9):
        count = 2**p
        w, v = discrete_mode(count)
        errors.append(-(w**2) * v[int(0.75 * count)] - target)
        fixed.append(-(w**2) * v[1])
    assert all(abs(o - 1) < 0.1 for o in last_orders(errors)[-3:])
    assert abs(errors[-1]) < 0.01 * abs(target)
    # With j fixed the node approaches the pivot: the limit is x_tt(0, t) = 0, not x_tt(y, t).
    assert abs(fixed[-1]) < 0.02 * abs(target) and abs(fixed[-1]) < abs(fixed[0])


def test_eq68_neighbour_gap_vanishes():
    _, _, dpsi_max, _ = rope_values(LENGTH * 0.999999)
    gaps_fixed, gaps_scaled = [], []
    for p in range(3, 9):
        count = 2**p
        _, v = discrete_mode(count)
        gaps_fixed.append(abs(pe.eq68_lhs(v, 1)))
        gaps_scaled.append(abs(pe.eq68_lhs(v, count // 2)))
        bound = 1.1 * max(abs(dpsi_max), 1.0) * LENGTH / count
        assert gaps_fixed[-1] < bound and gaps_scaled[-1] < bound
    assert gaps_fixed[-1] < 1e-2 and gaps_scaled[-1] < 1e-2


def test_eq69_is_an_identity():
    r = random.Random(2300)
    l = Fraction(3, 5)
    for p in range(8):
        x = [Fraction(r.randint(-1000, 1000), 997) for _ in range(5)]
        left, right = pe.eq69(x, 3, l, p)
        assert left == right


def test_eq70_reading_on_discrete_modes():
    y_star = 0.5 * LENGTH
    _, _, slope, _ = rope_values(y_star)
    _, _, slope_at_pivot, _ = rope_values(0.0)
    errors, fixed = [], []
    for p in range(3, 9):
        count = 2**p
        _, v = discrete_mode(count)
        j = count // 2
        errors.append(pe.eq70_lhs(v, j, LENGTH, p) - slope)
        fixed.append(pe.eq70_lhs(v, 1, LENGTH, p))
    assert all(abs(o - 1) < 0.15 for o in last_orders(errors)[-3:])
    assert abs(errors[-1]) < 0.01 * abs(slope)
    # With j fixed the quotient tends to the slope at the pivot.
    assert abs(fixed[-1] - slope_at_pivot) < 0.01 * abs(slope_at_pivot)
    assert abs(slope_at_pivot - slope) > 0.1 * abs(slope)


def test_eq71_reading():
    L = Fraction(2)
    y_star = Fraction(3, 4) * L
    for p in range(2, 12):
        n_p, l_p, _ = pe.sequential(1, L, 1, p)
        j = int(y_star / l_p)
        assert pe.eq71_lhs(n_p, l_p, j) == L - y_star
    # Literal, j fixed: the member tends to L.
    assert abs(pe.eq71_lhs(*pe.sequential(1, L, 1, 30)[:2], 3) - L) < Fraction(1, 10**8)


def test_eq72_is_an_identity():
    r = random.Random(2400)
    for p in range(8):
        n_p, l_p, _ = pe.sequential(3, Fraction(2), Fraction(1), p)
        x = [Fraction(r.randint(-1000, 1000), 991) for _ in range(n_p + 2)]
        for j in range(1, n_p + 1):
            left, right = pe.eq72(x, j, n_p, l_p)
            assert left == right


def test_eq73_reading_on_discrete_modes():
    y_star = 0.5 * LENGTH
    _, _, _, curvature = rope_values(y_star)
    _, _, _, curvature_at_pivot = rope_values(0.0)
    target = pe.eq73_rhs(LENGTH, y_star, curvature)
    errors, fixed = [], []
    for p in range(3, 9):
        count = 2**p
        _, v = discrete_mode(count)
        n_p, l_p = count, LENGTH / count
        errors.append(pe.eq73_lhs(v, count // 2, n_p, l_p) - target)
        fixed.append(pe.eq73_lhs(v, 1, n_p, l_p))
    assert all(abs(o - 1) < 0.15 for o in last_orders(errors)[-3:])
    assert abs(errors[-1]) < 0.01 * abs(target)
    # With j fixed the member tends to L x_yy(0, t), a different number.
    assert abs(fixed[-1] - LENGTH * curvature_at_pivot) < 0.02 * abs(LENGTH * curvature_at_pivot)
    assert abs(LENGTH * curvature_at_pivot - target) > 0.1 * abs(target)


def test_eq74_is_the_rope_equation():
    """(74) is g d/dy[(L - y) x_y], the transverse equation of a uniform hanging rope."""
    y, g, L = pe.y, pe.g_sym, pe.L_rope
    x = pe.x_field
    rhs = pe.eq74_rhs(L, y, sympy.diff(x, y), sympy.diff(x, y, 2), g)
    assert sympy.simplify(rhs - g * sympy.diff((L - y) * sympy.diff(x, y), y)) == 0
    # The same equation from the chain's own tension: rod j carries (n - j + 1) m g, i.e.
    # mu g (L - y) at its upper end; (65) is m xdd_j = T_{j+1} theta_{j+1} - T_j theta_j.
    for n in range(1, 8):
        m, l, g_val, x_vals, xdd = random_uniform_chain(random.Random(2500 + n), n)
        for j in range(1, n + 1):
            tension_below = (n - j) * m * g_val
            tension_above = (n - j + 1) * m * g_val
            force = (
                tension_below * (x_vals[j + 1] - x_vals[j]) / l
                - tension_above * (x_vals[j] - x_vals[j - 1]) / l
            )
            assert same(m * pe.eq65(j, n, x_vals, xdd, l, g_val), m * xdd[j] - force)


def test_eq75_matches_sympy_euler_equations():
    y, t = pe.y, pe.t
    a, b = sympy.Function("a")(y), sympy.Function("b")(y)
    c = sympy.Symbol("c")
    density = a * pe.u_t**2 / 2 - b * pe.u_y**2 / 2 - c * pe.u**2 / 2 + y * t * pe.u * pe.u_y
    ours = pe.eq75(density)
    on_field = density.subs(
        {pe.u: pe.x_field, pe.u_t: sympy.diff(pe.x_field, t), pe.u_y: sympy.diff(pe.x_field, y)}
    )
    (equation,) = sympy.calculus.euler.euler_equations(on_field, pe.x_field, [y, t])
    assert sympy.simplify(ours + equation.lhs) == 0


def test_eq76_chain_lagrangian_splits_into_element_energies():
    """The chain's quadratic Lagrangian is sum dT - sum dU, element by element, with dT the
    element's kinetic energy and dU = (mass below) g (rise), the discrete (76)/(77)/(79)."""
    for n in range(1, 9):
        r = random.Random(2600 + n)
        masses, lengths, *_, g = random_chain(r, n)
        x = [uniform(r, -1, 1) for _ in range(n)]
        xd = [uniform(r, -1, 1) for _ in range(n)]
        kinetic = sum(a * b for a, b in zip(xd, lin.matvec(lin.x_mass_matrix(masses), xd))) / 2
        potential = (
            sum(a * b for a, b in zip(x, lin.matvec(lin.x_stiffness_matrix(masses, lengths, g), x)))
            / 2
        )
        mu = lin.hanging_masses(masses)
        element_t = sum(masses[i] * xd[i] ** 2 / 2 for i in range(n))
        element_u = 0
        for i in range(n):
            slope = (x[i] - (x[i - 1] if i else 0)) / lengths[i]
            element_u += mu[i] * g * pe.eq77_dh_per_dy(slope) * lengths[i]
        assert same(kinetic - potential, element_t - element_u, 10)


def test_eq77_rope_potential():
    # dl: arc length of a graph element, to second order in the slope.
    for e in range(2, 10):
        s = mpmath.mpf(10) ** -e
        assert abs((mpmath.sqrt(1 + s**2) - pe.eq77_dl_per_dy(s)) / s**4 + mpmath.mpf(1) / 8) < s
    # dU = m_below g dh is exact for the chain: U - U(0) = sum_a mu_a g l_a (1 - cos theta_a).
    for n in range(1, 9):
        masses, lengths, th, *_, g = random_chain(random.Random(2700 + n), n)
        height = 0
        exact = 0
        for i in range(n):
            height = height - lengths[i] * mpmath.cos(th[i])
            exact += masses[i] * g * (height + sum(lengths[: i + 1]))
        mu = lin.hanging_masses(masses)
        split = sum(mu[a] * g * lengths[a] * (1 - mpmath.cos(th[a])) for a in range(n))
        assert same(exact, split, 10)
    # dh = l (1 - cos theta) = (1/2) (x_y)^2 dy + O(theta^4), slope x_y = tan theta, dy = l cos theta.
    for e in range(2, 8):
        th = mpmath.mpf(10) ** -e
        rise = 1 - mpmath.cos(th)
        printed = pe.eq77_dh_per_dy(mpmath.tan(th)) * mpmath.cos(th)
        assert abs(rise - printed) < th**4
    # Summed over the chain it converges to the integral of (77)'s dU (first order).
    L, g, mu_rho = mpmath.mpf(2), mpmath.mpf("9.81"), mpmath.mpf("1.5")
    integral = mpmath.quad(
        lambda yv: pe.eq77_du_per_dy(smooth_field(yv)[1], yv, L, g, mu_rho), [0, L]
    )
    errors = []
    for p in range(4, 10):
        count = 2**p
        h = L / count
        total = 0
        for a in range(1, count + 1):
            slope = (smooth_field(a * h)[0] - smooth_field((a - 1) * h)[0]) / h
            total += mu_rho * (L - (a - 1) * h) * g * pe.eq77_dh_per_dy(slope) * h
        errors.append(total - integral)
    assert all(abs(o - 1) < 0.1 for o in last_orders(errors)[-3:])


def test_eq78_kinetic_energy_at_quadratic_order():
    """The chain's full kinetic energy, the horizontal-only one and (78)'s dl factor all agree at
    quadratic order: relative differences O(eps^2)."""
    for n in range(1, 7):
        masses, lengths, a, b, _, _ = random_chain(random.Random(2800 + n), n)
        mu = lin.hanging_masses(masses)
        ratios = []
        for e in (3, 4, 5):
            eps = mpmath.mpf(10) ** -e
            th = [eps * v for v in a]
            dth = [eps * v for v in b]
            full = 0
            for i in range(n):
                for k in range(n):
                    coupling = lengths[i] * lengths[k] * mu[max(i, k)]
                    full += coupling * mpmath.cos(th[i] - th[k]) * dth[i] * dth[k] / 2
            quadratic = sum(
                masses[i] * sum(lengths[c] * dth[c] for c in range(i + 1)) ** 2 / 2
                for i in range(n)
            )
            ratios.append((full - quadratic) / quadratic)
            assert abs(ratios[-1]) < 100 * eps**2
        slope = mpmath.mpf(10) ** -4
        relative = (pe.eq78_dt_per_dy(1, slope, 1) - pe.eq79_dt_per_dy(1, 1)) / pe.eq79_dt_per_dy(
            1, 1
        )
        assert same(relative, slope**2 / 2)


def test_eq79_kinetic_energy_limit():
    L, mu_rho = mpmath.mpf(2), mpmath.mpf("1.5")

    def velocity(yv):
        return mpmath.sin(mpmath.mpf("0.9") * yv) * yv

    integral = mpmath.quad(lambda yv: pe.eq79_dt_per_dy(velocity(yv), mu_rho), [0, L])
    errors = []
    for p in range(4, 10):
        count = 2**p
        h = L / count
        chain = sum(mu_rho * h * velocity(i * h) ** 2 / 2 for i in range(1, count + 1))
        errors.append(chain - integral)
    assert all(abs(o - 1) < 0.1 for o in last_orders(errors)[-3:])


def test_eq80_is_the_limit_of_the_chain_lagrangian():
    L, g, total_mass = mpmath.mpf(2), mpmath.mpf("9.81"), mpmath.mpf(3)
    mu_rho = total_mass / L

    def velocity(yv):
        return mpmath.sin(mpmath.mpf("0.9") * yv) * yv

    integral = (
        mpmath.quad(
            lambda yv: pe.eq80_integrand(velocity(yv), smooth_field(yv)[1], yv, L, g, mu_rho),
            [0, L],
        )
        / 2
    )
    errors = []
    for p in range(4, 10):
        count = 2**p
        masses, lengths = lin.uniform_chain(total_mass, L, count)
        nodes = [i * L / count for i in range(1, count + 1)]
        x = [smooth_field(yv)[0] for yv in nodes]
        xd = [velocity(yv) for yv in nodes]
        kinetic = sum(a * b for a, b in zip(xd, lin.matvec(lin.x_mass_matrix(masses), xd))) / 2
        potential = (
            sum(a * b for a, b in zip(x, lin.matvec(lin.x_stiffness_matrix(masses, lengths, g), x)))
            / 2
        )
        errors.append(kinetic - potential - integral)
    assert all(abs(o - 1) < 0.1 for o in last_orders(errors)[-3:])


def test_eq81_follows_from_eq80_by_eq75():
    euler_lagrange = pe.eq75(pe.eq80_density())
    assert sympy.simplify(euler_lagrange - pe.mu_sym * pe.eq81_residual()) == 0


def test_eq82_separated_solutions_of_eq74():
    L, g = mpmath.mpf(2), mpmath.mpf("9.81")
    r = random.Random(2900)
    for k in (1, 2, 3):
        omega = rope.frequency(k, L, g)
        for _ in range(4):
            yv, tv = uniform(r, 0.05, 1.95), uniform(r, 0, 3)
            psi, dpsi, ddpsi = rope.mode_derivatives(k, yv, L)
            x_tt = -(omega**2) * psi * mpmath.cos(omega * tv)
            rhs = pe.eq74_rhs(
                L, yv, dpsi * mpmath.cos(omega * tv), ddpsi * mpmath.cos(omega * tv), g
            )
            assert same(x_tt, rhs, 10)


def test_eq83_separation():
    left, middle = pe.eq83_members()
    residual = pe.eq81_residual(pe.eq82()) / pe.eq82()
    assert sympy.simplify(residual - (left - middle)) == 0


def test_eq84_time_equation():
    left, _ = pe.eq83_members()
    assert sympy.simplify(pe.eq84() - pe.xi(pe.t) * (left + pe.K_sym)) == 0


def test_eq85_space_equation():
    _, middle = pe.eq83_members()
    assert sympy.simplify(pe.eq85() * pe.g_sym / pe.Psi(pe.y) - (middle + pe.K_sym)) == 0


def test_bessel_substitution_of_the_text():
    """h^2 = (L - y)/g turns (85) into h^2 F'' + h F' + 4 K h^2 F = 0: Bessel's equation of order
    zero only after the further scaling z = 2 sqrt(K) h."""
    h = sympy.Symbol("h", positive=True)
    F = sympy.Function("F")
    g, L, K = pe.g_sym, pe.L_rope, pe.K_sym
    on_h = pe.eq85(F(sympy.sqrt((L - pe.y) / g))).subs(pe.y, L - g * h**2).doit()
    parametric = h**2 * sympy.diff(F(h), h, 2) + h * sympy.diff(F(h), h) + 4 * K * h**2 * F(h)
    assert sympy.simplify(4 * g * h**2 * on_h - parametric) == 0
    # The parametric form is Bessel's only in z = 2 sqrt(K) h: J0(2 sqrt(K) h) solves it, J0(h)
    # does not (unless 4K = 1).
    r = random.Random(3000)
    for _ in range(5):
        kv, hv = uniform(r, 0.5, 3), uniform(r, 0.1, 2)

        def scaled_j0(s, kv=kv):
            return mpmath.besselj(0, 2 * mpmath.sqrt(kv) * s)

        def plain_j0(s):
            return mpmath.besselj(0, s)

        for f, ok in ((scaled_j0, True), (plain_j0, False)):
            value = hv**2 * mpmath.diff(f, hv, 2) + hv * mpmath.diff(f, hv) + 4 * kv * hv**2 * f(hv)
            assert (abs(value) < mpmath.mpf(10) ** -30) == ok


def test_rope_modes_and_boundary_conditions():
    L, g = mpmath.mpf(2), mpmath.mpf("9.81")
    r = random.Random(3100)
    for k in (1, 2, 3, 4):
        K = rope.separation_constant(k, L, g)
        assert same(mpmath.sqrt(K), rope.frequency(k, L, g))
        assert same(rope.frequency(k, L, g) * mpmath.sqrt(L / g), J0_ZEROS[k - 1] / 2)
        for _ in range(4):
            yv = uniform(r, 0.01, 1.99)
            closed = rope.mode_derivatives(k, yv, L)
            assert abs(rope.ode_residual(*closed, yv, K, L, g)) < mpmath.mpf(10) ** -40

            def shape(s, k=k):
                return rope.mode(k, s, L)

            numeric = (shape(yv), mpmath.diff(shape, yv), mpmath.diff(shape, yv, 2))
            assert abs(rope.ode_residual(*numeric, yv, K, L, g)) < mpmath.mpf(10) ** -30
        assert abs(rope.mode(k, mpmath.mpf(0), L)) < mpmath.mpf(10) ** -40  # support
        assert same(rope.mode(k, L, L), 1)  # free end, bounded
        # Free end: the transverse force (L - y) Psi' vanishes for J0, not for Y0.
        near = L - mpmath.mpf(10) ** -20
        assert abs((L - near) * rope.mode_derivatives(k, near, L)[1]) < mpmath.mpf(10) ** -15

        def other(s, K=K):
            return rope.second_solution(K, s, L, g)

        yv = uniform(r, 0.2, 1.8)
        numeric = (other(yv), mpmath.diff(other, yv), mpmath.diff(other, yv, 2))
        assert abs(rope.ode_residual(*numeric, yv, K, L, g)) < mpmath.mpf(10) ** -25
        # (L - y) d/dy Y0(z) = z Y1(z) / 2 (dz/dy = -2 (K/g) / z), which tends to -1/pi.
        z = rope.bessel_argument(near, K, L, g)
        force = z * mpmath.bessely(1, z) / 2
        assert abs(force + 1 / mpmath.pi) < mpmath.mpf(10) ** -6
        numeric_force = (L - near) * mpmath.diff(other, near, h=mpmath.mpf(10) ** -30)
        assert abs(force - numeric_force) < mpmath.mpf(10) ** -15
        # Orthogonality with weight 1 and the normalization used for the shapes.
        norm = mpmath.quad(lambda s, k=k: rope.mode(k, s, L) ** 2, [0, L])
        assert same(norm, L * mpmath.besselj(1, J0_ZEROS[k - 1]) ** 2, 10)
        if k > 1:
            cross = mpmath.quad(lambda s, k=k: rope.mode(k, s, L) * rope.mode(1, s, L), [0, L])
            assert abs(cross) < mpmath.mpf(10) ** -30


# --- numerical confirmation ----------------------------------------------------------------------


@pytest.fixture(scope="module")
def doubling_rows():
    return study(1, 1024)


def test_frequency_convergence_to_the_rope(doubling_rows):
    last = doubling_rows[-1]
    for k in range(3):
        orders = observed_orders(doubling_rows, "freq_error", k)
        assert abs(orders[-1] - 1) < 0.01
        assert abs(last["freq_error"][k] * last["N"] + 0.25) < 0.002
        orders_longer = observed_orders(doubling_rows, "freq_error_longer", k)
        assert abs(orders_longer[-1] - 2) < 0.01
        constant = (float(J0_ZEROS[k]) ** 2 - 2) / 96
        assert abs(last["freq_error_longer"][k] * last["N"] ** 2 / constant - 1) < 0.01


def test_mode_shape_convergence_to_the_rope(doubling_rows):
    for k in range(3):
        orders = observed_orders(doubling_rows, "shape_error", k)
        assert abs(orders[-1] - 1) < 0.02
        orders_longer = observed_orders(doubling_rows, "shape_error_longer", k)
        assert abs(orders_longer[-1] - 2) < 0.02
    assert doubling_rows[-1]["shape_error"][0] < 2e-3


def test_laguerre_structure_of_the_equal_chain():
    """Equal masses and lengths: det(lambda I - A) = (-1)^N N! L_N(lambda) with A = (l/g) M^-1 K,
    so omega_k^2 = (g/l) x_{N,k} over the zeros of the Laguerre polynomial L_N, and the mode
    shapes are x_j proportional to L_{N-j}(x_{N,k})."""
    r = random.Random(3200)
    for count in range(1, 9):
        masses, lengths = lin.uniform_chain(mpmath.mpf(3), mpmath.mpf(2), count)
        g = mpmath.mpf("9.81")
        ell = lengths[0]
        stiffness = lin.x_stiffness_matrix(masses, lengths, g)
        a = mpmath.matrix(
            [[ell / g * stiffness[i][k] / masses[i] for k in range(count)] for i in range(count)]
        )
        for _ in range(3):
            lam = uniform(r, -1, 5)
            det = mpmath.det(lam * mpmath.eye(count) - a)
            assert same(
                det, (-1) ** count * mpmath.factorial(count) * mpmath.laguerre(count, 0, lam), 10
            )
    for count in (8, 64):
        masses, lengths = lin.uniform_chain(MASS, LENGTH, count)
        omega, vectors = lin.normal_modes(masses, lengths, G, 3)
        for k in range(3):
            root = omega[k] ** 2 * lengths[0] / G
            values = [1.0, 1.0 - root]
            for i in range(1, count - 1):
                values.append(((2 * i + 1 - root) * values[i] - i * values[i - 1]) / (i + 1))
            shape = np.array(values[::-1])  # x_j = L_{N-j}(root), j = 1..N
            v = vectors[:, k] / vectors[-1, k]
            assert np.max(np.abs(v - shape)) < 1e-8 * max(1.0, np.max(np.abs(shape)))


def test_verdicts_file_is_complete():
    entries = json.loads((HERE / "verdicts.json").read_text())
    numbers = [entry["number"] for entry in entries]
    assert numbers == [str(n) for n in range(48, 86)]
    allowed = {"ok", "misprint", "wrong", "notation", "unchecked"}
    names = set(globals())
    for entry in entries:
        assert entry["verdict"] in allowed
        if entry["verdict"] == "ok":
            assert entry["problem"] is None and entry["correction_latex"] is None
        else:
            assert entry["problem"]
        if entry["verdict"] == "misprint":
            assert entry["correction_latex"] == pe.ERRATA[entry["number"]]["corrected"]
        if entry["verdict"] == "notation":
            assert entry["number"] in pe.READINGS
        if entry["test"] is not None:
            file_name, _, test_name = entry["test"].partition("::")
            assert file_name == "test_sections_4_5.py" and test_name in names
