from httpx import AsyncClient

from tests.integration.conftest import approve_all, auth, login

NUBANK = (
    "Data,Valor,Identificador,Descrição\n"
    "03/10/2026,-200.00,id-1,Compra no débito - MERCADONA\n"
    "04/10/2026,-50.00,id-2,Compra no débito - PADARIA\n"
)


async def _import_nubank(client: AsyncClient, h: dict[str, str]) -> None:
    r = await client.post("/api/v1/imports", files={"file": ("nu.csv", NUBANK.encode())}, headers=h)
    assert r.status_code == 201, r.text
    preview = r.json()
    accounts = [
        {"currency": g["currency"], "new_account": {"name": "Nubank"}} for g in preview["groups"]
    ]
    r = await client.post(
        f"/api/v1/imports/{preview['id']}/confirm", json={"accounts": accounts}, headers=h
    )
    assert r.status_code == 200, r.text
    await approve_all(client, h)


async def test_new_account_belongs_to_whoever_imported_it(client: AsyncClient) -> None:
    h = auth(await login(client))
    await _import_nubank(client, h)
    me = (await client.get("/api/v1/family", headers=h)).json()["members"][0]
    [account] = (await client.get("/api/v1/accounts", headers=h)).json()
    assert account["member_id"] == me["id"]


async def test_changing_the_owner_moves_the_account_and_its_lines(client: AsyncClient) -> None:
    h = auth(await login(client))
    await _import_nubank(client, h)
    ana = (await client.post("/api/v1/family/members", json={"name": "Ana"}, headers=h)).json()
    [account] = (await client.get("/api/v1/accounts", headers=h)).json()

    r = await client.patch(
        f"/api/v1/accounts/{account['id']}", json={"member_id": ana["id"]}, headers=h
    )
    assert r.status_code == 200, r.text
    assert r.json()["member_id"] == ana["id"]
    lines = (await client.get("/api/v1/transactions?month=2026-10", headers=h)).json()
    assert lines["items"]
    assert {t["member_id"] for t in lines["items"]} == {ana["id"]}


async def test_account_can_belong_to_the_whole_household(client: AsyncClient) -> None:
    h = auth(await login(client))
    await _import_nubank(client, h)
    [account] = (await client.get("/api/v1/accounts", headers=h)).json()
    r = await client.patch(f"/api/v1/accounts/{account['id']}", json={"member_id": None}, headers=h)
    assert r.status_code == 200
    assert r.json()["member_id"] is None
    lines = (await client.get("/api/v1/transactions?month=2026-10", headers=h)).json()
    assert {t["member_id"] for t in lines["items"]} == {None}


async def test_deleting_a_member_leaves_their_accounts_to_the_household(
    client: AsyncClient,
) -> None:
    h = auth(await login(client))
    await _import_nubank(client, h)
    ana = (await client.post("/api/v1/family/members", json={"name": "Ana"}, headers=h)).json()
    [account] = (await client.get("/api/v1/accounts", headers=h)).json()
    await client.patch(
        f"/api/v1/accounts/{account['id']}", json={"member_id": ana["id"]}, headers=h
    )

    await client.delete(f"/api/v1/family/members/{ana['id']}", headers=h)
    [account] = (await client.get("/api/v1/accounts", headers=h)).json()
    assert account["member_id"] is None


async def test_owner_from_another_family_or_missing_account_is_not_found(
    client: AsyncClient,
) -> None:
    thiago = auth(await login(client))
    await _import_nubank(client, thiago)
    [account] = (await client.get("/api/v1/accounts", headers=thiago)).json()
    partner = auth(await login(client, "token-partner-padded"))
    stranger_member = (await client.get("/api/v1/family", headers=partner)).json()["members"][0]

    r = await client.patch(
        f"/api/v1/accounts/{account['id']}",
        json={"member_id": stranger_member["id"]},
        headers=thiago,
    )
    assert r.status_code == 404
    r = await client.patch(
        f"/api/v1/accounts/{account['id']}", json={"member_id": None}, headers=partner
    )
    assert r.status_code == 404
