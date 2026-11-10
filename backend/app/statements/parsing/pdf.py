"""PDF statements: text PDFs by word position, scanned ones by OCR.

Each bank gets its own small reader (pdf_banks.py) because a PDF has no columns, only
words placed on a page. Every reader checks the numbers against something the bank
printed (section totals or the running balance); rows that don't add up become errors
instead of being imported with a wrong value.
"""

import logging
import re
import shutil
import subprocess
from dataclasses import dataclass
from io import BytesIO

from app.statements.parsing.errors import StatementError
from app.statements.parsing.types import ParsedStatement

# Words closer than this (in points) belong to the same text segment.
# pdfminer warns about harmless font metadata on every bank PDF.
logging.getLogger("pdfminer").setLevel(logging.ERROR)

_SEGMENT_GAP = 6.0
_LINE_TOLERANCE = 3.0
# Each pass misreads different characters; readers combine them and keep, per row, a
# reading the statement's own balances confirm. Order: most accurate pass first.
_OCR_PASSES = ((3, True), (3, False), (4, True))
_OCR_TIMEOUT = 60
_MIN_TEXT_DIGITS = 40


@dataclass(frozen=True)
class Segment:
    x0: float
    x1: float
    text: str


@dataclass(frozen=True)
class Line:
    page: int
    top: float
    segments: tuple[Segment, ...]

    @property
    def text(self) -> str:
        return " ".join(s.text for s in self.segments)


def read_pdf(data: bytes) -> ParsedStatement:
    from app.statements.parsing import pdf_banks

    lines = _text_lines(data)
    text = "\n".join(line.text for line in lines)
    # Scanned statements still carry a little text (page numbers); look for real content.
    if len(re.findall(r"\d", text)) >= _MIN_TEXT_DIGITS:
        for reader in pdf_banks.TEXT_READERS:
            if reader.matches(text):
                return reader.read(lines)
        raise StatementError(
            "Ainda não sei ler o PDF deste banco. Envie o extrato em CSV, OFX ou XLSX, "
            "se o banco oferecer."
        )
    first_pass = _ocr(data, *_OCR_PASSES[0])
    for ocr_reader in pdf_banks.OCR_READERS:
        if ocr_reader.matches(first_pass):
            others = [_ocr(data, scale, gray) for scale, gray in _OCR_PASSES[1:]]
            return ocr_reader.read([first_pass, *others])
    raise StatementError(
        "Este PDF é uma imagem e não reconheci o banco. Envie o extrato em CSV, OFX ou XLSX."
    )


def _text_lines(data: bytes) -> list[Line]:
    import pdfplumber

    try:
        pdf = pdfplumber.open(BytesIO(data))
    except Exception as exc:
        if "password" in str(exc).lower():
            raise StatementError("O PDF tem senha. Abra, salve sem senha e envie de novo.") from exc
        raise StatementError("Não consegui abrir o PDF. Ele pode estar corrompido.") from exc
    lines: list[Line] = []
    try:
        if not pdf.pages:
            raise StatementError("O PDF não tem páginas.")
        for number, page in enumerate(pdf.pages, start=1):
            lines.extend(_page_lines(number, page.extract_words(x_tolerance=1.5)))
    except Exception as exc:
        if isinstance(exc, StatementError):
            raise
        if "password" in str(exc).lower() or "encrypt" in str(exc).lower():
            raise StatementError("O PDF tem senha. Abra, salve sem senha e envie de novo.") from exc
        raise StatementError("Não consegui ler o PDF.") from exc
    finally:
        pdf.close()
    return lines


def _page_lines(page: int, words: list[dict[str, object]]) -> list[Line]:
    rows: list[list[dict[str, object]]] = []
    for word in sorted(words, key=lambda w: (_num(w["top"]), _num(w["x0"]))):
        if rows and abs(_num(rows[-1][0]["top"]) - _num(word["top"])) <= _LINE_TOLERANCE:
            rows[-1].append(word)
        else:
            rows.append([word])
    lines = []
    for row in rows:
        segments: list[Segment] = []
        for word in sorted(row, key=lambda w: _num(w["x0"])):
            x0, x1, text = _num(word["x0"]), _num(word["x1"]), str(word["text"])
            if segments and x0 - segments[-1].x1 < _SEGMENT_GAP:
                last = segments[-1]
                segments[-1] = Segment(last.x0, x1, f"{last.text} {text}")
            else:
                segments.append(Segment(x0, x1, text))
        lines.append(Line(page=page, top=_num(row[0]["top"]), segments=tuple(segments)))
    return lines


def _num(value: object) -> float:
    return float(value)  # type: ignore[arg-type]


def _ocr(data: bytes, scale: int, grayscale: bool) -> str:
    binary = shutil.which("tesseract")
    if not binary:
        raise StatementError(
            "Este PDF é uma imagem (sem texto) e o leitor de imagens não está instalado. "
            "Envie o extrato em CSV, OFX ou XLSX."
        )
    import pypdfium2

    pages: list[str] = []
    document = pypdfium2.PdfDocument(data)
    try:
        for page in document:
            image = page.render(scale=scale, grayscale=grayscale).to_pil()
            buffer = BytesIO()
            image.save(buffer, format="PNG")
            result = subprocess.run(  # noqa: S603 - fixed binary, no shell
                [binary, "stdin", "stdout", "-l", "spa", "--psm", "6"],
                input=buffer.getvalue(),
                capture_output=True,
                timeout=_OCR_TIMEOUT,
                check=False,
            )
            if result.returncode != 0:
                raise StatementError("Não consegui ler a imagem do PDF.")
            pages.append(result.stdout.decode("utf-8", errors="replace"))
    finally:
        document.close()
    text = "\n".join(pages)
    if not re.search(r"\d", text):
        raise StatementError("Não encontrei texto legível no PDF.")
    return text
