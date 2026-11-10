"""A Pix or transfer to or from a family member: probably money between their own accounts.

Without the other side in another imported account this can't be proven, so such a line
waits for the person to confirm it (spec: transferências "aguardando confirmar").
"""

import re
import unicodedata

_PARTICLES = {"de", "da", "do", "das", "dos", "e", "del", "la", "y"}
_MOVE_WORDS = re.compile(
    r"\b(pix|ted|doc|transf\w*|traspaso|bizum|payment|sent|received|money|envi\w*|receb\w*)\b"
)


def _words(text: str) -> list[str]:
    text = unicodedata.normalize("NFD", text.lower())
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    return re.findall(r"[a-z]+", text)


def _first_and_last(name: str) -> tuple[str, str] | None:
    words = [w for w in _words(name) if w not in _PARTICLES]
    # A first name alone ("Ana") matches too many other people.
    return (words[0], words[-1]) if len(words) >= 2 else None


def looks_like_self_transfer(description: str, names: list[str]) -> bool:
    plain = " ".join(_words(description))
    if not _MOVE_WORDS.search(plain):
        return False
    words = set(plain.split())
    for name in names:
        pair = _first_and_last(name)
        if pair and pair[0] in words and pair[1] in words:
            return True
    return False
