"""The registry in physics/equations.yaml is well formed and says what the checks found.

The registry is edited by hand, so these tests hold it to its own rules: every
display equation of the paper has exactly one entry, every status is backed by
a test that exists, and no status disagrees with the verdict recorded beside
that test.
"""

import json
import re
from pathlib import Path

import pytest
import yaml

ORACLE = Path(__file__).resolve().parents[1]
PHYSICS = ORACLE.parent
REFERENCE = PHYSICS.parent / "reference" / "equations.json"

KINDS = {"definition", "step", "result", "approximation"}
STATUSES = {"ok", "misprint", "notation", "wrong", "unchecked"}
SECOND_CHECKS = {"confirmed", "confirmed with conditions", "disputed"}
# The paper prints (1) to (86), tags four equations (46.1) to (46.4) by hand
# and leaves the definitions of its two selector functions unnumbered.
EXPECTED = (
    {f"EQ-{n}" for n in range(1, 87)} | {f"EQ-46.{n}" for n in range(1, 5)} | {"EQ-sigma", "EQ-phi"}
)


@pytest.fixture(scope="module")
def registry() -> dict:
    return yaml.safe_load((PHYSICS / "equations.yaml").read_text(encoding="utf-8"))


def defined_tests(path: Path) -> set[str]:
    return set(re.findall(r"^def (test_\w+)\(", path.read_text(encoding="utf-8"), re.MULTILINE))


def assert_test_exists(reference: str) -> None:
    """A test reference is ``directory/file.py`` or ``directory/file.py::test_name``."""
    file, _, name = reference.partition("::")
    path = ORACLE / file
    assert path.is_file(), f"{reference}: no such file"
    if name:
        assert name in defined_tests(path), f"{reference}: no such test"


def test_every_display_equation_has_exactly_one_entry(registry):
    ids = [entry["id"] for entry in registry["equations"]]
    assert len(ids) == len(set(ids)), "an equation is listed twice"
    assert set(ids) == EXPECTED


def test_the_entries_match_the_paper_when_the_reference_copy_is_here(registry):
    """The expected numbers above are the paper's, checked whenever the local copy exists."""
    if not REFERENCE.is_file():
        pytest.skip("the reference copy is not built on this machine (see physics/README.md)")
    reference = json.loads(REFERENCE.read_text(encoding="utf-8"))
    numbered = {f"EQ-{e['number']}" for e in reference["equations"] if e["number"] is not None}
    assert numbered == EXPECTED - {"EQ-sigma", "EQ-phi"}
    pages = {f"EQ-{e['number']}": e["page"] for e in reference["equations"] if e["number"]}
    sections = {f"EQ-{e['number']}": e["section"] for e in reference["equations"] if e["number"]}
    for entry in registry["equations"]:
        if entry["id"] in pages:
            assert entry["page"] == pages[entry["id"]], entry["id"]
            assert entry["section"] == sections[entry["id"]], entry["id"]


def test_each_entry_is_well_formed(registry):
    for entry in registry["equations"]:
        where = entry["id"]
        assert entry["kind"] in KINDS, where
        assert entry["status"] in STATUSES, where
        assert entry["section"] in {2, 3, 4, 5, 6}, where
        assert entry["says"].strip() and entry["says"].rstrip().endswith("."), where
        assert ("problem" in entry) == (entry["status"] != "ok"), where
        assert ("corrected" in entry) == (entry["status"] == "misprint"), where
        assert ("reading" in entry) == (entry["status"] == "notation"), where
        if "second_check" in entry:
            assert entry["second_check"] in SECOND_CHECKS, where


def test_every_status_is_backed_by_a_test_that_exists(registry):
    for entry in registry["equations"]:
        assert "test" in entry or entry["status"] == "unchecked", entry["id"]
        if "test" in entry:
            assert_test_exists(entry["test"])


def test_no_status_disagrees_with_the_recorded_verdict(registry):
    verdicts = {}
    for directory in ("symbolic", "limits"):
        for verdict in json.loads((ORACLE / directory / "verdicts.json").read_text("utf-8")):
            verdicts[f"EQ-{verdict['number']}"] = verdict["verdict"]
    assert set(verdicts) == EXPECTED
    for entry in registry["equations"]:
        assert entry["status"] == verdicts[entry["id"]], entry["id"]


def test_what_is_not_ok_was_checked_a_second_time(registry):
    """An erratum is a claim about someone else's paper: none goes in on one reviewer's word."""
    for entry in registry["equations"]:
        if entry["status"] != "ok":
            assert entry.get("second_check") in SECOND_CHECKS - {"disputed"}, entry["id"]


def test_the_findings_on_the_text_are_well_formed(registry):
    ids = [finding["id"] for finding in registry["text"]]
    assert len(ids) == len(set(ids))
    for finding in registry["text"]:
        where = finding["id"]
        assert re.fullmatch(r"TX-\d+", where), where
        assert finding["where"].strip() and finding["says"].strip(), where
        assert finding["second_check"] in SECOND_CHECKS - {"disputed"}, where
        for reference in finding.get("tests", []):
            assert_test_exists(reference)


def test_the_statements_rest_on_entries_and_tests_that_exist(registry):
    known = {entry["id"] for entry in registry["equations"]}
    ids = [statement["id"] for statement in registry["statements"]]
    assert len(ids) == len(set(ids))
    for statement in registry["statements"]:
        where = statement["id"]
        assert re.fullmatch(r"PH-\d+", where), where
        assert statement["says"].strip() and statement["latex"].strip(), where
        assert set(statement["rests_on"]) <= known, where
        assert statement["tests"], f"{where}: a statement nothing tests is an opinion"
        assert statement["second_check"] in SECOND_CHECKS - {"disputed"}, where
        for reference in statement["tests"]:
            assert_test_exists(reference)
