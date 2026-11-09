from httpx import AsyncClient


async def test_health_reports_db(client: AsyncClient) -> None:
    r = await client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["db"] is True
