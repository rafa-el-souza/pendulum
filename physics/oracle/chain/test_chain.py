"""Tests of chain.py: the planar chain pendulum solved through its rod tensions.

The expected values never come from chain.py's own algebra.  They come from
closed forms derived from Newton's law where it can be solved by hand, from
dense.py (the same Newton problem as one dense KKT system), from highprec.py
(the tension system at 40 to 80 digits, read back through the full Cartesian
accelerations), from Newton's law and the rod constraints evaluated directly
with the returned numbers, from conservation of energy, and from symmetries of
the physics.  No test uses the equations of motion in generalized coordinates.
"""

import itertools
import math
from fractions import Fraction

import dense
import highprec
import numpy as np
import pytest
from scipy.integrate import solve_ivp

import chain

EPS = float(np.finfo(np.float64).eps)
SIZES = [1, 2, 3, 5, 8, 16, 64, 256]
ANGLES = ["small", "large", "many turns"]
SPEEDS = ["rest", "moderate", "fast"]


def seeded(*keys: int) -> np.random.Generator:
    return np.random.default_rng([20261115, *keys])


def random_state(rng, n, angles="large", speeds="moderate", mass_spread=10.0):
    """Unequal masses and lengths, log-uniform in [1/spread, spread] (lengths: 5)."""
    m = mass_spread ** rng.uniform(-1.0, 1.0, n)
    lengths = 5.0 ** rng.uniform(-1.0, 1.0, n)
    g = rng.uniform(1.0, 20.0)
    if angles == "small":
        theta = rng.normal(0.0, 0.2, n)
    elif angles == "large":
        theta = rng.uniform(-np.pi, np.pi, n)
    else:
        theta = rng.uniform(-6.0 * np.pi, 6.0 * np.pi, n)
    # Speeds in units of each rod's own pendulum frequency; "fast" makes the
    # centripetal terms about a hundred times the gravitational ones.
    spread = {"rest": 0.0, "moderate": 1.0, "fast": 10.0}[speeds]
    omega = spread * rng.normal(0.0, 1.0, n) * np.sqrt(g / lengths)
    return theta, omega, m, lengths, g


def all_regimes(rng, n):
    return [random_state(rng, n, a, s) for a in ANGLES for s in SPEEDS]


def rod_frames(theta):
    """e_i, the unit vector from mass i-1 to mass i, and n_i = de_i/dtheta_i."""
    e = np.column_stack((np.sin(theta), -np.cos(theta)))
    normal = np.column_stack((np.cos(theta), np.sin(theta)))
    return e, normal


def kinematics(theta, omega, alpha, lengths):
    """Velocities and accelerations of the masses implied by (theta, omega, alpha).

    r_i = sum_{k<=i} l_k e_k, so v_i = sum_{k<=i} l_k omega_k n_k and
    a_i = sum_{k<=i} l_k (alpha_k n_k - omega_k^2 e_k).  The third result is, per
    mass, the sum of the magnitudes of the terms of a_i: the scale of its rounding.
    """
    e, normal = rod_frames(theta)
    velocity = np.cumsum((lengths * omega)[:, None] * normal, axis=0)
    terms = lengths[:, None] * (alpha[:, None] * normal - (omega**2)[:, None] * e)
    size = np.cumsum(lengths * (np.abs(alpha) + omega**2))
    return velocity, np.cumsum(terms, axis=0), size


def newton_accelerations(theta, tension, m, g):
    """a_i = (0, -g) + (T_{i+1} e_{i+1} - T_i e_i) / m_i with T_{n+1} = 0, and the
    sum of the magnitudes of its terms."""
    e, _ = rod_frames(theta)
    below = np.append(tension[1:], 0.0)
    e_below = np.vstack((e[1:], np.zeros((1, 2))))
    acceleration = (below[:, None] * e_below - tension[:, None] * e) / m[:, None]
    acceleration[:, 1] -= g
    return acceleration, g + (np.abs(below) + np.abs(tension)) / m


def angular_scale(alpha, omega, lengths, g):
    """Size of what an angular acceleration is made of: alpha itself, the
    centripetal omega_i^2 and the gravitational g / l_i."""
    return np.max(np.abs(alpha)) + np.max(omega**2 + g / lengths)


def normwise(x, reference):
    return np.max(np.abs(x - reference)) / np.max(np.abs(reference))


def rounded_differences(theta) -> int:
    """How many joint differences theta_{i+1} - theta_i float64 cannot hold exactly."""
    return sum(
        Fraction(b) - Fraction(a) != Fraction(float(b - a)) for a, b in itertools.pairwise(theta)
    )


def energy_rate(state, d_theta, d_omega, h):
    """d/dt of chain.energy along (theta, omega) + t (d_theta, d_omega) at t = 0, by
    the fourth-order central difference with step h."""
    theta, omega, m, lengths, g = state

    def at(t):
        return chain.energy(theta + t * d_theta, omega + t * d_omega, m, lengths, g)

    return (8.0 * (at(h) - at(-h)) - (at(2 * h) - at(-2 * h))) / (12.0 * h)


# --- Closed forms from Newton's law ------------------------------------------


def test_single_rod_is_the_simple_pendulum():
    """n = 1 against the elementary pendulum: alpha = -(g/l) sin theta, and the
    radial part of Newton's law, T = m (l omega^2 + g cos theta)."""
    rng = seeded(1)
    for _ in range(200):
        theta = rng.uniform(-10.0, 10.0, 1)
        omega = rng.normal(0.0, 5.0, 1)
        m = 10.0 ** rng.uniform(-3.0, 3.0, 1)
        lengths = 10.0 ** rng.uniform(-2.0, 2.0, 1)
        g = rng.uniform(0.5, 30.0)
        alpha, tension = chain.solve(theta, omega, m, lengths, g)
        th, om, mass, length = theta[0], omega[0], m[0], lengths[0]
        assert abs(alpha[0] + (g / length) * math.sin(th)) <= 4 * EPS * g / length
        expected = mass * (length * om**2 + g * math.cos(th))
        assert abs(tension[0] - expected) <= 4 * EPS * mass * (length * om**2 + g)


@pytest.mark.parametrize("n", [1, 2, 5, 64, 1000])
def test_hanging_rest_state(n):
    """theta = omega = 0: no angular acceleration, and each rod carries the weight
    of everything below it, T_i = g * sum_{k>=i} m_k."""
    rng = seeded(2, n)
    m = 10.0 ** rng.uniform(-1.0, 1.0, n)
    lengths = 5.0 ** rng.uniform(-1.0, 1.0, n)
    g = 9.81
    alpha, tension = chain.solve(np.zeros(n), np.zeros(n), m, lengths, g)
    assert np.all(alpha == 0.0)
    below = np.cumsum(m[::-1])[::-1]
    np.testing.assert_allclose(tension, g * below, rtol=4 * n * EPS, atol=0.0)


@pytest.mark.parametrize("folded", [False, True], ids=["straight", "folded"])
@pytest.mark.parametrize("n", [1, 2, 3, 8, 64, 1000, 100_000])
def test_collinear_chain_closed_form(n, folded):
    """Every rod on one line, straight or folded back at random joints, with
    arbitrary angular velocities.  All rod forces are then parallel to e_1, so
    Newton's law along n_1 gives every mass the normal acceleration -g sin theta_1,
    which the kinematics turn into alpha_1 = -(g/l_1) sin theta_1 and alpha_k = 0
    for k >= 2.  Along e_1 it gives the tensions:
        sigma_i T_i = sum_{j>=i} m_j (g cos theta_1 + sum_{k<=j} sigma_k l_k omega_k^2)
    with sigma_k = e_k . e_1 = +-1.  The 100 000-rod chain also shows that the solve
    needs neither a dense matrix nor quadratic time."""
    rng = seeded(3, n, int(folded))
    m = 10.0 ** rng.uniform(-1.0, 1.0, n)
    lengths = 5.0 ** rng.uniform(-1.0, 1.0, n)
    g = 9.81
    theta1 = rng.uniform(-np.pi, np.pi)
    sigma = np.ones(n)
    if folded:
        sigma[1:] = rng.choice([-1.0, 1.0], n - 1)
    theta = np.where(sigma > 0, theta1, theta1 + np.pi)
    omega = 3.0 * rng.normal(0.0, 1.0, n) * np.sqrt(g / lengths)

    alpha, tension = chain.solve(theta, omega, m, lengths, g)

    along = g * math.cos(theta1) + np.cumsum(sigma * lengths * omega**2)
    expected = sigma * np.cumsum((m * along)[::-1])[::-1]
    size = np.cumsum((m * (g + np.cumsum(lengths * omega**2)))[::-1])[::-1]
    assert np.all(np.abs(tension - expected) <= 8 * n * EPS * size)

    expected_alpha = np.zeros(n)
    expected_alpha[0] = -(g / lengths[0]) * math.sin(theta1)
    # Adding a rounded pi folds a joint only to within an ulp or two, which
    # leaves angular accelerations of that relative size instead of zero.
    pull = np.append(size[1:], 0.0) / m + np.append(0.0, size[:-1] / m[:-1])
    allowed = 8 * EPS * (pull + g) / lengths
    assert np.all(np.abs(alpha - expected_alpha) <= allowed)


# --- Independent solvers -----------------------------------------------------


@pytest.mark.parametrize("speeds", SPEEDS)
@pytest.mark.parametrize("angles", ANGLES)
@pytest.mark.parametrize("n", SIZES)
def test_matches_dense_kkt_solve(n, angles, speeds):
    """chain.py's O(n) tension solve against dense.py's LU solve of the full KKT
    system in 2n Cartesian accelerations and n multipliers, which shares no code
    with it.  Masses 0.1 to 10, lengths 0.2 to 5, all unequal.  Agreement to 1e-11
    of the angular scale and of the largest tension (measured: 6e-14 and 4e-14,
    nearly all of it dense.py's own rounding, whose LU differs between BLAS builds;
    an algebra slip shows up at order one)."""
    rng = seeded(4, n, ANGLES.index(angles), SPEEDS.index(speeds))
    for _ in range(3 if n <= 64 else 1):
        theta, omega, m, lengths, g = random_state(rng, n, angles, speeds)
        alpha, tension = chain.solve(theta, omega, m, lengths, g)
        alpha_kkt, tension_kkt, _ = dense.solve(theta, omega, m, lengths, g)
        scale = angular_scale(alpha_kkt, omega, lengths, g)
        assert np.max(np.abs(alpha - alpha_kkt)) <= 1e-11 * scale
        assert normwise(tension, tension_kkt) <= 1e-11


@pytest.mark.parametrize("n", SIZES)
def test_matches_arbitrary_precision_on_random_states(n):
    """chain.py against highprec.py, which takes the same float64 inputs as exact
    and works at 40 digits: normwise relative error of alpha and of T below 1e-13
    in every regime (measured: at most 1.8e-15 and 8e-16)."""
    rng = seeded(5, n)
    for theta, omega, m, lengths, g in all_regimes(rng, n):
        alpha, tension = chain.solve(theta, omega, m, lengths, g)
        ref_alpha, ref_tension = highprec.solve_float(theta, omega, m, lengths, g, dps=40)
        assert normwise(alpha, ref_alpha) <= 1e-13
        assert normwise(tension, ref_tension) <= 1e-13


@pytest.mark.parametrize("shape", ["hanging", "inverted", "swinging"])
def test_long_chain_matches_arbitrary_precision(shape):
    """4096 equal masses on a chain of total length 1, where the tension system is
    worst conditioned (its condition number grows like n^2): nearly straight
    hanging, nearly straight upside down, and a smooth swinging shape."""
    n = 4096
    rng = seeded(6, ["hanging", "inverted", "swinging"].index(shape))
    lengths = np.full(n, 1.0 / n)
    m = np.ones(n)
    arc = np.arange(1, n + 1) / n
    if shape == "hanging":
        theta, omega = rng.normal(0.0, 1e-2, n), rng.normal(0.0, 1e-2, n)
    elif shape == "inverted":
        theta, omega = np.pi + rng.normal(0.0, 1e-2, n), rng.normal(0.0, 1e-2, n)
    else:
        theta, omega = 0.5 * np.sin(np.pi * arc), 0.3 * np.cos(np.pi * arc)
    alpha, tension = chain.solve(theta, omega, m, lengths, 9.81)
    ref_alpha, ref_tension = highprec.solve_float(theta, omega, m, lengths, 9.81, dps=40)
    assert normwise(alpha, ref_alpha) <= 1e-13
    assert normwise(tension, ref_tension) <= 1e-13


@pytest.mark.parametrize("decades", [6, 12])
@pytest.mark.parametrize("n", [8, 64])
def test_extreme_mass_ratios_match_arbitrary_precision(n, decades):
    """Masses log-uniform over 2 * decades orders of magnitude, so the largest
    mass ratio reaches 1e12 or 1e24."""
    rng = seeded(7, n, decades)
    for _ in range(3):
        theta, omega, m, lengths, g = random_state(rng, n, mass_spread=10.0**decades)
        alpha, tension = chain.solve(theta, omega, m, lengths, g)
        ref_alpha, ref_tension = highprec.solve_float(theta, omega, m, lengths, g, dps=80)
        assert normwise(alpha, ref_alpha) <= 1e-13
        assert normwise(tension, ref_tension) <= 1e-13


@pytest.mark.parametrize("offset", [1e-6, 1e-9, 1e-12])
def test_nearly_folded_joint_between_extreme_masses(offset):
    """Rod 2 folded back to within `offset` of rod 1, between masses 1e-10 and 1e10.
    alpha then hinges on the relative accuracy of sin(theta_2 - theta_1), and the
    float64 difference of two angles is rounded near pi (it is exact near 0).
    chain.py carries the difference exactly; rounding it instead gives errors of
    1e-10, 1e-7 and 1e-4 here (measured)."""
    theta1 = -2.2
    theta = np.array([theta1, theta1 + np.pi + offset, 0.3])
    assert rounded_differences(theta) >= 1
    omega = np.array([0.7, -1.3, 0.4])
    m = np.array([1e-10, 1e10, 1.0])
    lengths = np.array([1.0, 0.8, 1.2])
    alpha, tension = chain.solve(theta, omega, m, lengths, 9.81)
    ref_alpha, ref_tension = highprec.solve_float(theta, omega, m, lengths, 9.81, dps=80)
    assert normwise(alpha, ref_alpha) <= 1e-13
    assert normwise(tension, ref_tension) <= 1e-13


@pytest.mark.parametrize("turns", [1e3, 1e6, 1e9])
def test_angles_far_beyond_one_turn(turns):
    """Angles of alternating sign and magnitude about `turns` radians, as an
    integrator that never wraps them could produce: the joint differences are
    rounded in float64, yet alpha and T stay accurate."""
    rng = seeded(8, int(math.log10(turns)))
    n = 16
    theta = (-1.0) ** np.arange(n) * turns * rng.uniform(0.5, 1.0, n)
    assert rounded_differences(theta) >= n // 4
    _, omega, m, lengths, g = random_state(rng, n)
    alpha, tension = chain.solve(theta, omega, m, lengths, g)
    ref_alpha, ref_tension = highprec.solve_float(theta, omega, m, lengths, g, dps=40)
    assert normwise(alpha, ref_alpha) <= 1e-13
    assert normwise(tension, ref_tension) <= 1e-13


# --- Newton's law, the constraints and energy, with the returned numbers ------


@pytest.mark.parametrize("n", [*SIZES, 1024])
def test_newton_law_holds_for_every_mass(n):
    """m_i a_i = m_i (0, -g) - T_i e_i + T_{i+1} e_{i+1} for every mass, where a_i is
    the acceleration that the returned alpha implies through the kinematics and T
    the returned tensions.  These 2n equations in the 2n unknowns (alpha, T) have a
    single solution, so this check alone pins both down.  Residual below 64 eps of
    the sum of the magnitudes of its terms (measured: a few eps at most)."""
    rng = seeded(9, n)
    for theta, omega, m, lengths, g in all_regimes(rng, n):
        alpha, tension = chain.solve(theta, omega, m, lengths, g)
        _, acceleration, size = kinematics(theta, omega, alpha, lengths)
        e, _ = rod_frames(theta)
        below = np.append(tension[1:], 0.0)
        e_below = np.vstack((e[1:], np.zeros((1, 2))))
        force = tension[:, None] * e - below[:, None] * e_below
        force[:, 1] += m * g
        residual = m[:, None] * acceleration + force
        scale = m * size + m * g + np.abs(tension) + np.abs(below)
        assert np.all(np.hypot(residual[:, 0], residual[:, 1]) <= 64 * EPS * scale)


@pytest.mark.parametrize("n", [*SIZES, 1024])
def test_rod_lengths_have_zero_second_derivative(n):
    """With the Cartesian accelerations Newton's law gives for the returned
    tensions, d^2/dt^2 |r_i - r_{i-1}|^2 / 2 = (r_i - r_{i-1}) . (a_i - a_{i-1})
    + |v_i - v_{i-1}|^2 vanishes for every rod, to 128 eps of its terms (measured:
    a few eps at most); and the returned alpha_i is the normal component of
    a_i - a_{i-1} divided by l_i, the way it is meant to be read."""
    rng = seeded(10, n)
    for theta, omega, m, lengths, g in all_regimes(rng, n):
        alpha, tension = chain.solve(theta, omega, m, lengths, g)
        acceleration, size = newton_accelerations(theta, tension, m, g)
        relative = acceleration - np.vstack((np.zeros((1, 2)), acceleration[:-1]))
        relative_size = size + np.append(0.0, size[:-1])
        e, normal = rod_frames(theta)
        rod = lengths[:, None] * e
        stretch = np.sum(rod * relative, axis=1) + (lengths * omega) ** 2
        allowed = 128 * EPS * (lengths * relative_size + (lengths * omega) ** 2)
        assert np.all(np.abs(stretch) <= allowed)
        turning = np.sum(normal * relative, axis=1) / lengths
        assert np.all(np.abs(turning - alpha) <= 128 * EPS * relative_size / lengths)


@pytest.mark.parametrize("n", [*SIZES, 1024])
def test_instantaneous_power_balance(n):
    """dE/dt = sum_i v_i . (m_i a_i - m_i (0, -g)) with a_i from the returned alpha,
    evaluated at one instant with no integration: zero to 64 eps of the sum of the
    magnitudes of its terms (measured: below 1 eps)."""
    rng = seeded(11, n)
    for theta, omega, m, lengths, g in all_regimes(rng, n):
        alpha = chain.accelerations(theta, omega, m, lengths, g)
        velocity, acceleration, size = kinematics(theta, omega, alpha, lengths)
        net = m[:, None] * acceleration
        net[:, 1] += m * g
        power = np.sum(velocity * net)
        speed_size = np.cumsum(lengths * np.abs(omega))
        assert abs(power) <= 64 * EPS * np.sum(speed_size * m * (size + g))


@pytest.mark.parametrize("n", [1, 2, 3, 8, 64])
def test_energy_is_stationary_along_the_flow(n):
    """chain.energy differentiated numerically along the flow, (theta, omega)
    moving with (omega, alpha), by a fourth-order central difference: the rate
    vanishes to 1e-8 of its two parts, the rate from the angles alone and the rate
    from the angular velocities alone, which do not vanish (measured: 1.3e-10, the
    truncation and rounding of the difference quotient).  This checks energy() and
    accelerations() together."""
    rng = seeded(12, n)
    for angles in ANGLES:
        for speeds in ["moderate", "fast"]:
            theta, omega, m, lengths, g = random_state(rng, n, angles, speeds)
            alpha = chain.accelerations(theta, omega, m, lengths, g)
            # A thousandth of the natural time scale balances truncation, of
            # order (h / time scale)^4, against rounding, of order eps / h.
            h = 1e-3 / math.sqrt(angular_scale(alpha, omega, lengths, g))
            state = (theta, omega, m, lengths, g)
            from_angles = energy_rate(state, omega, np.zeros(n), h)
            from_speeds = energy_rate(state, np.zeros(n), alpha, h)
            total = energy_rate(state, omega, alpha, h)
            assert abs(total) <= 1e-8 * (abs(from_angles) + abs(from_speeds))


@pytest.mark.parametrize("n", [2, 3, 5, 8])
def test_energy_is_conserved_along_trajectories(n):
    """Ten seconds of chaotic motion from large angles, integrated by DOP853 at
    rtol = atol = 1e-6, 1e-9 and 1e-12: the largest energy drift, relative to the
    energy scale, stays within 100 times the tolerance and shrinks at least
    thirtyfold with every thousandfold tightening (measured: drift 0.6 to 18 times
    the tolerance, shrinking 120- to 10 000-fold per step)."""
    rng = seeded(13, n)
    m = 2.0 ** rng.uniform(-1.0, 1.0, n)
    lengths = 2.0 ** rng.uniform(-1.0, 1.0, n)
    g = 9.81
    theta0 = rng.uniform(-2.5, 2.5, n)
    omega0 = rng.normal(0.0, 1.0, n)

    def rhs(_t, z):
        return np.concatenate((z[n:], chain.accelerations(z[:n], z[n:], m, lengths, g)))

    e0 = chain.energy(theta0, omega0, m, lengths, g)
    kinetic0 = e0 - chain.energy(theta0, np.zeros(n), m, lengths, g)
    scale = g * np.sum(m * np.cumsum(lengths)) + kinetic0
    drifts = []
    for tol in (1e-6, 1e-9, 1e-12):
        sol = solve_ivp(
            rhs,
            (0.0, 10.0),
            np.concatenate((theta0, omega0)),
            method="DOP853",
            rtol=tol,
            atol=tol,
            t_eval=np.linspace(0.0, 10.0, 201),
        )
        assert sol.success
        energies = np.array([chain.energy(z[:n], z[n:], m, lengths, g) for z in sol.y.T])
        drift = np.max(np.abs(energies - e0)) / scale
        assert drift <= 100 * tol
        drifts.append(drift)
    assert drifts[1] * 30 <= drifts[0]
    assert drifts[2] * 30 <= drifts[1]


def test_energy_of_a_single_rod():
    """E = m l^2 omega^2 / 2 - m g l cos theta."""
    rng = seeded(14)
    for _ in range(100):
        theta, omega = rng.uniform(-10.0, 10.0, 1), rng.normal(0.0, 5.0, 1)
        m, lengths, g = 10.0 ** rng.uniform(-2.0, 2.0, 1), 5.0 ** rng.uniform(-1.0, 1.0, 1), 9.81
        kinetic = 0.5 * m[0] * (lengths[0] * omega[0]) ** 2
        potential = -m[0] * g * lengths[0] * math.cos(theta[0])
        expected = kinetic + potential
        got = chain.energy(theta, omega, m, lengths, g)
        assert abs(got - expected) <= 8 * EPS * (kinetic + abs(potential))


@pytest.mark.parametrize("n", [2, 3, 8, 64])
def test_energy_sums_kinetic_and_potential_over_the_masses(n):
    """chain.energy against a mass-by-mass walk down the chain."""
    rng = seeded(15, n)
    for theta, omega, m, lengths, g in all_regimes(rng, n):
        x = y = vx = vy = 0.0
        kinetic = potential = size = 0.0
        for i in range(n):
            x += lengths[i] * math.sin(theta[i])
            y -= lengths[i] * math.cos(theta[i])
            vx += lengths[i] * omega[i] * math.cos(theta[i])
            vy += lengths[i] * omega[i] * math.sin(theta[i])
            kinetic += 0.5 * m[i] * (vx * vx + vy * vy)
            potential += m[i] * g * y
            size += m[i] * g * np.sum(lengths[: i + 1])
        got = chain.energy(theta, omega, m, lengths, g)
        assert abs(got - (kinetic + potential)) <= 8 * n * EPS * (kinetic + size)


# --- Symmetries --------------------------------------------------------------

METAMORPHIC_SIZES = [1, 2, 3, 8, 64]


@pytest.mark.parametrize("n", METAMORPHIC_SIZES)
def test_mirror_symmetry(n):
    """Reflection in the vertical through the pivot, (theta, omega) -> (-theta,
    -omega), reverses alpha and keeps the tensions."""
    for theta, omega, m, lengths, g in all_regimes(seeded(16, n), n):
        alpha, tension = chain.solve(theta, omega, m, lengths, g)
        alpha_m, tension_m = chain.solve(-theta, -omega, m, lengths, g)
        assert np.max(np.abs(alpha_m + alpha)) <= 4 * EPS * angular_scale(alpha, omega, lengths, g)
        assert normwise(tension_m, tension) <= 4 * EPS


@pytest.mark.parametrize("n", METAMORPHIC_SIZES)
def test_time_reversal(n):
    """omega -> -omega leaves alpha and the tensions unchanged."""
    for theta, omega, m, lengths, g in all_regimes(seeded(17, n), n):
        alpha, tension = chain.solve(theta, omega, m, lengths, g)
        alpha_r, tension_r = chain.solve(theta, -omega, m, lengths, g)
        assert np.max(np.abs(alpha_r - alpha)) <= 4 * EPS * angular_scale(alpha, omega, lengths, g)
        assert normwise(tension_r, tension) <= 4 * EPS


@pytest.mark.parametrize("n", METAMORPHIC_SIZES)
def test_mass_scaling(n):
    """Scaling every mass by one constant leaves alpha unchanged and scales the
    tensions by that constant (3.7, which rounds, unlike a power of two)."""
    c = 3.7
    for theta, omega, m, lengths, g in all_regimes(seeded(18, n), n):
        alpha, tension = chain.solve(theta, omega, m, lengths, g)
        alpha_c, tension_c = chain.solve(theta, omega, c * m, lengths, g)
        assert np.max(np.abs(alpha_c - alpha)) <= 64 * EPS * angular_scale(alpha, omega, lengths, g)
        assert normwise(tension_c, c * tension) <= 64 * EPS


@pytest.mark.parametrize("n", METAMORPHIC_SIZES)
def test_length_and_gravity_scaling(n):
    """Scaling every length and g by one constant leaves alpha unchanged (with omega
    held fixed) and scales the tensions by that constant."""
    c = 0.37
    for theta, omega, m, lengths, g in all_regimes(seeded(19, n), n):
        alpha, tension = chain.solve(theta, omega, m, lengths, g)
        alpha_c, tension_c = chain.solve(theta, omega, m, c * lengths, c * g)
        assert np.max(np.abs(alpha_c - alpha)) <= 64 * EPS * angular_scale(alpha, omega, lengths, g)
        assert normwise(tension_c, c * tension) <= 64 * EPS


@pytest.mark.parametrize("n", METAMORPHIC_SIZES)
def test_time_scaling(n):
    """Running time s times faster, omega -> s omega with g -> s^2 g, multiplies
    alpha and the tensions by s^2."""
    s = 1.7
    for theta, omega, m, lengths, g in all_regimes(seeded(20, n), n):
        alpha, tension = chain.solve(theta, omega, m, lengths, g)
        alpha_s, tension_s = chain.solve(theta, s * omega, m, lengths, s * s * g)
        scale = angular_scale(alpha, omega, lengths, g)
        assert np.max(np.abs(alpha_s - s * s * alpha)) <= 64 * EPS * s * s * scale
        assert normwise(tension_s, s * s * tension) <= 64 * EPS


@pytest.mark.parametrize("n", METAMORPHIC_SIZES)
def test_whole_turns(n):
    """Adding whole turns to any angles changes nothing, up to the rounding of
    theta + 2 pi k itself (a few 1e-15 rad here)."""
    rng = seeded(21, n)
    for theta, omega, m, lengths, g in all_regimes(rng, n):
        turned = theta + 2.0 * np.pi * rng.integers(-3, 4, n)
        alpha, tension = chain.solve(theta, omega, m, lengths, g)
        alpha_t, tension_t = chain.solve(turned, omega, m, lengths, g)
        assert np.max(np.abs(alpha_t - alpha)) <= 1e-12 * angular_scale(alpha, omega, lengths, g)
        assert normwise(tension_t, tension) <= 1e-12


# --- Interface ---------------------------------------------------------------


def test_wrappers_agree_and_inputs_are_left_alone():
    theta, omega, m, lengths, g = random_state(seeded(22), 5)
    copies = [a.copy() for a in (theta, omega, m, lengths)]
    alpha, tension = chain.solve(theta, omega, m, lengths, g)
    np.testing.assert_array_equal(chain.accelerations(theta, omega, m, lengths, g), alpha)
    np.testing.assert_array_equal(chain.tensions(theta, omega, m, lengths, g), tension)
    as_lists = chain.accelerations(theta.tolist(), omega.tolist(), m.tolist(), lengths.tolist(), g)
    np.testing.assert_array_equal(as_lists, alpha)
    for original, copy in zip((theta, omega, m, lengths), copies, strict=True):
        np.testing.assert_array_equal(original, copy)
    assert alpha.dtype == tension.dtype == np.float64
    assert isinstance(chain.energy(theta, omega, m, lengths, g), float)


@pytest.mark.parametrize(
    ("theta", "omega", "m", "lengths", "g"),
    [
        ([], [], [], [], 9.81),
        ([0.1, 0.2], [0.0], [1.0, 1.0], [1.0, 1.0], 9.81),
        ([[0.1]], [[0.0]], [[1.0]], [[1.0]], 9.81),
        ([0.1], [0.0], [0.0], [1.0], 9.81),
        ([0.1], [0.0], [1.0], [-1.0], 9.81),
        ([np.nan], [0.0], [1.0], [1.0], 9.81),
        ([0.1], [np.inf], [1.0], [1.0], 9.81),
        ([0.1], [0.0], [1.0], [1.0], np.nan),
    ],
)
def test_rejects_malformed_input(theta, omega, m, lengths, g):
    with pytest.raises(ValueError):
        chain.solve(theta, omega, m, lengths, g)
    with pytest.raises(ValueError):
        chain.energy(theta, omega, m, lengths, g)
