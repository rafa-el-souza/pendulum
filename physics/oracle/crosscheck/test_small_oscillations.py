"""Small oscillations of the equal-mass chain, from the compact form's own matrices.

``limits/`` derives the linearized pendulum from the Lagrangian and follows it
to the hanging rope. Here the same frequencies are taken from a different
place: the mass matrix of the compact form at the rest state, where every
cosine is one, and the gravity term with the sine replaced by its angle. The
two directories share no code, so agreement is a second route to PH-6, PH-7 and
PH-9.
"""

import functools

import compact
import numpy as np
import pytest
from scipy.linalg import eigh
from scipy.special import jn_zeros, roots_laguerre

G = 9.81
LENGTH = 2.0
MASS = 3.0


@functools.lru_cache
def frequencies(n: int) -> np.ndarray:
    """Normal-mode frequencies of n equal masses on n equal rods, lowest first."""
    m = np.full(n, MASS / n)
    l = np.full(n, LENGTH / n)
    inertia = compact.mass_matrix(np.zeros(n), m, l)
    gravity = np.diag(np.diag(compact.masses_below(m)) * G * l)
    return np.sqrt(eigh(gravity, inertia, eigvals_only=True))


def test_one_mass_is_the_simple_pendulum():
    """PH-6 with one mass: the frequency of EQ-1 for small angles."""
    assert frequencies(1)[0] == pytest.approx(np.sqrt(G / LENGTH), rel=1e-14)


def test_two_equal_masses_are_the_textbook_double_pendulum():
    """PH-6 with two equal masses and rods: omega^2 l / g = 2 -+ sqrt(2)."""
    scaled = frequencies(2) ** 2 * (LENGTH / 2) / G
    assert scaled == pytest.approx([2 - np.sqrt(2), 2 + np.sqrt(2)], rel=1e-13)


@pytest.mark.parametrize("n", (1, 2, 3, 8, 32, 64))
def test_frequencies_are_the_zeros_of_a_laguerre_polynomial(n):
    """PH-7: omega^2 l / g runs over the zeros of the Laguerre polynomial of degree n."""
    scaled = frequencies(n) ** 2 * (LENGTH / n) / G
    assert scaled == pytest.approx(np.sort(roots_laguerre(n)[0]), rel=1e-11)


@pytest.mark.parametrize("mode", (0, 1, 2))
def test_a_low_mode_is_slower_than_the_rope_by_one_part_in_four_n(mode):
    """PH-9: omega_k(N) / omega_k = 1 - 1/(4N) + O(N^-2) for a fixed mode, against PH-8."""
    rope = jn_zeros(0, mode + 1)[mode] / 2 * np.sqrt(G / LENGTH)
    scaled_errors = [n * (frequencies(n)[mode] / rope - 1) for n in (256, 512, 1024)]
    # The scaled error settles on -1/4 from above as the second-order term dies out.
    assert scaled_errors[0] > scaled_errors[1] > scaled_errors[2] > -0.25
    assert scaled_errors[2] == pytest.approx(-0.25, abs=2e-3)


@pytest.mark.parametrize(("n", "first_faster", "how_many"), ((3, 3, 1), (8, 5, 4), (64, 13, 52)))
def test_the_high_modes_of_a_finite_chain_are_faster_than_the_rope(n, first_faster, how_many):
    """PH-9 is a statement about each mode as N grows, not about every mode at a given N.

    The second-order term grows with the square of the mode number, so the
    modes above about 1.6 sqrt(N) lie above the rope's.
    """
    rope = jn_zeros(0, n) / 2 * np.sqrt(G / LENGTH)
    faster = np.nonzero(frequencies(n) > rope)[0] + 1
    assert faster.tolist() == list(range(first_faster, n + 1))
    assert len(faster) == how_many
    assert abs(first_faster - 1.6 * np.sqrt(n)) < 1.0
