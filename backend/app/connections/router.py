import uuid

from fastapi import APIRouter, Response, status

from app.connections.schemas import (
    ConnectionsOverview,
    FinishIn,
    StartIn,
    StartOut,
    SyncOut,
)
from app.connections.services import connection_service, sync_service
from app.core.deps import CurrentUser, DbSession

router = APIRouter(prefix="/connections", tags=["connections"])


@router.get("", response_model=ConnectionsOverview)
async def list_connections(user: CurrentUser, db: DbSession) -> ConnectionsOverview:
    overview = await connection_service.overview(db, user)
    await db.commit()
    return overview


@router.post("/europe", response_model=StartOut)
async def start(user: CurrentUser, data: StartIn) -> StartOut:
    return StartOut(url=await connection_service.start_authorization(user, data.bank))


@router.post("/europe/finish", response_model=SyncOut)
async def finish(user: CurrentUser, db: DbSession, data: FinishIn) -> SyncOut:
    conn = await connection_service.finish_authorization(db, user, data.code, data.state)
    await db.commit()
    result = await sync_service.sync_connection(db, conn)
    await db.commit()
    return await connection_service.sync_out(db, result)


@router.post("/{connection_id}/sync", response_model=SyncOut)
async def sync(user: CurrentUser, db: DbSession, connection_id: uuid.UUID) -> SyncOut:
    conn = await connection_service.get_connection(db, user.family_id, connection_id)
    result = await sync_service.sync_connection(db, conn)
    await db.commit()
    return await connection_service.sync_out(db, result)


@router.delete("/{connection_id}", status_code=status.HTTP_204_NO_CONTENT)
async def disconnect(user: CurrentUser, db: DbSession, connection_id: uuid.UUID) -> Response:
    conn = await connection_service.get_connection(db, user.family_id, connection_id)
    await connection_service.disconnect(db, conn)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
