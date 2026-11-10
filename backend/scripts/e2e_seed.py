"""Seed a running local API for the Android end-to-end check (CI only, never production).

Creates a one-time sign-in token, imports a synthetic statement dated this month through
the real API, and prints a second fresh token for the app to sign in with.

    uv run python scripts/e2e_seed.py http://localhost:8000 e2e@example.com
"""

import asyncio
import sys
from datetime import UTC, date, datetime, timedelta

import httpx
from sqlalchemy import update

from app.auth.models import MagicLinkToken
from app.core.security import hash_token, new_refresh_token
from app.db.session import SessionLocal
from app.families.models import User


async def new_token(email: str) -> str:
    raw = new_refresh_token()
    async with SessionLocal() as db:
        db.add(
            MagicLinkToken(
                email=email,
                token_hash=hash_token(raw),
                expires_at=datetime.now(UTC) + timedelta(hours=2),
            )
        )
        await db.commit()
    return raw


def statement(today: date) -> str:
    def d(day: int) -> str:
        return today.replace(day=min(day, today.day)).strftime("%d/%m/%Y")

    rows = [
        (1, "8500.00", "Transferência recebida - ACME LTDA"),
        (2, "-2800.00", "Pix enviado - Imobiliária Centro"),
        (3, "-1500.00", "Aplicação RDB"),
        (4, "-312.40", "Compra no débito - PAO DE ACUCAR"),
        (5, "-23.90", "Compra no débito - UBER"),
        (6, "300.00", "Resgate RDB"),
        (7, "-55.90", "Compra no débito - NETFLIX"),
        (8, "-400.00", "Transferência enviada pelo Pix - ANA TESTE - 123"),
    ]
    lines = ["Data,Valor,Identificador,Descrição"]
    lines += [f"{d(day)},{value},e2e-{i},{text}" for i, (day, value, text) in enumerate(rows)]
    return "\n".join(lines) + "\n"


async def main(base: str, email: str) -> None:
    async with httpx.AsyncClient(base_url=f"{base}/api/v1", timeout=30) as api:
        r = await api.post("/auth/magic-link/verify", json={"token": await new_token(email)})
        r.raise_for_status()
        # A full name lets the Pix to "ANA TESTE" wait as a transfer to confirm.
        async with SessionLocal() as db:
            await db.execute(update(User).where(User.email == email).values(name="Ana Teste"))
            await db.commit()
        h = {"Authorization": f"Bearer {r.json()['access_token']}"}
        files = {"file": ("nubank.csv", statement(date.today()).encode())}
        r = await api.post("/imports", files=files, headers=h)
        r.raise_for_status()
        preview = r.json()
        accounts = [
            {"currency": g["currency"], "new_account": {"name": "Nubank"}}
            for g in preview["groups"]
        ]
        r = await api.post(
            f"/imports/{preview['id']}/confirm", json={"accounts": accounts}, headers=h
        )
        r.raise_for_status()
    print(await new_token(email))


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1], sys.argv[2]))
