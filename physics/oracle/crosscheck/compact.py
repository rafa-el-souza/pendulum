"""The equations of motion with the accelerations isolated: the compact form.

For each angle j of the n-mass pendulum,

    sum_k M_jk l_j l_k [cos(theta_j - theta_k) alpha_k + sin(theta_j - theta_k) omega_k^2]
        + M_jj g l_j sin(theta_j) = 0,

where M_jk is the total of the masses at or below both rod j and rod k. It is
the paper's equation (38) with its four groups of terms collected: the two
velocity products of (38) differ only by omega_k^2, and its two selector
functions amount to "masses at or below the lower of the two rods".

That the two forms are the same function is not taken on trust: the tests in
this directory compare them as functions of the state and of the
accelerations, with no dynamics involved.

What the compact form adds is the shape "matrix times accelerations": a
simulator has to solve for the accelerations, and (38) as printed spreads them
over two of its terms. Measured, it changes neither the result nor the
rounding error. It also inherits the dense n-by-n system, whose conditioning
worsens as masses are added, so it is a form for few masses.
"""

import numpy as np
from numpy.typing import NDArray

Vector = NDArray[np.float64]
Matrix = NDArray[np.float64]


def masses_below(m: Vector) -> Matrix:
    """M_jk: the total of the masses at or below both rod j and rod k."""
    index = np.arange(len(m))
    return np.cumsum(m[::-1])[::-1][np.maximum.outer(index, index)]


def mass_matrix(theta: Vector, m: Vector, l: Vector) -> Matrix:
    """The matrix that multiplies the angular accelerations; symmetric positive definite."""
    difference = theta[:, None] - theta[None, :]
    return masses_below(m) * np.outer(l, l) * np.cos(difference)


def forcing(theta: Vector, omega: Vector, m: Vector, l: Vector, g: float) -> Vector:
    """Everything in the equations of motion that does not multiply an acceleration."""
    below = masses_below(m)
    difference = theta[:, None] - theta[None, :]
    centrifugal = (below * np.outer(l, l) * np.sin(difference)) @ omega**2
    return centrifugal + np.diag(below) * g * l * np.sin(theta)


def residual(theta: Vector, omega: Vector, alpha: Vector, m: Vector, l: Vector, g: float) -> Vector:
    """Left-hand side of the compact equations of motion, one entry per angle."""
    return mass_matrix(theta, m, l) @ alpha + forcing(theta, omega, m, l, g)


def accelerations(theta: Vector, omega: Vector, m: Vector, l: Vector, g: float) -> Vector:
    """Angular accelerations from the compact form, by a dense symmetric solve."""
    return np.linalg.solve(mass_matrix(theta, m, l), -forcing(theta, omega, m, l, g))
