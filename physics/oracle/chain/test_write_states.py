"""The tracked fixtures are what write_states.py writes today.

physics/fixtures/chain-states.json holds the oracle's answers for the browser's
tests of the tension route (PH-4). If write_states.py or chain.py changes and
the file is not written again, the browser is checked against stale answers.

The comparison is not byte for byte, because floating-point routines such as
sine and power need not round alike on every processor and library build: a
state may come out an ulp or two apart on another machine. So the labels and
sizes must match exactly, the states to a few ulps, and the answers to 1e-13
of their size, which is far above rounding and ten times below what the
browser's tests allow.
"""

import json
import math

import numpy as np
import write_states

EPS = float(np.finfo(np.float64).eps)


def normwise(x, ref):
    x, ref = np.asarray(x), np.asarray(ref)
    return float(np.max(np.abs(x - ref)) / np.max(np.abs(ref)))


def lift(case):
    """The energy that lifts the hanging chain to the horizontal: a scale for energies."""
    depth = np.cumsum(case["l"])
    return case["g"] * float(np.sum(np.asarray(case["m"]) * depth))


def test_the_tracked_states_are_what_the_script_writes_today():
    tracked = json.loads(write_states.OUTPUT.read_text(encoding="utf-8"))
    fresh = write_states.cases()
    assert {k: tracked[k] for k in write_states.HEADER} == write_states.HEADER
    assert [c["label"] for c in tracked["cases"]] == [c["label"] for c in fresh]
    for old, new in zip(tracked["cases"], fresh, strict=True):
        where = old["label"]
        assert old["n"] == new["n"] == len(new["theta"]), where
        for key in ("g", "m", "l", "theta", "omega"):
            np.testing.assert_allclose(old[key], new[key], rtol=8 * EPS, atol=0, err_msg=where)
        assert normwise(old["alpha"], new["alpha"]) <= 1e-13, where
        assert normwise(old["tension"], new["tension"]) <= 1e-13, where
        assert math.isclose(old["energy"], new["energy"], rel_tol=1e-13, abs_tol=1e-13 * lift(new))
