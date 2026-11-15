"""Build the local reference copy of the paper this project studies.

The paper (arXiv:1910.12610v2) is distributed by arXiv under its non-exclusive
licence, which gives readers no right to redistribute it. So the repository
tracks this recipe and not the paper: the script fetches the LaTeX source from
arXiv, checks it against pinned digests, and writes under ``reference/``
(ignored by git):

* ``source/``         the source files as arXiv distributes them;
* ``paper.md``        the paper as Markdown, every display equation carrying
                      the number printed in the PDF;
* ``equations.json``  the same equations as data.

Why the numbering is the point: the source labels its equations with names
that look like numbers (``\\label{23}``) but are not the printed ones (that
equation is printed as (38)). Everything in this project cites printed
numbers, so they are computed here by LaTeX's own rule and, when the PDF and
``pdftotext`` are at hand, checked against the numbers on the pages.

Run from this directory:  uv run python paper.py
Needs ``pandoc`` on the PATH (LaTeX prose to Markdown); beyond that, only the
standard library.
"""

import argparse
import hashlib
import io
import json
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
import urllib.request
from dataclasses import asdict, dataclass, field
from pathlib import Path

ARXIV_ID = "1910.12610"
ARXIV_VERSION = "v2"
SOURCE_URL = f"https://export.arxiv.org/src/{ARXIV_ID}{ARXIV_VERSION}"
ABSTRACT_URL = f"https://arxiv.org/abs/{ARXIV_ID}{ARXIV_VERSION}"
USER_AGENT = "pendulum-reference-build/1 (one fetch of one paper's source)"
MAX_ARCHIVE_BYTES = 5_000_000

# Digests of the files as arXiv distributed them on 2026-11-15. The archive
# itself is not pinned: arXiv may repack it, and only these contents matter.
SOURCE_FILES = {
    "Article.tex": "4e83d858f7cda985bba7def81821f7d1e146d9b9e05b7670a9fd53fe9baa8f5c",
    "fig1.png": "351c438c72148eb0e7a1f504d3cb3723894c1125d8799522a11a6b7d50f6cedf",
    "fig2.png": "1afed790f17741a8529f7e8a194ffbfdcb3aff8de5112496a3c6601dd263c7c5",
    "fig3.png": "26148ae6cb23d52517d655b090655bdf12c3cb5d0391455461f5cc888dee7417",
    "fig4.png": "0aaad3fba5f435af7325fe343450282360f9cd2926d8b04647fdca450782c123",
}

REPOSITORY = Path(__file__).resolve().parents[2]
REFERENCE = REPOSITORY / "reference"
DEFAULT_PDF = REPOSITORY / "pendulum_equations.pdf"

# Display equations and figures are lifted out before pandoc sees the text and
# put back afterwards, so their LaTeX reaches the Markdown untouched.
TOKEN = "PENDULUMBLOCK{:04d}"
TOKEN_LINE = re.compile(r"^PENDULUMBLOCK(\d{4})[ \t]*$", re.MULTILINE)
BLOCK = re.compile(
    r"\\begin\{equation\}(?P<equation>.*?)\\end\{equation\}"
    r"|\$\$(?P<display>.*?)\$\$"
    r"|\\begin\{figure\}(?:\[[^\]]*\])?(?P<figure>.*?)\\end\{figure\}",
    re.DOTALL,
)

# Places where the paper's prose cites an equation by a literal that is not
# its printed number. Kept as printed, with the printed number beside it.
SIC = {"eq.18": "eq.18 [sic: the equation printed as (33)]"}

FIGURE_NOTE = (
    "In the four figures the pivot is the origin, x points right and y up, each angle "
    "$\\theta_i$ is measured from the downward vertical through the upper end of rod $i$, "
    "$\\ell_i$ is the length of rod $i$ and $m_i$ the point mass at its lower end."
)


@dataclass
class Equation:
    number: str | None  # as printed in the PDF; None for the unnumbered displays
    label: str | None  # the source's \label, which is a name and not the number
    tagged: bool  # numbered by hand with \tag in the source
    section: int
    after: str | None  # for an unnumbered display, the printed number before it
    latex: str
    footnotes: list[str] = field(default_factory=list)
    source_line: int = 0
    page: int | None = None  # the paper's own page number, when the PDF was read


@dataclass
class Figure:
    number: int
    label: str | None
    file: str
    caption: str


def digest(path: Path) -> str | None:
    return hashlib.sha256(path.read_bytes()).hexdigest() if path.is_file() else None


def fetch_source(source_dir: Path, offline: bool) -> bool:
    """Make sure the pinned source files are in source_dir; return whether arXiv was contacted."""
    if all(digest(source_dir / name) == sha for name, sha in SOURCE_FILES.items()):
        return False
    if offline:
        sys.exit(f"{source_dir} lacks the pinned source files and --offline forbids fetching them")
    request = urllib.request.Request(SOURCE_URL, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=60) as response:
        archive = response.read(MAX_ARCHIVE_BYTES + 1)
    if len(archive) > MAX_ARCHIVE_BYTES:
        sys.exit(f"{SOURCE_URL} returned more than {MAX_ARCHIVE_BYTES} bytes; refusing it")
    source_dir.mkdir(parents=True, exist_ok=True)
    # Only the pinned names are read, each written under a name of ours, so
    # nothing in the archive chooses a path on this disk.
    with tarfile.open(fileobj=io.BytesIO(archive), mode="r:gz") as tar:
        members = {member.name: member for member in tar.getmembers() if member.isfile()}
        for name, sha in SOURCE_FILES.items():
            if name not in members:
                sys.exit(f"{name} is missing from the archive at {SOURCE_URL}")
            data = tar.extractfile(members[name]).read()
            if hashlib.sha256(data).hexdigest() != sha:
                sys.exit(f"{name} from {SOURCE_URL} does not match its pinned digest")
            (source_dir / name).write_bytes(data)
    return True


def strip_command(text: str, command: str) -> tuple[str, list[str]]:
    """Remove every ``\\command{...}`` from text; return the text and what the braces held.

    Braces are matched by counting, because a caption or a footnote may hold
    braces of its own.
    """
    needle = "\\" + command + "{"
    arguments: list[str] = []
    while (start := text.find(needle)) != -1:
        depth, position = 1, start + len(needle)
        while depth and position < len(text):
            char = text[position]
            if char == "\\":
                position += 2
                continue
            depth += (char == "{") - (char == "}")
            position += 1
        arguments.append(text[start + len(needle) : position - 1].strip())
        text = text[:start] + text[position:]
    return text, arguments


def tidy_math(latex: str) -> str:
    """Drop blank lines and edge whitespace: a blank line inside ``$$`` ends the math."""
    return "\n".join(line.rstrip() for line in latex.strip().splitlines() if line.strip())


def parse(tex: str) -> tuple[dict, str, list[Equation], list[Figure], dict[int, str]]:
    """Split the source into front matter, body text with tokens, equations and figures."""
    front = {
        "title": re.search(r"\\title\{(.*?)\}", tex, re.DOTALL).group(1).strip(),
        "author": re.search(r"\\author\{(.*?)\}", tex, re.DOTALL).group(1).strip(),
        "abstract": re.search(r"\\begin\{abstract\}(.*?)\\end\{abstract\}", tex, re.DOTALL)
        .group(1)
        .strip(),
        "keywords": re.search(r"Keywords\}:\s*(.*)", tex).group(1).strip(),
    }
    body_start = tex.index("\\section{")
    body = tex[body_start : tex.index("\\end{document}")]
    section_starts = [match.start() for match in re.finditer(r"\\section\{", body)]

    equations: list[Equation] = []
    figures: list[Figure] = []
    blocks: dict[int, str] = {}
    pieces: list[str] = []
    counter, cursor, last_number = 0, 0, None
    for match in BLOCK.finditer(body):
        pieces.append(body[cursor : match.start()])
        cursor = match.end()
        index = len(blocks)
        pieces.append("\n\n" + TOKEN.format(index) + "\n\n")
        section = sum(start <= match.start() for start in section_starts)
        line = tex.count("\n", 0, body_start + match.start()) + 1

        if match.group("figure") is not None:
            inner, labels = strip_command(match.group("figure"), "label")
            inner, captions = strip_command(inner, "caption")
            file = re.search(r"\\includegraphics(?:\[[^\]]*\])?\{([^}]*)\}", inner).group(1)
            figures.append(
                Figure(len(figures) + 1, labels[0] if labels else None, file, captions[0])
            )
            figure = figures[-1]
            blocks[index] = (
                f"![Figure {figure.number}: {figure.caption}](source/{figure.file})\n\n"
                f"**Figure {figure.number}.** {figure.caption}"
            )
            continue

        if match.group("display") is not None:
            equation = Equation(None, None, False, section, last_number, "", [], line)
            equation.latex = tidy_math(match.group("display"))
            equations.append(equation)
            blocks[index] = f"$$\n{equation.latex}\n$$"
            continue

        inner, labels = strip_command(match.group("equation"), "label")
        inner, tags = strip_command(inner, "tag")
        inner, footnotes = strip_command(inner, "footnote")
        if tags:
            number = tags[0]
        else:
            # LaTeX's rule: every equation environment without a \tag takes the next integer.
            counter += 1
            number = str(counter)
        last_number = number
        equations.append(
            Equation(
                number,
                labels[0] if labels else None,
                bool(tags),
                section,
                None,
                tidy_math(inner),
                footnotes,
                line,
            )
        )
        block = f"$$\n{equations[-1].latex}\n\\tag{{{number}}}\n$$"
        for note in footnotes:
            block += f"\n\n> Footnote to ({number}): {note}"
        blocks[index] = block

    pieces.append(body[cursor:])
    return front, "".join(pieces), equations, figures, blocks


def prepare_prose(text: str, equations: list[Equation], figures: list[Figure]) -> str:
    """Rewrite what pandoc would lose or garble: references, citations, the class's own macros."""
    equation_numbers = {e.label: e.number for e in equations if e.label}
    figure_numbers = {f.label: f.number for f in figures if f.label}

    def reference(match: re.Match) -> str:
        label = match.group(1)
        if label in equation_numbers:
            return f"({equation_numbers[label]})"
        if label in figure_numbers:
            return f"Figure {figure_numbers[label]}"
        sys.exit(f"\\ref{{{label}}} points at no equation or figure")

    text = re.sub(r"\\ref\{([^}]*)\}", reference, text)

    keys = re.findall(r"\\bibitem\{([^}]*)\}", text)
    text = re.sub(r"\\cite\{([^}]*)\}", lambda m: f"[{keys.index(m.group(1)) + 1}]", text)
    bibliography = re.search(
        r"\\begin\{thebibliography\}\{[^}]*\}(.*?)\\end\{thebibliography\}(?:\{\})?",
        text,
        re.DOTALL,
    )
    entries = [e.strip() for e in re.split(r"\\bibitem\{[^}]*\}", bibliography.group(1))]
    listing = "\n".join(f"\\item {entry}" for entry in entries if entry)
    text = (
        text[: bibliography.start()]
        + f"\\begin{{enumerate}}\n{listing}\n\\end{{enumerate}}"
        + text[bibliography.end() :]
    )

    numbers = iter(range(1, 100))
    text = re.sub(r"\\section\{", lambda m: f"\\section{{{next(numbers)}. ", text)
    # \ack is the journal class's acknowledgments heading; pandoc does not know it.
    text = text.replace("\\ack", "\\section*{Acknowledgments}")
    text = re.sub(r"\\(?:pagebreak|linebreak|indent|noindent|centering)\b", "", text)
    for printed, annotated in SIC.items():
        text = text.replace(printed, annotated)
    return text


def to_markdown(latex: str) -> str:
    if shutil.which("pandoc") is None:
        sys.exit("pandoc is not on the PATH; it turns the paper's LaTeX prose into Markdown")
    # Fed through stdin from a neutral directory: pandoc has no file of the
    # download to resolve and nothing to read beside it.
    result = subprocess.run(
        [
            "pandoc",
            "--from=latex",
            "--to=commonmark_x",
            "--wrap=none",
            "--shift-heading-level-by=1",
        ],
        input=latex,
        capture_output=True,
        text=True,
        cwd=tempfile.gettempdir(),
        check=False,
    )
    if result.returncode != 0:
        sys.exit(f"pandoc failed: {result.stderr.strip()}")
    return result.stdout


def locate_in_pdf(pdf: Path, equations: list[Equation]) -> dict | None:
    """Find each printed number on the PDF's pages, in order; fill in the paper's page numbers.

    The scan follows the expected sequence instead of collecting everything
    that looks like "(n)": a number at the end of a full-width equation has no
    gap before it and is indistinguishable from prose out of context.
    """
    if not pdf.is_file() or shutil.which("pdftotext") is None:
        return None
    text = subprocess.run(
        ["pdftotext", "-layout", str(pdf), "-"], capture_output=True, text=True, check=True
    ).stdout
    pages = text.split("\f")
    # Copies downloaded from a repository site carry a cover page; the paper's
    # own page 1 is the one with the abstract.
    first = next((i for i, page in enumerate(pages) if "Abstract." in page), 0)
    numbered = [e for e in equations if e.number is not None]
    position, missing = 0, []
    for page_index, page in enumerate(pages):
        for line in page.splitlines():
            # Look a few numbers ahead, so that one number the text layer
            # garbled does not hide all the ones after it.
            for ahead in range(position, min(position + 4, len(numbered))):
                if re.search(r"\(" + re.escape(numbered[ahead].number) + r"\)\s*$", line):
                    missing += [e.number for e in numbered[position:ahead]]
                    numbered[ahead].page = page_index - first + 1
                    position = ahead + 1
                    break
    missing += [e.number for e in numbered[position:]]
    return {
        "pdf": pdf.name,
        "numbers_expected": len(numbered),
        "numbers_located_in_order": len(numbered) - len(missing),
        "not_located": missing,
    }


def assemble(front: dict, markdown: str, blocks: dict[int, str], check: dict | None) -> str:
    body = TOKEN_LINE.sub(lambda m: blocks[int(m.group(1))], markdown)
    body = re.sub(
        r"[ \t]*\{#[^}\n]*\}[ \t]*$", "", body, flags=re.MULTILINE
    )  # pandoc's heading attributes
    body = re.sub(r"\n{3,}", "\n\n", body).strip()
    if check is None:
        checked = "The printed numbers were computed from the source and not compared with a PDF."
    elif check["not_located"]:
        checked = (
            f"{check['numbers_located_in_order']} of the {check['numbers_expected']} printed "
            f"numbers were located in order on the pages of `{check['pdf']}`; not located: "
            + ", ".join(f"({n})" for n in check["not_located"])
            + "."
        )
    else:
        checked = (
            f"All {check['numbers_expected']} printed numbers were located in order on the pages "
            f"of `{check['pdf']}`."
        )
    return f"""# {front["title"]}

{front["author"]} · arXiv:{ARXIV_ID}{ARXIV_VERSION} [physics.class-ph] · {ABSTRACT_URL}

> **Local reference copy.** Generated by `physics/oracle/paper.py` from the LaTeX source that
> arXiv distributes. The paper is under arXiv's non-exclusive distribution licence, so this file
> is neither tracked nor redistributed; run the script to rebuild it.
>
> **How it differs from the PDF.** Every display equation carries its printed number as
> `\\tag{{n}}`. The source's `\\label` names are gone: they look like numbers but are not the
> printed ones. Cross-references read "(n)" for equations and "Figure n" for figures, where the
> PDF prints the bare number. {checked}
>
> **Misprints are kept as printed.** `physics/equations.yaml` records which equations were
> checked and which carry errata.
>
> **Figures.** {FIGURE_NOTE}

## Abstract

{front["abstract"]}

*Keywords*: {front["keywords"]}

{body}
"""


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--offline", action="store_true", help="never contact arXiv")
    parser.add_argument(
        "--pdf",
        type=Path,
        default=DEFAULT_PDF,
        help="a PDF of the paper to check the printed numbers against (default: %(default)s)",
    )
    arguments = parser.parse_args()

    source_dir = REFERENCE / "source"
    fetched = fetch_source(source_dir, arguments.offline)
    tex = (source_dir / "Article.tex").read_text(encoding="utf-8")
    front, text, equations, figures, blocks = parse(tex)
    check = locate_in_pdf(arguments.pdf, equations)
    markdown = to_markdown(prepare_prose(text, equations, figures))

    (REFERENCE / "paper.md").write_text(assemble(front, markdown, blocks, check), encoding="utf-8")
    data = {
        "paper": {
            "arxiv": ARXIV_ID + ARXIV_VERSION,
            "url": ABSTRACT_URL,
            "title": front["title"],
            "author": front["author"],
        },
        "numbering_check": check,
        "equations": [asdict(equation) for equation in equations],
        "figures": [asdict(figure) for figure in figures],
    }
    (REFERENCE / "equations.json").write_text(
        json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )

    numbered = [e for e in equations if e.number is not None]
    print(f"source: {'fetched from arXiv' if fetched else 'already present'}, digests match")
    print(
        f"equations: {len(numbered)} numbered ({sum(e.tagged for e in numbered)} by hand tag), "
        f"{len(equations) - len(numbered)} unnumbered; figures: {len(figures)}"
    )
    if check is None:
        print("printed numbers: not compared with a PDF (no PDF, or no pdftotext)")
    else:
        print(
            f"printed numbers: {check['numbers_located_in_order']} of {check['numbers_expected']} "
            f"located in order in {check['pdf']}"
            + (f"; not located: {', '.join(check['not_located'])}" if check["not_located"] else "")
        )
    print(f"wrote {REFERENCE / 'paper.md'} and {REFERENCE / 'equations.json'}")


if __name__ == "__main__":
    main()
