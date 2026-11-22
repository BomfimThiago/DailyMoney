"""Connected banks against fake Enable Banking and Pluggy servers."""

import json
from collections.abc import Iterator
from datetime import date, timedelta
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
from tests.integration.conftest import approve_all, auth, login

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
        # Like CaixaBank: an older start than this is refused.
        self.oldest_start: date | None = None
        self.starts: list[date] = []
        # What the next authorization gives: another person's login gives other accounts.
        self.session_id = "sess-1"
        self.session_accounts: list[dict[str, Any]] = [
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
        ]
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
                    "session_id": self.session_id,
                    "aspsp": {"name": "Wise", "country": "ES"},
                    "access": {"valid_until": "2027-05-01T00:00:00Z"},
                    "accounts": self.session_accounts,
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
            query = parse_qs(urlparse(str(request.url)).query)
            key = query.get("continuation_key")
            start = date.fromisoformat(query["date_from"][0])
            if not key:
                self.starts.append(start)
            if self.oldest_start and start < self.oldest_start:
                return httpx.Response(
                    422,
                    json={
                        "error": "WRONG_TRANSACTIONS_PERIOD",
                        "message": "Wrong transactions period requested",
                    },
                )
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


async def _connect_wise(
    client: AsyncClient, h: dict[str, str], fake: FakeEnableBanking, **choice: Any
) -> Any:
    r = await client.post("/api/v1/connections/europe", json={"bank": "Wise", **choice}, headers=h)
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

    # Lines read from the bank wait for approval, like a sent statement.
    queue = (await client.get("/api/v1/transactions/review", headers=h)).json()
    assert sorted((g["source"], g["label"], len(g["items"])) for g in queue["groups"]) == [
        ("bank", "Wise · Wise EUR", 2),
        ("statement", "w.csv", 1),
    ]
    await approve_all(client, h)

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


async def test_a_bank_that_refuses_old_dates_is_read_from_its_last_90_days(
    client: AsyncClient, fake_eb: FakeEnableBanking
) -> None:
    # CaixaBank refuses a start more than 90 days back; after "Apagar todas as
    # transações" the app asks again from the connection's first day, a year back.
    fake_eb.oldest_start = date.today() - timedelta(days=90)
    h = auth(await login(client))
    result = await _connect_wise(client, h, fake_eb)
    eur = result["accounts"][0]
    assert (eur["new"], eur["error"]) == (3, None)
    assert result["connection"]["last_error"] is None
    year_back, safe = date.today() - timedelta(days=365), date.today() - timedelta(days=89)
    assert fake_eb.starts == [year_back, safe, year_back, safe]


async def test_a_refused_period_inside_90_days_is_still_shown(
    client: AsyncClient, fake_eb: FakeEnableBanking
) -> None:
    fake_eb.oldest_start = date.today()
    h = auth(await login(client))
    eur = (await _connect_wise(client, h, fake_eb))["accounts"][0]
    assert eur["error"].startswith("A Enable Banking respondeu 422 WRONG_TRANSACTIONS_PERIOD")


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
    await approve_all(client, h)
    txs = (await client.get("/api/v1/transactions?month=2026-10", headers=h)).json()["items"]
    assert len(txs) == 3


# ── Pluggy ───────────────────────────────────────────────────────────────────


# Who the last connect token was made for.
fake_pluggy_owner: list[str] = []


def fake_pluggy(request: httpx.Request) -> httpx.Response:
    path = request.url.path
    if path == "/auth":
        return httpx.Response(200, json={"apiKey": "k"})
    assert request.headers["X-API-KEY"] == "k"
    if path == "/connect_token":
        fake_pluggy_owner.append(json.loads(request.content)["options"]["clientUserId"])
        return httpx.Response(200, json={"accessToken": "token"})
    if path == "/items/item-nu":
        # Made by Pluggy's window and already authorized by the person in Meu Pluggy.
        item = {"id": "item-nu", "status": "UPDATED", "clientUserId": fake_pluggy_owner[-1]}
        return httpx.Response(200, json=item)
    if path == "/accounts":
        return httpx.Response(
            200,
            json={
                "results": [
                    {"id": "nu-acc", "type": "BANK", "currencyCode": "BRL", "name": "Nubank"},
                    {"id": "nu-card", "type": "CREDIT", "currencyCode": "BRL"},
                ]
            },
        )
    if path == "/investments":
        return httpx.Response(200, json={"results": [], "totalPages": 1})
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


async def test_a_bank_authorized_in_meu_pluggy_shows_up_and_syncs(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "PLUGGY_CLIENT_ID", "id")
    monkeypatch.setattr(settings, "PLUGGY_CLIENT_SECRET", "secret")
    monkeypatch.setattr(pluggy, "transport", httpx.MockTransport(fake_pluggy))
    monkeypatch.setattr(pluggy, "_key", None)
    h = auth(await login(client))

    overview = (await client.get("/api/v1/connections", headers=h)).json()
    assert overview["brazil_ready"] is True
    assert overview["connections"] == []
    r = await client.post("/api/v1/connections/brazil", headers=h)
    assert r.json() == {"connect_token": "token", "connector_id": 200}
    r = await client.post(
        "/api/v1/connections/brazil/items", json={"item_id": "item-nu"}, headers=h
    )
    assert r.status_code == 204
    [conn] = (await client.get("/api/v1/connections", headers=h)).json()["connections"]
    assert (conn["bank"], conn["provider"], conn["accounts"]) == ("Nubank", "pluggy", [])

    result = (await client.post(f"/api/v1/connections/{conn['id']}/sync", headers=h)).json()
    assert [(a["name"], a["new"]) for a in result["accounts"]] == [
        ("Nubank BRL", 3),
        ("Nubank cartão", 2),
    ]
    await approve_all(client, h)
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
    # A recent day: a later sync only reads back OVERLAP_DAYS before the last one.
    recent = (date.today() - timedelta(days=2)).isoformat()
    fake_eb.transactions["acc-eur"].append(_tx("r9", recent, "5.00", "DBIT", "Kiosko"))
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


ANA_ACCOUNT = {
    "uid": "acc-ana",
    "identification_hash": "h-ana",
    "currency": "EUR",
    "cash_account_type": "CACC",
    "account_id": {"iban": "LT00 9876"},
}


def _ana_logs_in(fake: FakeEnableBanking) -> None:
    fake.session_id = "sess-ana"
    fake.session_accounts = [ANA_ACCOUNT]
    fake.transactions["acc-ana"] = [_tx("a1", "2026-10-08", "30.00", "DBIT", "Zara")]


async def _add_member(client: AsyncClient, h: dict[str, str], name: str) -> str:
    r = await client.post("/api/v1/family/members", json={"name": name}, headers=h)
    assert r.status_code in (200, 201), r.text
    member_id: str = r.json()["id"]
    return member_id


async def test_a_second_person_connects_the_same_bank_into_their_own_accounts(
    client: AsyncClient, fake_eb: FakeEnableBanking
) -> None:
    h = auth(await login(client))
    mine = (await _connect_wise(client, h, fake_eb))["connection"]
    assert mine["member_name"] == "Thiago"
    ana = await _add_member(client, h, "Ana")

    _ana_logs_in(fake_eb)
    theirs = await _connect_wise(client, h, fake_eb, member_id=ana)
    assert theirs["connection"]["id"] != mine["id"]
    assert (theirs["connection"]["member_id"], theirs["connection"]["member_name"]) == (ana, "Ana")
    # Thiago's Wise EUR is not Ana's: hers is a new account, in her name.
    assert [a["name"] for a in theirs["connection"]["accounts"]] == ["Wise EUR Ana"]
    assert theirs["accounts"][0]["new"] == 1
    # Thiago's authorization keeps working.
    assert fake_eb.deleted == []

    overview = (await client.get("/api/v1/connections", headers=h)).json()
    assert [(c["bank"], c["member_name"]) for c in overview["connections"]] == [
        ("Wise", "Thiago"),
        ("Wise", "Ana"),
    ]
    accounts = (await client.get("/api/v1/accounts", headers=h)).json()
    owners = {a["name"]: a["member_id"] for a in accounts}
    assert owners["Wise EUR Ana"] == ana
    assert owners["Wise EUR"] == mine["member_id"]


async def test_the_same_accounts_authorized_again_renew_their_connection(
    client: AsyncClient, fake_eb: FakeEnableBanking
) -> None:
    h = auth(await login(client))
    first = (await _connect_wise(client, h, fake_eb))["connection"]
    fake_eb.session_id = "sess-2"
    again = (await _connect_wise(client, h, fake_eb))["connection"]
    assert again["id"] == first["id"]
    assert fake_eb.deleted == ["sess-1"]
    assert len((await client.get("/api/v1/connections", headers=h)).json()["connections"]) == 1


async def test_conectar_de_novo_renews_the_connection_asked_for(
    client: AsyncClient, fake_eb: FakeEnableBanking
) -> None:
    h = auth(await login(client))
    ana = await _add_member(client, h, "Ana")
    _ana_logs_in(fake_eb)
    hers = (await _connect_wise(client, h, fake_eb, member_id=ana))["connection"]
    fake_eb.session_id = "sess-ana-2"
    # Even if the bank now shares a different set of accounts.
    fake_eb.session_accounts = [{**ANA_ACCOUNT, "identification_hash": "h-ana-new"}]
    again = (await _connect_wise(client, h, fake_eb, connection_id=hers["id"]))["connection"]
    assert again["id"] == hers["id"]
    assert again["member_name"] == "Ana"
    assert fake_eb.deleted == ["sess-ana"]

    other = auth(await login(client, "token-partner-padded"))
    r = await client.post(
        "/api/v1/connections/europe",
        json={"bank": "Wise", "connection_id": hers["id"]},
        headers=other,
    )
    assert r.status_code == 404


async def test_a_connection_can_belong_to_the_household(
    client: AsyncClient, fake_eb: FakeEnableBanking
) -> None:
    h = auth(await login(client))
    conn = (await _connect_wise(client, h, fake_eb, member_id=None))["connection"]
    assert (conn["member_id"], conn["member_name"]) == (None, None)
    accounts = (await client.get("/api/v1/accounts", headers=h)).json()
    assert {a["name"]: a["member_id"] for a in accounts}["Wise EUR"] is None


async def test_only_the_familys_own_people_can_own_a_connection(
    client: AsyncClient, fake_eb: FakeEnableBanking
) -> None:
    h = auth(await login(client))
    other = auth(await login(client, "token-partner-padded"))
    stranger = await _add_member(client, other, "Bia")
    r = await client.post(
        "/api/v1/connections/europe", json={"bank": "Wise", "member_id": stranger}, headers=h
    )
    assert r.status_code == 404


async def test_a_person_removed_during_the_authorization_leaves_it_to_the_household(
    client: AsyncClient, fake_eb: FakeEnableBanking
) -> None:
    h = auth(await login(client))
    ana = await _add_member(client, h, "Ana")
    r = await client.post(
        "/api/v1/connections/europe", json={"bank": "Wise", "member_id": ana}, headers=h
    )
    assert r.status_code == 200
    assert (await client.delete(f"/api/v1/family/members/{ana}", headers=h)).status_code == 204
    r = await client.post(
        "/api/v1/connections/europe/finish", json={"code": "c", "state": fake_eb.state}, headers=h
    )
    assert r.status_code == 200, r.text
    assert r.json()["connection"]["member_id"] is None


async def test_an_authorization_started_before_owners_existed_goes_to_whoever_connected(
    client: AsyncClient, fake_eb: FakeEnableBanking
) -> None:
    h = auth(await login(client))
    me = (await client.get("/api/v1/auth/me", headers=h)).json()
    old_state = jwt.encode(
        {
            "sub": me["id"],
            "aud": connection_service.STATE_AUDIENCE,
            "aspsp": "Wise",
            "country": "ES",
            "exp": 4102444800,
        },
        settings.SECRET_KEY,
        algorithm="HS256",
    )
    r = await client.post(
        "/api/v1/connections/europe/finish", json={"code": "c", "state": old_state}, headers=h
    )
    assert r.status_code == 200, r.text
    assert r.json()["connection"]["member_name"] == "Thiago"
