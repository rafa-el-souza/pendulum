"""The chain pendulum's constrained Newton problem as one dense saddle-point solve.

This module exists only to catch algebra slips in chain.py, so it shares no code
and no intermediate quantity with it.  The unknowns are the 2n Cartesian
acceleration components of the masses and one Lagrange multiplier per rod; the
constraint gradients come from Cartesian positions, the velocity terms from
Cartesian velocities, and the whole symmetric indefinite KKT matrix goes to a
general dense LU solver.  The cost is O(n^3) time and O(n^2) memory, so it is
meant for n up to a few hundred.

Conventions are those of chain.py: x to the right, y up, gravity (0, -g), theta_i
the absolute angle of rod i from the downward vertical, positive tension pulling
the two ends of a rod together.
"""

import numpy as np
from numpy.typing import ArrayLike, NDArray

__all__ = ["accelerations", "solve", "tensions"]

FloatArray = NDArray[np.float64]


def solve(
    theta: ArrayLike,
    omega: ArrayLike,
    m: ArrayLike,
    l: ArrayLike,
    g: float,
) -> tuple[FloatArray, FloatArray, FloatArray]:
    """Solve the KKT system of one state.

    Returns ``(alpha, tension, acceleration)``: the angular accelerations and the
    rod tensions, shape ``(n,)``, and the Cartesian accelerations of the masses,
    shape ``(n, 2)``.
    """
    theta = np.asarray(theta, dtype=np.float64)
    omega = np.asarray(omega, dtype=np.float64)
    mass = np.asarray(m, dtype=np.float64)
    length = np.asarray(l, dtype=np.float64)
    n = theta.size
    if theta.shape != (n,) or omega.shape != (n,) or mass.shape != (n,) or length.shape != (n,):
        raise ValueError("theta, omega, m and l must all have shape (n,)")

    # Maximal coordinates: where the masses are and how fast they move.
    position = np.cumsum(np.column_stack((length * np.sin(theta), -length * np.cos(theta))), axis=0)
    velocity = np.cumsum(
        np.column_stack((length * omega * np.cos(theta), length * omega * np.sin(theta))), axis=0
    )
    origin = np.zeros((1, 2))
    rod = position - np.vstack((origin, position[:-1]))
    rod_rate = velocity - np.vstack((origin, velocity[:-1]))

    # Constraint j is phi_j = (|r_j - r_{j-1}|^2 - l_j^2) / 2 = 0.  Its gradient
    # is +rod_j on mass j and -rod_j on mass j-1, and twice differentiated it
    # reads  rod_j . (a_j - a_{j-1}) = -|v_j - v_{j-1}|^2.
    jac = np.zeros((n, 2 * n))
    rows = np.arange(n)
    jac[rows, 2 * rows] = rod[:, 0]
    jac[rows, 2 * rows + 1] = rod[:, 1]
    jac[rows[1:], 2 * rows[1:] - 2] = -rod[1:, 0]
    jac[rows[1:], 2 * rows[1:] - 1] = -rod[1:, 1]

    # [[M, J^T], [J, 0]] [a; mu] = [f; -|v_j - v_{j-1}|^2]: the rods act on the
    # masses with -J^T mu, so rod j pulls mass j with -mu_j rod_j, a tension of
    # mu_j |rod_j|.
    kkt = np.zeros((3 * n, 3 * n))
    kkt[: 2 * n, : 2 * n] = np.diag(np.repeat(mass, 2))
    kkt[: 2 * n, 2 * n :] = jac.T
    kkt[2 * n :, : 2 * n] = jac
    rhs = np.zeros(3 * n)
    rhs[1 : 2 * n : 2] = -mass * g
    rhs[2 * n :] = -np.sum(rod_rate * rod_rate, axis=1)
    solution = np.linalg.solve(kkt, rhs)

    acceleration = solution[: 2 * n].reshape(n, 2)
    multiplier = solution[2 * n :]
    relative = acceleration - np.vstack((origin, acceleration[:-1]))
    # For a vector of fixed length L at angle theta, rod x rod'' = L^2 theta''.
    alpha = (rod[:, 0] * relative[:, 1] - rod[:, 1] * relative[:, 0]) / np.sum(rod * rod, axis=1)
    tension = multiplier * np.hypot(rod[:, 0], rod[:, 1])
    return alpha, tension, acceleration


def accelerations(
    theta: ArrayLike,
    omega: ArrayLike,
    m: ArrayLike,
    l: ArrayLike,
    g: float,
) -> FloatArray:
    """Angular accelerations from the dense KKT solve, shape ``(n,)``."""
    return solve(theta, omega, m, l, g)[0]


def tensions(
    theta: ArrayLike,
    omega: ArrayLike,
    m: ArrayLike,
    l: ArrayLike,
    g: float,
) -> FloatArray:
    """Rod tensions from the dense KKT solve, shape ``(n,)``."""
    return solve(theta, omega, m, l, g)[1]
