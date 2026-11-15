"""Planar chain pendulum dynamics from Newton's second law and rigid-rod constraints.

Point masses m_1 .. m_n hang from a fixed pivot on massless rigid rods of lengths
l_1 .. l_n; rod i joins mass i-1 to mass i, "mass 0" being the pivot.  Newton's
second law is written for every mass with the rod tensions as unknown forces, and
every rod-length constraint is differentiated twice in time.  Eliminating the
Cartesian accelerations leaves a symmetric positive definite tridiagonal system
for the tensions, solved here in O(n) operations; the angular accelerations are
then read from the components of the Cartesian accelerations normal to the rods.
README.md carries the derivation.

Conventions: x to the right, y up, gravity (0, -g).  theta_i is the absolute
angle of rod i from the downward vertical, so the unit vector from mass i-1 to
mass i is e_i = (sin theta_i, -cos theta_i) and its normal is
n_i = (cos theta_i, sin theta_i).  A positive tension pulls the two ends of its
rod together.
"""

import math

import numpy as np
from numpy.typing import ArrayLike, NDArray

__all__ = ["accelerations", "energy", "solve", "tensions"]

FloatArray = NDArray[np.float64]


def _checked(
    theta: ArrayLike,
    omega: ArrayLike,
    m: ArrayLike,
    lengths: ArrayLike,
    g: float,
) -> tuple[FloatArray, FloatArray, FloatArray, FloatArray, float]:
    theta = np.asarray(theta, dtype=np.float64)
    omega = np.asarray(omega, dtype=np.float64)
    m = np.asarray(m, dtype=np.float64)
    lengths = np.asarray(lengths, dtype=np.float64)
    g = float(g)
    if theta.ndim != 1 or theta.size == 0:
        raise ValueError("theta must be a non-empty one-dimensional array")
    if not (omega.shape == m.shape == lengths.shape == theta.shape):
        raise ValueError("theta, omega, m and l must all have shape (n,)")
    finite = (
        np.isfinite(theta).all()
        and np.isfinite(omega).all()
        and np.isfinite(m).all()
        and np.isfinite(lengths).all()
        and math.isfinite(g)
    )
    if not finite:
        raise ValueError("the state, the masses, the lengths and g must be finite")
    # The elimination divides by every mass and every length.
    if not ((m > 0).all() and (lengths > 0).all()):
        raise ValueError("masses and rod lengths must be positive")
    return theta, omega, m, lengths, g


def _joint_sin_cos(theta: FloatArray) -> tuple[FloatArray, FloatArray]:
    """sin and cos of theta_{i+1} - theta_i, i = 1 .. n-1, to about one ulp each.

    Joint angles enter the dynamics only through these.  Taking the difference
    before the trigonometric call keeps nearly straight joints accurate, where
    products of absolute sines and cosines would cancel.  The difference itself
    is exact near zero but is rounded near +-pi (and for large angles), which
    would leave sin of a nearly folded joint with an absolute error of about
    1e-16 instead of a relative one; with extreme mass ratios that error is
    amplified.  So the difference is carried as an exact sum hi + lo (Knuth's
    TwoSum) and the trigonometric values are corrected to first order in lo.
    """
    upper = theta[:-1]
    lower = theta[1:]
    hi = lower - upper
    lower_part = hi + upper
    upper_part = hi - lower_part
    lo = (lower - lower_part) - (upper + upper_part)
    sin_hi = np.sin(hi)
    cos_hi = np.cos(hi)
    return sin_hi + lo * cos_hi, cos_hi - lo * sin_hi


def solve(
    theta: ArrayLike,
    omega: ArrayLike,
    m: ArrayLike,
    l: ArrayLike,
    g: float,
) -> tuple[FloatArray, FloatArray]:
    """Angular accelerations and rod tensions of one state, in one O(n) pass.

    Returns ``(alpha, tension)``, both of shape ``(n,)``: alpha_i is the second
    time derivative of theta_i and tension_i the force in rod i, positive when
    the rod pulls its two ends together.
    """
    theta, omega, m, lengths, g = _checked(theta, omega, m, l, g)
    n = theta.size

    s, c = _joint_sin_cos(theta)
    rhs = lengths * omega * omega
    rhs[0] += g * math.cos(theta[0])

    # LDL^T elimination of the tension system, top rod first.  Row i has the
    # pivot (1 + kappa_i) / m_i with kappa_1 = 0 and
    #     kappa_{i+1} = (m_{i+1} / m_i) (s_i^2 + kappa_i) / (1 + kappa_i),
    # an update made of sums and products of non-negative numbers.  The textbook
    # update 1/m_i + 1/m_{i+1} - c_i^2 / (m_i^2 p_i) computes the same pivot as a
    # difference that cancels for nearly straight joints and for a light mass
    # above a heavy one.  The sweep is sequential; plain floats keep it cheap.
    mass = m.tolist()
    sin_joint = s.tolist()
    cos_joint = c.tolist()
    kappa = [0.0] * n
    y = rhs.tolist()
    for i in range(n - 1):
        f = 1.0 + kappa[i]
        kappa[i + 1] = mass[i + 1] / mass[i] * (sin_joint[i] * sin_joint[i] + kappa[i]) / f
        y[i + 1] += cos_joint[i] * y[i] / f
    t = [0.0] * n
    t[-1] = mass[-1] * y[-1] / (1.0 + kappa[-1])
    for i in range(n - 2, -1, -1):
        t[i] = (mass[i] * y[i] + cos_joint[i] * t[i + 1]) / (1.0 + kappa[i])
    tension = np.array(t)

    # l_i alpha_i = n_i . (a_i - a_{i-1}), with the Cartesian accelerations a_i
    # given by Newton's law.  Along n_i, rod i pulls on neither of its ends and
    # gravity accelerates both ends alike, so only rod i+1 acting on mass i and
    # rod i-1 acting on mass i-1 remain; at the top, the pivot does not move
    # and gravity on mass 1 is left over.
    per_mass = s / m[:-1]
    normal = np.zeros(n)
    normal[:-1] += tension[1:] * per_mass
    normal[1:] -= tension[:-1] * per_mass
    normal[0] -= g * math.sin(theta[0])
    return normal / lengths, tension


def accelerations(
    theta: ArrayLike,
    omega: ArrayLike,
    m: ArrayLike,
    l: ArrayLike,
    g: float,
) -> FloatArray:
    """Angular accelerations alpha = d(omega)/dt, shape ``(n,)``."""
    return solve(theta, omega, m, l, g)[0]


def tensions(
    theta: ArrayLike,
    omega: ArrayLike,
    m: ArrayLike,
    l: ArrayLike,
    g: float,
) -> FloatArray:
    """Rod tensions, shape ``(n,)``, positive when a rod pulls its ends together."""
    return solve(theta, omega, m, l, g)[1]


def energy(
    theta: ArrayLike,
    omega: ArrayLike,
    m: ArrayLike,
    l: ArrayLike,
    g: float,
) -> float:
    """Kinetic plus potential energy, with the potential zero at the pivot height.

    Computed from the Cartesian positions and velocities of the masses, which
    are sums of the rod vectors and of their time derivatives down the chain.
    """
    theta, omega, m, lengths, g = _checked(theta, omega, m, l, g)
    height = np.cumsum(-lengths * np.cos(theta))
    vx = np.cumsum(lengths * omega * np.cos(theta))
    vy = np.cumsum(lengths * omega * np.sin(theta))
    kinetic = 0.5 * np.sum(m * (vx * vx + vy * vy))
    potential = g * np.sum(m * height)
    return float(kinetic + potential)
