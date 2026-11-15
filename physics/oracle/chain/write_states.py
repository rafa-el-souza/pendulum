"""Writes physics/fixtures/chain-states.json: chain states and the oracle's answers for them.

The browser's port of the tension route (PH-4) is tested against this file
(web/src/physics/): for every state it must give the accelerations and the rod
tensions that chain.py gives, and the energy that chain.energy gives.

The states cover the random regimes of test_chain.py at several sizes, the
equal chains that the first piece draws, and the two cases where a port that
rounds the difference of two joint angles loses digits: a joint folded back
on itself between extreme masses, and angles far beyond one turn.

Run from physics/oracle after changing this script or chain.py:

    uv run python chain/write_states.py

test_write_states.py fails while the tracked file differs from what this
script writes.
"""

import json
import math
from pathlib import Path

import numpy as np

import chain

OUTPUT = Path(__file__).resolve().parents[2] / "fixtures" / "chain-states.json"
HEADER = {
    "about": (
        "Chain states and the oracle's answers for them (physics/oracle/chain/chain.py): "
        "alpha, the angular accelerations, and tension, the rod tensions, by the tension "
        "route (PH-4), and the energy (PH-2). Angles are absolute, from the downward "
        "vertical; index 0 is the rod at the pivot. SI units."
    ),
    "written_by": "physics/oracle/chain/write_states.py",
}

SIZES = [1, 2, 3, 5, 8, 32, 128]
REGIMES = {
    "small angles, moderate speeds": ("small", 1.0),
    "large angles, at rest": ("large", 0.0),
    "large angles, fast": ("large", 10.0),
    "many turns, moderate speeds": ("turns", 1.0),
}


def random_state(rng, n, angles, speed):
    """Unequal masses log-uniform in [0.1, 10], lengths in [0.2, 5], g in [1, 20].

    Speeds are in units of each rod's own pendulum frequency; at 10 the
    centripetal terms are about a hundred times the gravitational ones.
    """
    m = 10.0 ** rng.uniform(-1.0, 1.0, n)
    lengths = 5.0 ** rng.uniform(-1.0, 1.0, n)
    g = float(rng.uniform(1.0, 20.0))
    if angles == "small":
        theta = rng.normal(0.0, 0.2, n)
    elif angles == "large":
        theta = rng.uniform(-np.pi, np.pi, n)
    else:
        theta = rng.uniform(-6.0 * np.pi, 6.0 * np.pi, n)
    omega = speed * rng.normal(0.0, 1.0, n) * np.sqrt(g / lengths)
    return theta, omega, m, lengths, g


def equal_chain(n):
    """The paper's refinement family: n equal masses on n equal rods, 1 kg and 1 m in all."""
    return np.full(n, 1.0 / n), np.full(n, 1.0 / n)


def states():
    """(label, theta, omega, m, l, g) for every state, in a fixed order."""
    rng = np.random.default_rng(20261115)
    for n in SIZES:
        for regime, (angles, speed) in REGIMES.items():
            masses = "1 mass" if n == 1 else f"{n} unequal masses"
            yield (f"{masses}, {regime}", *random_state(rng, n, angles, speed))

    m, lengths = equal_chain(512)
    arc = np.arange(1, 513) / 512
    yield (
        "512 equal masses swinging smoothly",
        0.5 * np.sin(np.pi * arc),
        0.3 * np.cos(np.pi * arc),
        m,
        lengths,
        9.81,
    )
    m, lengths = equal_chain(128)
    theta = rng.uniform(-np.pi, np.pi, 128)
    omega = 10.0 * rng.normal(0.0, 1.0, 128) * np.sqrt(9.81 / lengths)
    yield ("128 equal masses tangled and fast", theta, omega, m, lengths, 9.81)

    # Rod 2 folded back to within `offset` of rod 1. The float64 difference of
    # the two angles is rounded near pi, and between these masses the rounding
    # reaches the accelerations: by 1e-10, 1e-7 and 1e-4 (test_chain.py).
    for offset in (1e-6, 1e-9, 1e-12):
        theta1 = -2.2
        yield (
            f"a joint folded back to within {offset:g} rad, between masses 1e-10 and 1e10 kg",
            np.array([theta1, theta1 + np.pi + offset, 0.3]),
            np.array([0.7, -1.3, 0.4]),
            np.array([1e-10, 1e10, 1.0]),
            np.array([1.0, 0.8, 1.2]),
            9.81,
        )

    # Angles of alternating sign, as an integrator that never wraps them could
    # produce after a long spin: their differences are rounded in float64.
    for turns in (1e6, 1e9):
        theta = (-1.0) ** np.arange(16) * turns * rng.uniform(0.5, 1.0, 16)
        _, omega, m, lengths, g = random_state(rng, 16, "large", 1.0)
        yield (f"16 unequal masses at angles near {turns:g} rad", theta, omega, m, lengths, g)


def cases():
    """Every state with the oracle's accelerations, tensions and energy, as plain lists."""
    out = []
    for label, theta, omega, m, lengths, g in states():
        alpha, tension = chain.solve(theta, omega, m, lengths, g)
        out.append(
            {
                "label": label,
                "n": int(np.size(theta)),
                "g": float(g),
                "m": np.asarray(m, dtype=np.float64).tolist(),
                "l": np.asarray(lengths, dtype=np.float64).tolist(),
                "theta": np.asarray(theta, dtype=np.float64).tolist(),
                "omega": np.asarray(omega, dtype=np.float64).tolist(),
                "alpha": alpha.tolist(),
                "tension": tension.tolist(),
                "energy": chain.energy(theta, omega, m, lengths, g),
            }
        )
    return out


def document(written):
    """The file's text. Floats are written by repr, which reads back to the same float64."""
    for case in written:
        for key in ("m", "l", "theta", "omega", "alpha", "tension"):
            assert all(math.isfinite(x) for x in case[key]), case["label"]
    lines = [json.dumps(case, allow_nan=False, separators=(",", ":")) for case in written]
    head = json.dumps(HEADER, indent=1, allow_nan=False)[:-1].rstrip()
    return head + ',\n "cases": [\n' + ",\n".join(lines) + "\n ]\n}\n"


if __name__ == "__main__":
    written = cases()
    OUTPUT.parent.mkdir(exist_ok=True)
    OUTPUT.write_text(document(written), encoding="utf-8")
    print(f"{len(written)} states written to {OUTPUT}")
