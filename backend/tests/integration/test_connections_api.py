"""Connected banks against fake Enable Banking and Pluggy servers."""

import json
from collections.abc import Iterator
from typing import Any
from urllib.parse import parse_qs, urlparse

import httpx
import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from httpx import AsyncClient

from app.connections import daily
from app.connections.services import connection_service, enablebanking, pluggy
from app.core.config import settings
from tests.integration.conftest import auth, login

KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
PEM = KEY.private_bytes(
    serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()
).decode()

WISE_EUR_CSV = (
    '"TransferWise ID",Date,"Date Time",Amount,Currency,Description,"Payment Reference",'
    '"Running Balance","Exchange From","Exchange To","Exchange Rate","Payer Name","Payee Name",'
    '"Payee Account Number",Merchant,"Card Last Four Digits","Card Holder Full Name",Attachment,'
    'Note,"Total fees","Exchange To Amount","Transaction Type","Transaction Details Type"\n'
    'CARD-1,03-10-2026,"03-10-2026 10:00:00.000",-45.20,EUR,"Card transaction of 45.20 EUR '
    'issued by Mercadona MADRID",,954.80,,,,,,,Mercadona,1234,,,,0.00,,DEBIT,CARD\n'
)


def _tx(
    ref: str, day: str, amount: str, side: str, name: str, status: str = "BOOK"
) -> dict[str, Any]:
    party = {"creditor" if side == "DBIT" else "debtor": {"name": name}}
    return {
        "entry_reference": ref,
        "transaction_amount": {"currency": "EUR", "amount": amount},
        "credit_debit_indicator": side,
        "status": status,
        "booking_date": day,
        **party,
    }


class FakeEnableBanking:
    def __init__(self) -> None:
        self.state = ""
        self.session_status = "AUTHORIZED"
        self.deleted: list[str] = []
        self.transactions: dict[str, list[dict[str, Any]]] = {
            "acc-eur": [
                # Already sent in the Wise statement: a duplicate.
                _tx("r1", "2026-10-03", "45.20", "DBIT", "Mercadona"),
                _tx("r2", "2026-10-05", "12.00", "DBIT", "Cafe Sol"),
                _tx("r3", "2026-10-06", "2000.00", "CRDT", "ACME SL"),
                _tx("r4", "2026-10-07", "9.99", "DBIT", "Netflix", status="PDNG"),
            ],
            "acc-usd": [],
        }

    def __call__(self, request: httpx.Request) -> httpx.Response:
        token = request.headers["Authorization"].removeprefix("Bearer ")
        assert jwt.get_unverified_header(token)["kid"] == "app-1"
        jwt.decode(token, KEY.public_key(), algorithms=["RS256"], audience="api.enablebanking.com")
        path = request.url.path
        if path == "/aspsps":
            return httpx.Response(
                200, json={"aspsps": [{"name": "Wise", "country": "ES", "psu_types": ["personal"]}]}
            )
        if path == "/auth":
            body = json.loads(request.content)
            self.state = body["state"]
            assert body["redirect_url"].endswith("/conexoes/retorno")
            return httpx.Response(200, json={"url": "https://bank.example/auth?x=1"})
        if path == "/sessions" and request.method == "POST":
            return httpx.Response(
                200,
                json={
                    "session_id": "sess-1",
                    "aspsp": {"name": "Wise", "country": "ES"},
                    "access": {"valid_until": "2027-05-01T00:00:00Z"},
                    "accounts": [
                        {
                            "uid": "acc-eur",
                            "identification_hash": "h-eur",
                            "currency": "EUR",
                            "cash_account_type": "CACC",
                            "account_id": {"iban": "BE00 1234"},
                        },
                        {
                            "uid": "acc-usd",
                            "identification_hash": "h-usd",
                            "currency": "USD",
                            "cash_account_type": "CACC",
                        },
                    ],
                },
            )
        if path.startswith("/sessions/"):
            if request.method == "DELETE":
                self.deleted.append(path.split("/")[-1])
                return httpx.Response(200, json={})
            return httpx.Response(
                200,
                json={
                    "status": self.session_status,
                    "access": {"valid_until": "2027-05-01T00:00:00Z"},
                },
            )
        if path.startswith("/accounts/"):
            uid = path.split("/")[2]
            txs = self.transactions[uid]
            key = parse_qs(urlparse(str(request.url)).query).get("continuation_key")
            # Two pages, to follow the continuation key.
            if not key:
                return httpx.Response(200, json={"transactions": txs[:2], "continuation_key": "p2"})
            return httpx.Response(200, json={"transactions": txs[2:]})
        return httpx.Response(404, json={"error": "NOT_FOUND"})


@pytest.fixture
def fake_eb(monkeypatch: pytest.MonkeyPatch) -> Iterator[FakeEnableBanking]:
    fake = FakeEnableBanking()
    monkeypatch.setattr(settings, "ENABLE_BANKING_APP_ID", "app-1")
    monkeypatch.setattr(settings, "ENABLE_BANKING_PRIVATE_KEY", PEM)
    monkeypatch.setattr(enablebanking, "transport", httpx.MockTransport(fake))
    monkeypatch.setattr(enablebanking, "_token", None)
    yield fake


async def _connect_wise(client: AsyncClient, h: dict[str, str], fake: FakeEnableBanking) -> Any:
    r = await client.post("/api/v1/connections/europe", json={"bank": "Wise"}, headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["url"].startswith("https://bank.example/")
    r = await client.post(
        "/api/v1/connections/europe/finish", json={"code": "c1", "state": fake.state}, headers=h
    )
    assert r.status_code == 200, r.text
    return r.json()


async def test_nothing_configured(client: AsyncClient) -> None:
    h = auth(await login(client))
    r = await client.get("/api/v1/connections", headers=h)
    assert r.json() == {"connections": [], "european_banks": [], "brazil_ready": False}
    r = await client.post("/api/v1/connections/europe", json={"bank": "Wise"}, headers=h)
    assert r.status_code == 503
    assert (await client.get("/api/v1/connections")).status_code == 401


async def test_connect_wise_reads_into_the_existing_account_without_duplicates(
    client: AsyncClient, fake_eb: FakeEnableBanking
) -> None:
    h = auth(await login(client))
    r = await client.post(
        "/api/v1/imports", files={"file": ("w.csv", WISE_EUR_CSV.encode())}, headers=h
    )
    preview = r.json()
    r = await client.post(
        f"/api/v1/imports/{preview['id']}/confirm",
        json={"accounts": [{"currency": "EUR", "new_account": {"name": "Wise EUR"}}]},
        headers=h,
    )
    assert r.status_code == 200, r.text

    overview = (await client.get("/api/v1/connections", headers=h)).json()
    assert overview["european_banks"] == ["Wise", "Revolut", "CaixaBank"]

    result = await _connect_wise(client, h, fake_eb)
    assert result["connection"]["bank"] == "Wise"
    assert [a["name"] for a in result["connection"]["accounts"]] == ["Wise EUR", "Wise USD"]
    eur = result["accounts"][0]
    # Cafe and the salary are new; Mercadona was in the statement; the pending one waits.
    assert (eur["name"], eur["new"], eur["duplicate"], eur["error"]) == ("Wise EUR", 2, 1, None)

    txs = (await client.get("/api/v1/transactions?month=2026-10", headers=h)).json()["items"]
    assert sorted(float(t["amount"]) for t in txs) == [-45.2, -12.0, 2000.0]
    # Reads of a connected bank don't show as sent statements.
    imports = (await client.get("/api/v1/imports", headers=h)).json()
    assert [i["format"] for i in imports] == ["csv"]

    # Reading again brings nothing twice.
    conn_id = result["connection"]["id"]
    again = (await client.post(f"/api/v1/connections/{conn_id}/sync", headers=h)).json()
    assert again["accounts"][0]["new"] == 0
    assert again["connection"]["last_sync_at"]
    assert again["connection"]["last_error"] is None

    # Connecting again renews the same connection and closes the old session.
    fake_eb.transactions["acc-eur"].append(_tx("r5", "2026-10-09", "30.00", "DBIT", "Zara"))
    renewed = await _connect_wise(client, h, fake_eb)
    assert renewed["connection"]["id"] == conn_id
    assert renewed["accounts"][0]["new"] == 1
    assert len((await client.get("/api/v1/connections", headers=h)).json()["connections"]) == 1


async def test_expired_authorization_is_shown(
    client: AsyncClient, fake_eb: FakeEnableBanking
) -> None:
    h = auth(await login(client))
    conn_id = (await _connect_wise(client, h, fake_eb))["connection"]["id"]
    fake_eb.session_status = "EXPIRED"
    result = (await client.post(f"/api/v1/connections/{conn_id}/sync", headers=h)).json()
    assert result["accounts"] == []
    assert (
        result["connection"]["last_error"] == "A autorização deste banco venceu. Conecte de novo."
    )


async def test_return_from_the_bank_must_be_ours(
    client: AsyncClient, fake_eb: FakeEnableBanking
) -> None:
    h = auth(await login(client))
    r = await client.post(
        "/api/v1/connections/europe/finish", json={"code": "c1", "state": "forged"}, headers=h
    )
    assert r.status_code == 409
    await client.post("/api/v1/connections/europe", json={"bank": "Wise"}, headers=h)
    other = auth(await login(client, "token-partner-padded"))
    r = await client.post(
        "/api/v1/connections/europe/finish",
        json={"code": "c1", "state": fake_eb.state},
        headers=other,
    )
    assert r.status_code == 409
    r = await client.post("/api/v1/connections/europe", json={"bank": "Banco X"}, headers=h)
    assert r.status_code == 422


async def test_disconnect_keeps_transactions_and_hides_from_other_families(
    client: AsyncClient, fake_eb: FakeEnableBanking
) -> None:
    h = auth(await login(client))
    conn_id = (await _connect_wise(client, h, fake_eb))["connection"]["id"]
    other = auth(await login(client, "token-partner-padded"))
    assert (await client.delete(f"/api/v1/connections/{conn_id}", headers=other)).status_code == 404
    assert (
        await client.post(f"/api/v1/connections/{conn_id}/sync", headers=other)
    ).status_code == 404

    assert (await client.delete(f"/api/v1/connections/{conn_id}", headers=h)).status_code == 204
    assert fake_eb.deleted == ["sess-1"]
    assert (await client.get("/api/v1/connections", headers=h)).json()["connections"] == []
    txs = (await client.get("/api/v1/transactions?month=2026-10", headers=h)).json()["items"]
    assert len(txs) == 3


# ── Pluggy ───────────────────────────────────────────────────────────────────


def fake_pluggy(request: httpx.Request) -> httpx.Response:
    path = request.url.path
    if path == "/auth":
        return httpx.Response(200, json={"apiKey": "k"})
    assert request.headers["X-API-KEY"] == "k"
    if path == "/items/item-nu":
        return httpx.Response(
            200, json={"id": "item-nu", "status": "UPDATED", "connector": {"name": "Nubank"}}
        )
    if path == "/accounts":
        return httpx.Response(
            200,
            json={
                "results": [
                    {"id": "nu-acc", "type": "BANK", "currencyCode": "BRL"},
                    {"id": "nu-card", "type": "CREDIT", "currencyCode": "BRL"},
                ]
            },
        )
    if path == "/v2/transactions":
        account = request.url.params["accountId"]
        if account == "nu-acc":
            return httpx.Response(
                200,
                json={
                    "results": [
                        {
                            "id": "t1",
                            "date": "2026-10-03T02:00:00.000Z",
                            "description": "Padaria",
                            "amount": -12.5,
                            "currencyCode": "BRL",
                        },
                        {
                            "id": "t2",
                            "date": "2026-10-04T15:00:00.000Z",
                            "description": "Pagamento de fatura",
                            "amount": -300,
                            "currencyCode": "BRL",
                        },
                        {
                            "id": "t3",
                            "date": "2026-10-05T15:00:00.000Z",
                            "description": "Aplicação RDB",
                            "amount": -1000,
                            "currencyCode": "BRL",
                            "category": "Investments",
                        },
                    ],
                    "next": None,
                },
            )
        return httpx.Response(
            200,
            json={
                "results": [
                    {
                        "id": "c1",
                        "date": "2026-10-06T15:00:00.000Z",
                        "description": "Amazon",
                        "amount": 89.9,
                        "currencyCode": "BRL",
                    },
                    {
                        "id": "c2",
                        "date": "2026-10-07T15:00:00.000Z",
                        "description": "Steam",
                        "amount": 10,
                        "currencyCode": "USD",
                        "amountInAccountCurrency": 55.3,
                    },
                ]
            },
        )
    return httpx.Response(404, json={"message": "not found"})


async def test_meu_pluggy_items_show_up_and_sync(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "PLUGGY_CLIENT_ID", "id")
    monkeypatch.setattr(settings, "PLUGGY_CLIENT_SECRET", "secret")
    monkeypatch.setattr(settings, "PLUGGY_ITEM_IDS", ["item-nu", "item-gone"])
    monkeypatch.setattr(pluggy, "transport", httpx.MockTransport(fake_pluggy))
    monkeypatch.setattr(pluggy, "_key", None)
    h = auth(await login(client))

    overview = (await client.get("/api/v1/connections", headers=h)).json()
    assert overview["brazil_ready"] is True
    [conn] = overview["connections"]
    assert (conn["bank"], conn["provider"], conn["accounts"]) == ("Nubank", "pluggy", [])

    result = (await client.post(f"/api/v1/connections/{conn['id']}/sync", headers=h)).json()
    assert [(a["name"], a["new"]) for a in result["accounts"]] == [
        ("Nubank BRL", 3),
        ("Nubank cartão", 2),
    ]
    txs = (await client.get("/api/v1/transactions?month=2026-10", headers=h)).json()["items"]
    by = {t["description"]: (t["date"], t["amount"], t["kind"]) for t in txs}
    # 02:00 UTC is still the day before in Brasília.
    assert by["Padaria"] == ("2026-10-02", "-12.5000", "regular")
    assert by["Pagamento de fatura"][2] == "transfer"
    assert by["Aplicação RDB"][2] == "investment"
    assert by["Amazon"][1] == "-89.9000"
    assert by["Steam"][1] == "-55.3000"

    again = (await client.post(f"/api/v1/connections/{conn['id']}/sync", headers=h)).json()
    assert [a["new"] for a in again["accounts"]] == [0, 0]
    # Listing again doesn't add the same item twice.
    assert len((await client.get("/api/v1/connections", headers=h)).json()["connections"]) == 1


async def test_sync_all_reads_every_connection(
    client: AsyncClient, fake_eb: FakeEnableBanking, db: Any
) -> None:
    h = auth(await login(client))
    await _connect_wise(client, h, fake_eb)
    fake_eb.transactions["acc-eur"].append(_tx("r9", "2026-10-20", "5.00", "DBIT", "Kiosko"))
    [result] = await connection_service.sync_all(db)
    assert result.accounts[0].new == 1


async def test_daily_run_uses_its_own_session(
    client: AsyncClient, fake_eb: FakeEnableBanking, monkeypatch: pytest.MonkeyPatch
) -> None:
    calls: list[Any] = []

    async def fake_sync_all(db: Any) -> list[Any]:
        calls.append(db)
        return []

    monkeypatch.setattr(connection_service, "sync_all", fake_sync_all)
    await daily.run_once()
    assert len(calls) == 1
