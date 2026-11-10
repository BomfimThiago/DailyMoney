"""Builds small text PDFs for tests: each page is a list of (x, y_from_top, text)."""

PAGE_W, PAGE_H = 595, 842


def _escape(text: str) -> bytes:
    raw = text.encode("cp1252")
    return raw.replace(b"\\", b"\\\\").replace(b"(", b"\\(").replace(b")", b"\\)")


def make_pdf(pages: list[list[tuple[float, float, str]]]) -> bytes:
    objects: list[bytes] = []
    font_id = 3
    page_ids = []
    next_id = 4
    bodies: list[tuple[int, bytes]] = []
    for words in pages:
        stream = b"".join(
            b"BT /F1 9 Tf 1 0 0 1 %.2f %.2f Tm (" % (x, PAGE_H - y) + _escape(t) + b") Tj ET\n"
            for x, y, t in words
        )
        content_id, page_id = next_id, next_id + 1
        next_id += 2
        bodies.append(
            (content_id, b"<< /Length %d >>\nstream\n" % len(stream) + stream + b"endstream")
        )
        bodies.append(
            (
                page_id,
                b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 %d %d] "
                b"/Resources << /Font << /F1 %d 0 R >> >> /Contents %d 0 R >>"
                % (PAGE_W, PAGE_H, font_id, content_id),
            )
        )
        page_ids.append(page_id)
    kids = b" ".join(b"%d 0 R" % i for i in page_ids)
    objects_by_id = {
        1: b"<< /Type /Catalog /Pages 2 0 R >>",
        2: b"<< /Type /Pages /Kids [" + kids + b"] /Count %d >>" % len(page_ids),
        3: b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
        **dict(bodies),
    }
    out = bytearray(b"%PDF-1.4\n")
    offsets = {}
    for oid in sorted(objects_by_id):
        offsets[oid] = len(out)
        out += b"%d 0 obj\n" % oid + objects_by_id[oid] + b"\nendobj\n"
    xref = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objects_by_id) + 1)
    for oid in sorted(objects_by_id):
        out += b"%010d 00000 n \n" % offsets[oid]
    out += b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (
        len(objects_by_id) + 1,
        xref,
    )
    del objects
    return bytes(out)
