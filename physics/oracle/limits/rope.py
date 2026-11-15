"""The hanging rope of section 5, solved: mode shapes and frequencies of (74).

Coordinates are the paper's section-5 ones: y is the distance below the support measured along
the rope (0 at the support, L at the free end) -- not the upward y axis of the figures -- and
x(y, t) is the horizontal displacement. Uniform density mu, length L, gravity g.

    x_tt = g d/dy[(L - y) x_y] = g (L - y) x_yy - g x_y                       (74), (81)

Separating x = Psi(y) cos(omega t + phase), with K = omega^2 the separation constant of (83):

    (L - y) Psi'' - Psi' + (K/g) Psi = 0                                      (85)

The exact substitution is z = 2 sqrt(K (L - y) / g), i.e. z = 2 sqrt(K) h with the paper's
h^2 = (L - y)/g; it gives z^2 Psi_zz + z Psi_z + z^2 Psi = 0, Bessel's equation of order zero
(the paper's h alone gives h^2 Psi_hh + h Psi_h + 4 K h^2 Psi = 0, the same equation scaled).

    Psi = A J0(z) + B Y0(z).
    Free end, y = L (z = 0, a regular singular point): the displacement stays bounded and the
    transverse tension force mu g (L - y) Psi' vanishes; Y0 violates both (it grows like ln z
    and (L - y) Y0' tends to a nonzero constant, with infinite potential energy), so B = 0.
    Support, y = 0: Psi(0) = 0, so J0(2 omega sqrt(L/g)) = 0.

    omega_k = (j_{0,k} / 2) sqrt(g / L),        Psi_k(y) = J0(j_{0,k} sqrt(1 - y/L)),

with j_{0,k} the k-th positive zero of J0. The frequencies do not depend on mu. The modes are
orthogonal with weight 1 on [0, L] (the operator -d/dy[(L - y) d/dy] is self-adjoint there), and
int_0^L Psi_k^2 dy = L J1(j_{0,k})^2, which ``normalized_mode`` divides out.

mpmath versions take and return mpmath numbers (for 50-digit tests); the ``*_np`` versions are
vectorized numpy for the convergence study.
"""

import mpmath
import numpy as np
from scipy.special import j0 as bessel_j0
from scipy.special import j1 as bessel_j1
from scipy.special import jn_zeros


def bessel_zero(k):
    """j_{0,k}, the k-th positive zero of J0 (k = 1, 2, ...)."""
    return mpmath.besseljzero(0, k)


def frequency(k, L, g):
    """omega_k = (j_{0,k}/2) sqrt(g/L)."""
    return bessel_zero(k) / 2 * mpmath.sqrt(g / L)


def separation_constant(k, L, g):
    """K_k = omega_k^2 = g j_{0,k}^2 / (4 L)."""
    return g * bessel_zero(k) ** 2 / (4 * L)


def bessel_argument(y, K, L, g):
    """z = 2 sqrt(K (L - y) / g), the substitution that turns (85) into Bessel's equation."""
    return 2 * mpmath.sqrt(K * (L - y) / g)


def paper_h(y, L, g):
    """The paper's h with h^2 = (L - y) / g; z = 2 sqrt(K) h."""
    return mpmath.sqrt((L - y) / g)


def mode(k, y, L):
    """Psi_k(y) = J0(j_{0,k} sqrt(1 - y/L)): zero at the support, 1 at the free end."""
    return mpmath.besselj(0, bessel_zero(k) * mpmath.sqrt(1 - y / L))


def mode_derivatives(k, y, L):
    """(Psi, Psi', Psi'') of mode k in closed form, for 0 <= y < L.

    With a = K/g = j_{0,k}^2/(4L) and z = 2 sqrt(a (L - y)): Psi' = 2a J1(z)/z and
    Psi'' = -4a^2 (J0(z) - 2 J1(z)/z) / z^2.
    """
    a = bessel_zero(k) ** 2 / (4 * L)
    z = 2 * mpmath.sqrt(a * (L - y))
    j0z = mpmath.besselj(0, z)
    j1z = mpmath.besselj(1, z)
    return j0z, 2 * a * j1z / z, -4 * a**2 * (j0z - 2 * j1z / z) / z**2


def second_solution(K, y, L, g):
    """Y0(z): the solution of (85) that the free-end condition excludes."""
    return mpmath.bessely(0, bessel_argument(y, K, L, g))


def normalized_mode(k, y, L):
    """Psi_k / |J1(j_{0,k})|, so that (1/L) int_0^L Psi^2 dy = 1 and Psi(L) > 0."""
    return mode(k, y, L) / abs(mpmath.besselj(1, bessel_zero(k)))


def ode_residual(psi, dpsi, ddpsi, y, K, L, g):
    """(85), left side, for given values of Psi, Psi', Psi''."""
    return (L - y) * ddpsi - dpsi + K / g * psi


# --- numpy versions --------------------------------------------------------------------------


def frequencies_np(count, L, g):
    """omega_1..omega_count as a float array."""
    return jn_zeros(0, count) / 2 * np.sqrt(g / L)


def normalized_modes_np(count, y, L):
    """Rows k = 0..count-1: Psi_{k+1}(y) / |J1(j_{0,k+1})| at the points y (float array)."""
    zeros = jn_zeros(0, count)
    s = np.sqrt(np.clip(1 - np.asarray(y, dtype=float) / L, 0.0, None))
    return np.array([bessel_j0(z * s) / abs(bessel_j1(z)) for z in zeros])
