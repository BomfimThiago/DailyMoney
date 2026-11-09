import httpx
import pytest

from app.auth.services.magic_link import build_email
from app.core import email as email_mod
from app.core.email import Email, EmailError, send_email

MSG = Email(to="a@b.com", subject="s", html="<p>h</p>", text="t")


def test_magic_link_email_contains_escaped_link_and_expiry() -> None:
    e = build_email("a@b.com", "tok_123-abc")
    assert "/entrar?token=tok_123-abc" in e.text
    assert "15 minutos" in e.text
    assert 'href="http://localhost:8081/entrar?token=tok_123-abc"' in e.html


async def test_without_key_in_production_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.core.config.settings.RESEND_API_KEY", "")
    monkeypatch.setattr("app.core.config.settings.DEBUG", False)
    with pytest.raises(EmailError):
        await send_email(MSG)


async def test_without_key_in_debug_only_prints(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setattr("app.core.config.settings.RESEND_API_KEY", "")
    monkeypatch.setattr("app.core.config.settings.DEBUG", True)
    await send_email(MSG)
    assert "a@b.com" in capsys.readouterr().out


def _patch_transport(
    monkeypatch: pytest.MonkeyPatch, status: int, seen: list[httpx.Request]
) -> None:
    real = httpx.AsyncClient

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(status, json={"id": "x"})

    monkeypatch.setattr(
        "httpx.AsyncClient",
        lambda **kw: real(transport=httpx.MockTransport(handler), **kw),
    )
    monkeypatch.setattr("app.core.config.settings.RESEND_API_KEY", "re_test")


async def test_sends_through_resend(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: list[httpx.Request] = []
    _patch_transport(monkeypatch, 200, seen)
    await send_email(MSG)
    assert seen[0].url == "https://api.resend.com/emails"
    assert seen[0].headers["Authorization"] == "Bearer re_test"


async def test_resend_error_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    _patch_transport(monkeypatch, 422, [])
    with pytest.raises(EmailError):
        await send_email(MSG)
    assert email_mod.get_email_sender() is send_email
