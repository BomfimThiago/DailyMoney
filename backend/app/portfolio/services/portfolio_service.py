"""Investments of the connected banks: saved on every bank read, shown as a portfolio.

On each read the position of every investment is updated (not duplicated: the bank's own
id) and the day's balance becomes a point of its history.
"""

import uuid
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.connections.models import BankConnection
from app.connections.services import pluggy
from app.families.models import Currency, Family
from app.fx.services.fx_service import converter
from app.portfolio.models import GONE, OPEN_STATUSES, Investment, InvestmentSnapshot
from app.portfolio.schemas import (
    BankTotal,
    ClassOut,
    HistoryPoint,
    LadderOut,
    LadderStepOut,
    MaturingOut,
    PortfolioOut,
    PositionOut,
    TrackedOut,
)
from app.portfolio.services import summary
from app.portfolio.services.mapping import Position, map_investments

ZERO = Decimal(0)
HISTORY_DAYS = 365
MATURING_MONTHS = 12


async def sync_investments(db: AsyncSession, conn: BankConnection, today: date) -> list[str]:
    """Reads and saves the investments of a Pluggy connection; returns what couldn't be read."""
    positions, errors = map_investments(await pluggy.list_investments(conn.external_id))
    await save_investments(db, conn, positions, complete=not errors, today=today)
    return errors


async def save_investments(
    db: AsyncSession,
    conn: BankConnection,
    positions: list[Position],
    *,
    complete: bool,
    today: date,
) -> None:
    for p in positions:
        values = {
            "connection_id": conn.id,
            "bank": conn.bank,
            "name": p.name,
            "type": p.type,
            "subtype": p.subtype,
            "issuer": p.issuer,
            "code": p.code,
            "currency": p.currency,
            "balance": p.balance,
            "amount_original": p.amount_original,
            "rate": p.rate,
            "rate_type": p.rate_type,
            "fixed_annual_rate": p.fixed_annual_rate,
            "due_date": p.due_date,
            "status": p.status,
            "value_date": p.value_date,
        }
        saved_id = await db.scalar(
            insert(Investment)
            .values(
                id=uuid.uuid4(),
                family_id=conn.family_id,
                provider=conn.provider,
                external_id=p.external_id,
                **values,
            )
            .on_conflict_do_update(constraint="uq_investment_external", set_=values)
            .returning(Investment.id)
        )
        await _snapshot(db, saved_id, p.value_date, p.balance)

    # The bank stopped reporting a position: it no longer counts (its history stays).
    # Only after a complete read: an empty one or one with errors may be the service failing.
    if positions and complete:
        await _close(
            db,
            Investment.connection_id == conn.id,
            Investment.external_id.not_in([p.external_id for p in positions]),
            today=today,
        )


async def close_connection(db: AsyncSession, conn: BankConnection, today: date) -> None:
    """Disconnecting a bank: its positions stop counting; their history stays."""
    await _close(db, Investment.connection_id == conn.id, today=today)


async def _close(db: AsyncSession, *where: object, today: date) -> None:
    ids = list(
        await db.scalars(
            update(Investment)
            .where(Investment.status != GONE, *where)  # type: ignore[arg-type]
            .values(status=GONE)
            .returning(Investment.id)
        )
    )
    # Its balance is zero from now on, so the history doesn't carry it forward.
    for investment_id in ids:
        await _snapshot(db, investment_id, today, ZERO)


async def _snapshot(
    db: AsyncSession, investment_id: uuid.UUID | None, day: date, balance: Decimal
) -> None:
    await db.execute(
        insert(InvestmentSnapshot)
        .values(id=uuid.uuid4(), investment_id=investment_id, date=day, balance=balance)
        .on_conflict_do_update(constraint="uq_investment_snapshot", set_={"balance": balance})
    )


# ── what the screen shows ────────────────────────────────────────────────────


async def portfolio(
    db: AsyncSession, family_id: uuid.UUID, currency: Currency | None, today: date
) -> PortfolioOut:
    lens = currency or await db.scalar(
        select(Family.display_currency).where(Family.id == family_id)
    )
    lens = lens or Currency.BRL
    rows = list(
        await db.scalars(
            select(Investment)
            .where(Investment.family_id == family_id)
            .order_by(Investment.bank, Investment.name)
        )
    )
    open_rows = [r for r in rows if r.status in OPEN_STATUSES]
    since = today - timedelta(days=HISTORY_DAYS)
    snaps = await _snapshots(db, [r.id for r in rows], since)
    by_id = {r.id: r for r in rows}

    # Only what is in another currency needs rates.
    foreign = [r.value_date for r in open_rows if r.currency != lens] + [
        d for rid, points in snaps.items() if by_id[rid].currency != lens for d, _ in points
    ]
    conv = await converter(db, lens, min(foreign, default=None), max(foreign, default=None))

    held: list[summary.Held] = []
    out: dict[uuid.UUID, PositionOut] = {}
    for r in open_rows:
        value = conv(r.balance, r.currency, r.value_date)
        h = summary.Held(
            key=r.id,
            bank=r.bank,
            type=r.type,
            subtype=r.subtype,
            value=value,
            invested=summary.invested_in_lens(r.balance, value, r.amount_original),
            due_date=r.due_date,
        )
        held.append(h)
        out[r.id] = PositionOut(
            id=r.id,
            bank=r.bank,
            name=r.name,
            issuer=r.issuer,
            code=r.code,
            currency=r.currency,
            balance=r.balance,
            value=value,
            gain=h.gain,
            rate_label=summary.rate_label(r.rate, r.rate_type, r.fixed_annual_rate),
            due_date=r.due_date,
            value_date=r.value_date,
        )

    tracked = summary.tracked(held)
    count, due_total = summary.maturing(held, today, MATURING_MONTHS)
    ladder = summary.maturity_ladder(held, today)
    converted = {
        rid: [(d, conv(b, by_id[rid].currency, d)) for d, b in points]
        for rid, points in snaps.items()
    }
    return PortfolioOut(
        currency=lens,
        total=sum((h.value for h in held), ZERO),
        count=len(held),
        value_date=max((r.value_date for r in open_rows), default=None),
        closed=len(rows) - len(open_rows),
        has_source=await _has_source(db, family_id),
        tracked=TrackedOut(**vars(tracked)) if tracked else None,
        classes=[
            ClassOut(
                key=g.key,
                label=g.label,
                total=g.total,
                share=g.share,
                positions=[out[h.key] for h in g.items],  # type: ignore[index]
            )
            for g in summary.by_class(held)
        ],
        banks=[BankTotal(bank=b, total=t) for b, t in summary.by_bank(held)],
        maturing=MaturingOut(months=MATURING_MONTHS, count=count, total=due_total),
        ladder=LadderOut(
            steps=[LadderStepOut(**vars(s)) for s in ladder.steps],
            dated_total=ladder.dated_total,
            dated_count=ladder.dated_count,
            undated_total=ladder.undated_total,
            undated_count=ladder.undated_count,
        )
        if ladder
        else None,
        history=[
            HistoryPoint(date=d, total=t)
            for d, t in summary.history_points(list(converted.values()), since)
        ],
    )


async def _snapshots(
    db: AsyncSession, ids: list[uuid.UUID], since: date
) -> dict[uuid.UUID, list[tuple[date, Decimal]]]:
    """Each investment's balances from the last one before `since` on, oldest first."""
    if not ids:
        return {}
    start = (
        select(
            InvestmentSnapshot.investment_id,
            func.max(InvestmentSnapshot.date).label("day"),
        )
        .where(InvestmentSnapshot.investment_id.in_(ids), InvestmentSnapshot.date <= since)
        .group_by(InvestmentSnapshot.investment_id)
        .subquery()
    )
    rows = await db.execute(
        select(
            InvestmentSnapshot.investment_id, InvestmentSnapshot.date, InvestmentSnapshot.balance
        )
        .outerjoin(start, start.c.investment_id == InvestmentSnapshot.investment_id)
        .where(
            InvestmentSnapshot.investment_id.in_(ids),
            InvestmentSnapshot.date >= func.coalesce(start.c.day, since),
        )
        .order_by(InvestmentSnapshot.date)
    )
    found: dict[uuid.UUID, list[tuple[date, Decimal]]] = {}
    for investment_id, day, balance in rows:
        found.setdefault(investment_id, []).append((day, balance))
    return found


async def _has_source(db: AsyncSession, family_id: uuid.UUID) -> bool:
    n = await db.scalar(
        select(func.count())
        .select_from(BankConnection)
        .where(BankConnection.family_id == family_id, BankConnection.provider == pluggy.PROVIDER)
    )
    return bool(n)
