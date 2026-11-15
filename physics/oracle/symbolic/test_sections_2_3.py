"""Errata and confirmations for sections 2, 3 and 6 of arXiv:1910.12610v2.

One test per printed equation number, plus the two unnumbered definitions sigma and
phi. Each compares the literal transcription (printed_sections_2_3.py) with the
first-principles expressions (lagrangian.py) by evaluation at 50 digits
(numeric.py). For an equation that is right as printed the identity holds; for a
misprint the test asserts both that the printed form fails and that the corrected
form holds, so this file is the errata. Further tests check prose claims that
connect the equations, and the oracle itself.

Run with -s to see the residual of every comparison.
"""

from __future__ import annotations

import itertools
import json
import math
from pathlib import Path

import lagrangian as lag
import mpmath
import numeric as num
import printed_sections_2_3 as paper
import sympy as sp

HERE = Path(__file__).resolve().parent

# Sibling directories may hold modules with the same names; a run that picked one
# of those up would check the wrong code, so it has to stop here instead.
for _module in (lag, num, paper):
    assert Path(_module.__file__).resolve().parent == HERE, _module.__file__

NS = (1, 2, 3, 4)
half = sp.Rational(1, 2)


def assert_holds(lhs, rhs, label):
    res = num.residual(lhs, rhs)
    print(f"holds  {mpmath.nstr(res, 3):>10}  {label}")
    assert res < num.HOLDS_BELOW, f"{label}: expected an identity, residual {res}"


def assert_fails(lhs, rhs, label):
    res = num.residual(lhs, rhs)
    print(f"fails  {mpmath.nstr(res, 3):>10}  {label}")
    assert res > num.FAILS_ABOVE, f"{label}: expected a clear failure, residual {res}"


def speed_squared(n, i):
    vx, vy = lag.velocities(n)[i]
    return vx**2 + vy**2


PRINTED_TRIPLE = {1: paper.eq_30, 2: paper.eq_31, 3: paper.eq_32}


def printed_triple_total(j):
    return sp.Add(*[term for _, term in PRINTED_TRIPLE[j]()])


def printed_triple_group(j, tag):
    return sp.Add(*[term for t, term in PRINTED_TRIPLE[j]() if t == tag])


def all_indices(ns=NS):
    return [(n, j) for n in ns for j in range(1, n + 1)]


# Section 2: simple pendulum


def test_eq_1():
    """(1) is the n = 1 Euler-Lagrange equation divided by m_1 l_1^2."""
    s = lag.symbols(1)
    el = lag.euler_lagrange(1)[1]
    assert_holds(el, s.m[1] * s.l[1] ** 2 * paper.eq_1(), "(1) EL = m1 l1^2 * printed")
    assert_fails(el, paper.eq_1(), "(1) the factor is m1 l1^2, not 1")


def test_eq_2():
    assert_holds(lag.lagrangian(1), paper.eq_2(), "(2) L, n = 1")


# Section 2: double pendulum


def test_eq_3():
    assert_holds(lag.positions(2)[1][0], paper.eq_3(), "(3) x1")


def test_eq_4():
    assert_holds(lag.positions(2)[1][1], paper.eq_4(), "(4) y1")


def test_eq_5():
    assert_holds(lag.positions(2)[2][0], paper.eq_5(), "(5) x2")


def test_eq_6():
    assert_holds(lag.positions(2)[2][1], paper.eq_6(), "(6) y2")


def test_eq_7():
    dx, dy = lag.differentials(1)[1]
    printed_dx, printed_dy = paper.eq_7()
    assert_holds(dx, printed_dx, "(7) dx1")
    assert_holds(dy, printed_dy, "(7) dy1")


def test_eq_8():
    assert_holds(speed_squared(1, 1), paper.eq_8(), "(8) speed^2 of m1")


def test_eq_9():
    assert_holds(lag.kinetic_energies(1)[1], paper.eq_9(), "(9) K1")


def test_eq_10():
    assert_holds(lag.potential_energies(1)[1], paper.eq_10(), "(10) U1")


def test_eq_11():
    k, u = lag.kinetic_energies(1)[1], lag.potential_energies(1)[1]
    assert_holds(k - u, paper.eq_11(), "(11) L1 = K1 - U1")


def test_eq_12():
    assert_holds(lag.differentials(2)[2][0], paper.eq_12(), "(12) dx2")


def test_eq_13():
    assert_holds(lag.differentials(2)[2][1], paper.eq_13(), "(13) dy2")


def test_eq_14():
    """(14) prints the first angular velocity to the first power."""
    truth = speed_squared(2, 2)
    assert_fails(truth, paper.eq_14(), "(14) as printed")
    assert_holds(truth, paper.eq_14_corrected(), "(14) corrected")


def test_eq_15():
    """(15) lacks the square on the first angular velocity and the 2 of the cross term;
    neither change alone is enough."""
    s = lag.symbols(2)
    th, w, m, ln = s.theta, s.omega, s.m, s.l
    truth = lag.kinetic_energies(2)[2]
    assert_fails(truth, paper.eq_15(), "(15) as printed")
    assert_holds(truth, paper.eq_15_corrected(), "(15) corrected")
    cross = ln[1] * ln[2] * sp.cos(th[1] - th[2]) * w[1] * w[2]
    square_only = half * m[2] * (ln[1] ** 2 * w[1] ** 2 + ln[2] ** 2 * w[2] ** 2 + cross)
    two_only = half * m[2] * (ln[1] ** 2 * w[1] + ln[2] ** 2 * w[2] ** 2 + 2 * cross)
    assert_fails(truth, square_only, "(15) with only the square restored")
    assert_fails(truth, two_only, "(15) with only the 2 restored")


def test_eq_16():
    assert_holds(lag.potential_energies(2)[2], paper.eq_16(), "(16) U2")


def test_eq_17():
    """(17) prints the first angular velocity to the first power."""
    truth = lag.kinetic_energies(2)[2] - lag.potential_energies(2)[2]
    assert_fails(truth, paper.eq_17(), "(17) as printed")
    assert_holds(truth, paper.eq_17_corrected(), "(17) corrected")


def test_eq_18():
    """(18) prints the first angular velocity to the first power in the m_2 term. The
    printed term (1/2) m_2 l_1^2 omega_1 is a total time derivative and drops out, so the
    printed (18) loses m_2 l_1^2 alpha_1 from the theta_1 equation: (19) follows only
    from the corrected (18), while (20) follows from either."""
    s = lag.symbols(2)
    k, u = lag.kinetic_energies(2), lag.potential_energies(2)
    assert_holds(lag.lagrangian(2), (k[1] - u[1]) + (k[2] - u[2]), "(18) L = L1 + L2")
    assert_fails(lag.lagrangian(2), paper.eq_18(), "(18) as printed")
    assert_holds(lag.lagrangian(2), paper.eq_18_corrected(), "(18) corrected")
    from_printed = lag.euler_lagrange_of(paper.eq_18(), 2)
    from_corrected = lag.euler_lagrange_of(paper.eq_18_corrected(), 2)
    assert_fails(from_printed[1], paper.eq_19(), "(19) is not the EL eq. of printed (18)")
    lost = s.m[2] * s.l[1] ** 2 * s.alpha[1]
    assert_holds(from_printed[1] + lost, paper.eq_19(), "(18) printed loses m2 l1^2 alpha1")
    assert_holds(from_corrected[1], paper.eq_19(), "(19) is the EL eq. of corrected (18)")
    assert_holds(from_printed[2], paper.eq_20(), "(20) is the EL eq. of printed (18) too")
    assert_holds(from_corrected[2], paper.eq_20(), "(20) is the EL eq. of corrected (18)")


def test_eq_19():
    assert_holds(lag.euler_lagrange(2)[1], paper.eq_19(), "(19) EL theta1, n = 2, factor 1")


def test_eq_20():
    assert_holds(lag.euler_lagrange(2)[2], paper.eq_20(), "(20) EL theta2, n = 2, factor 1")


# Section 2: triple pendulum


def test_eq_21():
    for truth, printed in zip(lag.positions(3)[1], paper.eq_21(), strict=True):
        assert_holds(truth, printed, "(21) x1, y1")


def test_eq_22():
    for truth, printed in zip(lag.positions(3)[2], paper.eq_22(), strict=True):
        assert_holds(truth, printed, "(22) x2, y2")


def test_eq_23():
    for truth, printed in zip(lag.positions(3)[3], paper.eq_23(), strict=True):
        assert_holds(truth, printed, "(23) x3, y3")


def test_eq_24():
    assert_holds(lag.differentials(3)[3][0], paper.eq_24(), "(24) dx3")


def test_eq_25():
    assert_holds(lag.differentials(3)[3][1], paper.eq_25(), "(25) dy3")


def test_eq_26():
    """(26) prints (theta_1-theta_3) where 2 l_1 l_3 cos(theta_1-theta_3) belongs."""
    dx, dy = lag.differentials(3)[3]
    truth = dx**2 + dy**2
    assert_fails(truth, paper.eq_26(), "(26) as printed")
    assert_holds(truth, paper.eq_26_corrected(), "(26) corrected")


def test_eq_27():
    assert_holds(lag.kinetic_energies(3)[3], paper.eq_27(), "(27) K3")


def test_eq_28():
    assert_holds(lag.potential_energies(3)[3], paper.eq_28(), "(28) U3")


def test_eq_29():
    """L_3 = K_3 - U_3 defines L_3; with it, L = L_1 + L_2 + L_3 as the text says."""
    k, u = lag.kinetic_energies(3), lag.potential_energies(3)
    total = sp.Add(*[paper.eq_29(k[i], u[i]) for i in (1, 2, 3)])
    assert_holds(lag.lagrangian(3), total, "(29) L = L1 + L2 + L3")


def test_eq_30():
    assert_holds(lag.euler_lagrange(3)[1], printed_triple_total(1), "(30) EL theta1, n = 3")


def test_eq_31():
    assert_holds(lag.euler_lagrange(3)[2], printed_triple_total(2), "(31) EL theta2, n = 3")


def test_eq_32():
    assert_holds(lag.euler_lagrange(3)[3], printed_triple_total(3), "(32) EL theta3, n = 3")


# Section 2: the definitions and the pattern formulas


def test_sigma():
    """With sigma, sum_{q>=k}^n m_q sigma_jq l_j l_k cos(theta_j - theta_k) is the (j, k)
    entry of the true mass matrix d^2T/d omega_j d omega_k, for every n, j, k."""
    for n in NS:
        s = lag.symbols(n)
        for j, k in itertools.product(range(1, n + 1), repeat=2):
            built = paper.mass_sum(j, k, n) * s.l[j] * s.l[k] * sp.cos(s.theta[j] - s.theta[k])
            assert_holds(lag.mass_matrix(n)[j, k], built, f"sigma: A_{j}{k}, n = {n}")


def test_phi():
    """phi removes the k = j term of (36); without it that term is (34) again, so the
    l_j^2 alpha_j inertia would be counted twice."""
    for n, j in all_indices():
        with_phi = paper.eq_34(j, n) + paper.eq_36(j, n)
        assert_holds(lag.inertia_term(n, j), with_phi, f"phi: (34)+(36) = d/dt dT/dw, n={n} j={j}")
        without = paper.eq_34(j, n) + paper.eq_36(j, n, phi_=lambda j_, k_: 1)
        assert_fails(lag.inertia_term(n, j), without, f"phi: (36) without phi, n={n} j={j}")
        excess = paper.eq_36(j, n, phi_=lambda j_, k_: 1) - paper.eq_36(j, n)
        assert_holds(excess, paper.eq_34(j, n), f"phi: the excess is (34), n={n} j={j}")


def test_eq_33():
    """(33) is dU/dtheta_j, the gravity terms of (30) to (32); it generalises to any n."""
    for j in (1, 2, 3):
        assert_holds(printed_triple_group(j, "gravity"), paper.eq_33(j), f"(33) terms of j={j}")
    for n, j in all_indices():
        assert_holds(lag.gravity_term(n, j), paper.eq_33(j, n), f"(33) dU/dtheta, n={n} j={j}")


def test_eq_34():
    """(34) is the time derivative of dT/d omega_j for the omega_i^2 part of T."""
    for j in (1, 2, 3):
        assert_holds(printed_triple_group(j, "diagonal"), paper.eq_34(j), f"(34) terms j={j}")
    for n, j in all_indices():
        assert_holds(lag.inertia_diagonal(n, j), paper.eq_34(j, n), f"(34) n={n} j={j}")


def test_eq_35():
    """(35) is -dT/dtheta_j, the sin(theta_j - theta_k) omega omega terms of (30) to (32)."""
    for j in (1, 2, 3):
        assert_holds(printed_triple_group(j, "velocity"), paper.eq_35(j), f"(35) terms j={j}")
    for n, j in all_indices():
        assert_holds(lag.velocity_term(n, j), paper.eq_35(j, n), f"(35) -dT/dtheta n={n} j={j}")


def test_eq_36():
    """(36) is the time derivative of dT/d omega_j for the cross part of T."""
    for j in (1, 2, 3):
        assert_holds(printed_triple_group(j, "bracket"), paper.eq_36(j), f"(36) terms j={j}")
    for n, j in all_indices():
        assert_holds(lag.inertia_off_diagonal(n, j), paper.eq_36(j, n), f"(36) n={n} j={j}")


def test_eq_37():
    """(37), the four patterns assembled, reproduces (30), (31), (32) and the EL equations."""
    for j in (1, 2, 3):
        assert_holds(printed_triple_total(j), paper.eq_37(j), f"(37) = ({29 + j}) as printed")
        assert_holds(lag.euler_lagrange(3)[j], paper.eq_37(j), f"(37) EL n=3 j={j}")


def test_eq_38():
    """(38) is exactly the Euler-Lagrange expression, factor 1, for n = 1..4 and all j."""
    for n, j in all_indices():
        assert_holds(lag.euler_lagrange(n)[j], paper.eq_38(j, n), f"(38) EL n={n} j={j}")


# Section 3: the vector method


def test_eq_39():
    """(39) sums r_n instead of r_i, which gives n r_n; right only for n = 1."""
    for n in NS:
        position = lag.positions(n)[n]
        corrected = paper.eq_39_corrected(n)
        printed = paper.eq_39(n)
        for axis in (0, 1):
            assert_holds(position[axis], corrected[axis], f"(39) corrected, n={n} axis={axis}")
            if n == 1:
                assert_holds(position[axis], printed[axis], f"(39) as printed, n=1 axis={axis}")
            else:
                assert_fails(position[axis], printed[axis], f"(39) as printed n={n} axis={axis}")


def test_eq_40():
    """(40) is the velocity of mass n, the derivative of the corrected (39); the
    derivative of (39) as printed differs from it for n >= 2."""
    for n in NS:
        for axis in (0, 1):
            printed = paper.eq_40(n)[axis]
            assert_holds(lag.velocities(n)[n][axis], printed, f"(40) n={n} axis={axis}")
            from_printed_39 = lag.time_derivative(paper.eq_39(n)[axis], n)
            if n >= 2:
                assert_fails(from_printed_39, printed, f"(40) vs d/dt printed (39), n={n}")


def test_eq_41():
    """The outer equality of (41) holds; its middle side lacks the time derivatives."""
    for n in NS:
        truth = speed_squared(n, n)
        middle, last = paper.eq_41(n)
        middle_corrected, _ = paper.eq_41_corrected(n)
        assert_holds(truth, last, f"(41) |dR_n/dt|^2 = double sum, n={n}")
        assert_fails(truth, middle, f"(41) middle side as printed, n={n}")
        assert_holds(truth, middle_corrected, f"(41) middle side corrected, n={n}")


def test_eq_42():
    """(42) gives every mass the speed of the last one; right only for n = 1."""
    for n in NS:
        assert_holds(lag.kinetic(n), paper.eq_42_corrected(n), f"(42) corrected, n={n}")
        if n == 1:
            assert_holds(lag.kinetic(n), paper.eq_42(n), "(42) as printed, n=1")
        else:
            assert_fails(lag.kinetic(n), paper.eq_42(n), f"(42) as printed, n={n}")


def test_eq_43():
    for n in NS:
        assert_holds(lag.potential(n), paper.eq_43(n), f"(43) U, n={n}")


def test_eq_44():
    """(44) carries the misprint of (42); right only for n = 1."""
    for n in NS:
        assert_holds(lag.lagrangian(n), paper.eq_44_corrected(n), f"(44) corrected, n={n}")
        if n == 1:
            assert_holds(lag.lagrangian(n), paper.eq_44(n), "(44) as printed, n=1")
        else:
            assert_fails(lag.lagrangian(n), paper.eq_44(n), f"(44) as printed, n={n}")


def test_eq_45():
    for n, q in all_indices():
        printed = paper.eq_45(lag.kinetic(n), lag.potential(n), n, q)
        assert_holds(lag.euler_lagrange(n)[q], printed, f"(45) n={n} q={q}")


def test_eq_46_1():
    for n, q in all_indices():
        assert_holds(lag.gravity_term(n, q), paper.eq_46_1(n, q), f"(46.1) n={n} q={q}")


def test_eq_46_2():
    for n in NS:
        kinetic, _, _ = paper.eq_46_2(n, 1)
        assert_holds(lag.kinetic(n), kinetic, f"(46.2) its T is the kinetic energy, n={n}")
    for n, q in all_indices():
        _, middle, last = paper.eq_46_2(n, q)
        assert_holds(middle, last, f"(46.2) second equality, n={n} q={q}")
        assert_holds(lag.velocity_term(n, q), last, f"(46.2) = -dT/dtheta, n={n} q={q}")


def test_eq_46_3():
    for n in NS:
        kinetic, _, _ = paper.eq_46_3(n, 1)
        assert_holds(lag.kinetic_diagonal(n), kinetic, f"(46.3) its sum is the i=j part, n={n}")
    for n, q in all_indices():
        _, left, right = paper.eq_46_3(n, q)
        assert_holds(left, right, f"(46.3) equality, n={n} q={q}")
        assert_holds(lag.inertia_diagonal(n, q), right, f"(46.3) i=j inertia, n={n} q={q}")


def test_eq_46_4():
    """(46.4) carries an extra factor theta_q-dot in its first sum. Read with its heading
    (i != j), the second sum must also leave out i = q, which phi_iq does in (46);
    read with its printed inner sum (all i, j), only the extra factor is wrong."""
    for n in NS:
        kinetic, _, _ = paper.eq_46_4(n, 1, "as printed")
        assert_holds(lag.kinetic(n), kinetic, f"(46.4) printed inner sum is T, n={n}")
        kinetic, _, _ = paper.eq_46_4(n, 1, "i != j")
        cross = lag.kinetic(n) - lag.kinetic_diagonal(n)
        assert_holds(cross, kinetic, f"(46.4) i != j inner sum is the cross part, n={n}")
    for n, q in all_indices():
        for reading in ("as printed", "i != j"):
            _, left, right = paper.eq_46_4(n, q, reading)
            if reading == "as printed" and n == 1:
                # Every i = q term of the extra-factor sum carries sin(0).
                assert_holds(left, right, f"(46.4) printed, all pairs, n=1 q={q}")
            else:
                assert_fails(left, right, f"(46.4) printed, {reading}, n={n} q={q}")
            corrected = paper.eq_46_4_corrected(n, q, reading)
            assert_holds(left, corrected, f"(46.4) corrected, {reading}, n={n} q={q}")
        _, left, _ = paper.eq_46_4(n, q, "i != j")
        factor_only = paper.eq_46_4_corrected(n, q, "as printed")
        assert_fails(left, factor_only, f"(46.4) i != j needs phi too, n={n} q={q}")


def test_eq_46():
    """(46) inherits the extra factor of (46.4): it is the equation of motion only for
    n = 1; without that factor it is exactly the EL expression for all n and q."""
    for n, q in all_indices():
        el = lag.euler_lagrange(n)[q]
        assert_holds(el, paper.eq_46_corrected(n, q), f"(46) corrected, n={n} q={q}")
        if n == 1:
            assert_holds(el, paper.eq_46(n, q), "(46) as printed, n=1")
        else:
            assert_fails(el, paper.eq_46(n, q), f"(46) as printed, n={n} q={q}")


def test_eq_47():
    """(47) is (46) with the sums regrouped, misprint included."""
    for n, q in all_indices():
        el = lag.euler_lagrange(n)[q]
        assert_holds(paper.eq_46(n, q), paper.eq_47(n, q), f"(47) = (46) as printed, n={n} q={q}")
        assert_holds(el, paper.eq_47_corrected(n, q), f"(47) corrected, n={n} q={q}")
        if n == 1:
            assert_holds(el, paper.eq_47(n, q), "(47) as printed, n=1")
        else:
            assert_fails(el, paper.eq_47(n, q), f"(47) as printed, n={n} q={q}")


# Section 6


def test_eq_86():
    """(86), transcribed apart from (38), is the same formula and the same EL expression."""
    for n, j in all_indices():
        assert_holds(paper.eq_38(j, n), paper.eq_86(j, n), f"(86) = (38), n={n} j={j}")
        assert_holds(lag.euler_lagrange(n)[j], paper.eq_86(j, n), f"(86) EL n={n} j={j}")


# Prose claims between the equations


def test_prose_dx_n_squared():
    """Section 2: dx_n = sum_i l_i cos(theta_i) dtheta_i, dy_n = sum_i l_i sin(theta_i)
    dtheta_i, and (dx_n)^2+(dy_n)^2 consists of l_i^2 dtheta_i^2 and the terms
    2 l_k l_m cos(theta_k - theta_m) dtheta_k dtheta_m with 1 <= m < k <= n."""
    for n in NS:
        s = lag.symbols(n)
        th, d, ln = s.theta, s.dtheta, s.l
        dx, dy = lag.differentials(n)[n]
        printed_dx = sp.Add(*[ln[i] * sp.cos(th[i]) * d[i] for i in range(1, n + 1)])
        printed_dy = sp.Add(*[ln[i] * sp.sin(th[i]) * d[i] for i in range(1, n + 1)])
        assert_holds(dx, printed_dx, f"prose dx_n, n={n}")
        assert_holds(dy, printed_dy, f"prose dy_n, n={n}")
        claimed = sp.Add(*[ln[i] ** 2 * d[i] ** 2 for i in range(1, n + 1)]) + sp.Add(
            *[
                2 * ln[k] * ln[m] * sp.cos(th[k] - th[m]) * d[k] * d[m]
                for k in range(1, n + 1)
                for m in range(1, k)
            ]
        )
        assert_holds(dx**2 + dy**2, claimed, f"prose (dx_n)^2+(dy_n)^2, n={n}")


def test_prose_46_and_38_are_the_same():
    """Section 3: "When (46) is compared with (38), they are exactly the same except
    summation form." False as printed for n >= 2; true term by term once the extra
    factor of (46) is removed."""
    for n, q in all_indices():
        if n >= 2:
            assert_fails(paper.eq_38(q, n), paper.eq_46(n, q), f"prose: printed (46) vs (38) n={n}")
        a = paper.eq_38_terms(q, n)
        b = paper.eq_46_terms(n, q, corrected=True)
        assert_holds(a["gravity"], b["gravity"], f"prose: gravity sums, n={n} q={q}")
        assert_holds(a["velocity"], b["velocity"], f"prose: velocity sums, n={n} q={q}")
        assert_holds(a["diagonal"], b["diagonal"], f"prose: diagonal sums, n={n} q={q}")
        brackets = b["bracket_sin"] + b["bracket_cos"]
        assert_holds(a["bracket"], brackets, f"prose: bracket sums, n={n} q={q}")


# The oracle itself


def test_oracle_routes_agree():
    """Three ways to the Euler-Lagrange expressions give the same result."""
    for n, j in all_indices():
        reference = lag.euler_lagrange(n)[j]
        assert_holds(reference, lag.euler_lagrange_by_sympy(n)[j], f"sympy route n={n} j={j}")
        assert_holds(
            reference, lag.euler_lagrange_of(lag.lagrangian(n), n)[j], f"chain n={n} j={j}"
        )
        parts = lag.inertia_term(n, j) + lag.velocity_term(n, j) + lag.gravity_term(n, j)
        assert_holds(reference, parts, f"pieces n={n} j={j}")


def test_oracle_compact_form():
    """The compact form, in summed and in matrix shape, for n = 1..6."""
    for n in range(1, 7):
        s = lag.symbols(n)
        a, b = lag.compact_mass_matrix(n), lag.compact_forcing(n)
        for j in range(1, n + 1):
            el = lag.euler_lagrange(n)[j]
            assert_holds(el, lag.compact_eom(n, j), f"compact n={n} j={j}")
            row = sp.Add(*[a[j, k] * s.alpha[k] for k in range(1, n + 1)])
            assert_holds(el, row - b[j], f"matrix form n={n} j={j}")
            for k in range(1, n + 1):
                assert_holds(lag.mass_matrix(n)[j, k], a[j, k], f"A_{j}{k} n={n}")
        # A must be invertible in every state for the form A alpha = b to be usable;
        # Cholesky succeeds exactly when A is positive definite.
        entries = {key: num.evaluate(value) for key, value in a.items()}
        with mpmath.workdps(num.DIGITS):
            for p in range(len(num.POINTS)):
                matrix = mpmath.matrix(n, n)
                for (j, k), values in entries.items():
                    matrix[j - 1, k - 1] = values[p]
                mpmath.cholesky(matrix)


def test_oracle_separates_a_one_symbol_change():
    """A true identity sits near 1e-48, a one-symbol change far above 1e-3."""
    s = lag.symbols(2)
    swapped = paper.eq_19().subs(s.omega[2] ** 2, s.omega[1] ** 2)
    assert_holds(lag.euler_lagrange(2)[1], paper.eq_19(), "control: (19)")
    assert_fails(lag.euler_lagrange(2)[1], swapped, "control: (19) with omega2 -> omega1")


def test_oracle_points_are_generic():
    """Angles and their differences keep away from multiples of pi/2 (by 0.2 in sine
    and cosine for the first four, which every check of the paper uses, by 0.12 for
    all six); the other quantities are bounded away from zero and pairwise distinct."""
    s = lag.symbols(num.N_MAX)
    assert len(num.POINTS) >= 5
    for point in num.POINTS:
        angles = [float(point[s.theta[i]]) for i in range(1, num.N_MAX + 1)]
        for count, margin in ((4, 0.2), (num.N_MAX, 0.12)):
            chosen = angles[:count]
            for x in chosen + [a - b for a, b in itertools.combinations(chosen, 2)]:
                assert abs(math.sin(x)) > margin and abs(math.cos(x)) > margin
        for group in (s.omega, s.alpha, s.m, s.l):
            values = [point[group[i]] for i in range(1, num.N_MAX + 1)]
            assert all(abs(v) > 0.3 for v in values)
            assert all(abs(a - b) > 0.09 for a, b in itertools.combinations(values, 2))


# The verdicts file


RANGE = [str(k) for k in range(1, 46)] + ["46.1", "46.2", "46.3", "46.4", "46", "47"]
RANGE += ["sigma", "phi", "86"]
VERDICTS = {"ok", "misprint", "wrong", "notation", "unchecked"}


def test_verdicts_file():
    entries = json.loads((HERE / "verdicts.json").read_text())
    numbers = [e["number"] for e in entries]
    assert sorted(numbers) == sorted(RANGE), set(numbers) ^ set(RANGE)
    assert set(paper.PRINTED) == set(RANGE)
    for entry in entries:
        keys = {"number", "verdict", "problem", "correction_latex", "checked_for", "how", "test"}
        assert set(entry) == keys, entry["number"]
        assert entry["verdict"] in VERDICTS, entry["number"]
        file_name, _, test_name = entry["test"].partition("::")
        assert file_name == Path(__file__).name, entry["number"]
        assert callable(globals().get(test_name)), entry["test"]
        if entry["verdict"] == "ok":
            assert entry["problem"] is None and entry["correction_latex"] is None, entry
        else:
            assert entry["problem"], entry["number"]
        if entry["verdict"] == "misprint":
            assert entry["correction_latex"], entry["number"]
            assert entry["number"] in paper.CORRECTED, entry["number"]
    misprints = {e["number"] for e in entries if e["verdict"] == "misprint"}
    assert misprints == set(paper.CORRECTED)
