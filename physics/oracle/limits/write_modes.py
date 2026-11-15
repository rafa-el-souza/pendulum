"""Writes physics/fixtures/chain-modes.json: the normal modes of the equal chain, for the browser.

The browser starts the first piece's chain in a normal mode of the uniform
chain (web/src/physics/modes.ts). It finds the squared frequencies as the zeros
of a Laguerre polynomial and the shapes by the recurrence of the difference
equation (65), the route of PH-7. This file holds the same modes found another
way, from the linearized chain of PH-6 in the horizontal displacements, a
diagonal mass matrix and a tridiagonal stiffness, by scipy's symmetric
eigensolver (linearization.normal_modes), with no Laguerre polynomial in it.

For n equal masses on n equal rods, each mode k from the lowest has

- ``lambda``: omega_k^2 l / g, the squared frequency in units of g over one
  rod's length l, which depends on n alone;
- ``shape``: the rods' angles in the mode, from the top rod, theta_a =
  (x_a - x_{a-1}) / l with x_0 = 0 at the pivot, scaled so that the largest in
  size is 1 and the bottom rod's is positive. The bottom rod's angle is never
  zero, so the scaling leaves no choice of sign.

Run from physics/oracle after changing this script or linearization.py:

    uv run python limits/write_modes.py

test_write_modes.py fails while the tracked file differs from what this
script writes.
"""

import json
import math
from pathlib import Path

import linearization as lin
import numpy as np

OUTPUT = Path(__file__).resolve().parents[2] / "fixtures" / "chain-modes.json"
HEADER = {
    "about": (
        "The normal modes of n equal masses on n equal rods hanging at rest, from the "
        "linearized chain (PH-6) in the horizontal displacements, by "
        "physics/oracle/limits/linearization.py. For each mode k from the lowest: lambda, "
        "omega^2 l / g, the squared frequency in units of g over one rod's length; and "
        "shape, the rods' angles in the mode from the top rod, scaled so that the largest "
        "in size is 1 and the bottom rod's is positive."
    ),
    "written_by": "physics/oracle/limits/write_modes.py",
}

# Chains of each kind the piece draws, from one mass to a rope, and the lowest
# modes of each: as many as the piece may offer, and more.
SIZES = [1, 2, 3, 4, 8, 32, 128, 512]
LOWEST = 6
G = 9.81


def modes(n):
    """(lambda, shape) of the lowest min(n, LOWEST) modes of n equal masses on n equal rods."""
    masses, lengths = lin.uniform_chain(1.0, 1.0, n)
    omega, vectors = lin.normal_modes(masses, lengths, G, LOWEST)
    rod = lengths[0]
    out = []
    for k in range(len(omega)):
        x = vectors[:, k]
        theta = np.diff(x, prepend=0.0) / rod
        theta = theta / theta[np.argmax(np.abs(theta))]
        if theta[-1] < 0:
            theta = -theta
        out.append((float(omega[k] ** 2 * rod / G), theta))
    return out


def cases():
    """Every mode as a plain dictionary, by size and then by mode."""
    out = []
    for n in SIZES:
        for k, (eigenvalue, shape) in enumerate(modes(n), start=1):
            out.append({"n": n, "k": k, "lambda": eigenvalue, "shape": shape.tolist()})
    return out


def document(written):
    """The file's text. Floats are written by repr, which reads back to the same float64."""
    for case in written:
        assert math.isfinite(case["lambda"]), case
        assert all(math.isfinite(x) for x in case["shape"]), case
    lines = [json.dumps(case, allow_nan=False, separators=(",", ":")) for case in written]
    head = json.dumps(HEADER, indent=1, allow_nan=False)[:-1].rstrip()
    return head + ',\n "cases": [\n' + ",\n".join(lines) + "\n ]\n}\n"


if __name__ == "__main__":
    written = cases()
    OUTPUT.parent.mkdir(exist_ok=True)
    OUTPUT.write_text(document(written), encoding="utf-8")
    print(f"{len(written)} modes written to {OUTPUT}")
