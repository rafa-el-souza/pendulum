"""The tracked modes are what write_modes.py writes today.

physics/fixtures/chain-modes.json holds the oracle's normal modes of the equal
chain, which the browser's own (web/src/physics/modes.ts) are tested against.
If write_modes.py or linearization.py changes and the file is not written
again, the browser is checked against stale answers.

The comparison is not byte for byte. The eigensolver finds each eigenvalue to
about eps times the largest, which is near 4n, so the smallest, near 1.4 / n,
only to about eps n^2 of their size, and the shapes likewise; another machine's
build of it may land elsewhere within that. So the sizes and mode numbers must
match exactly, and the values to 1e-15 n^2, ten times below what the browser's
tests allow.
"""

import json

import numpy as np
import write_modes


def test_the_tracked_modes_are_what_the_script_writes_today():
    tracked = json.loads(write_modes.OUTPUT.read_text(encoding="utf-8"))
    fresh = write_modes.cases()
    assert {k: tracked[k] for k in write_modes.HEADER} == write_modes.HEADER
    assert [(c["n"], c["k"]) for c in tracked["cases"]] == [(c["n"], c["k"]) for c in fresh]
    for old, new in zip(tracked["cases"], fresh, strict=True):
        where = f"n = {new['n']}, mode {new['k']}"
        allowed = 1e-15 * new["n"] ** 2
        assert len(old["shape"]) == len(new["shape"]) == new["n"], where
        assert abs(old["lambda"] - new["lambda"]) <= allowed * new["lambda"], where
        np.testing.assert_allclose(old["shape"], new["shape"], rtol=0, atol=allowed, err_msg=where)


def test_each_mode_is_scaled_as_the_file_says():
    """The largest angle in size is 1, the bottom rod's is positive, and the modes rise."""
    for n in write_modes.SIZES:
        found = write_modes.modes(n)
        assert len(found) == min(n, write_modes.LOWEST)
        eigenvalues = [eigenvalue for eigenvalue, _ in found]
        assert eigenvalues == sorted(eigenvalues)
        for _, shape in found:
            assert np.max(np.abs(shape)) == 1.0
            assert shape[-1] > 0
