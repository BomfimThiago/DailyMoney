import uuid

from fastapi import APIRouter, Response, status

from app.connections.schemas import (
    BrazilFinishOut,
    BrazilItemIn,
    BrazilStartOut,
    ConnectionsOverview,
    FinishIn,
    StartIn,
    StartOut,
    SyncOut,
)
from app.connections.services import connection_service, pluggy, pluggy_link, sync_service
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


@router.post("/brazil", response_model=BrazilStartOut)
async def start_brazil(user: CurrentUser, db: DbSession) -> BrazilStartOut:
    token = await pluggy_link.start(db, user)
    await db.commit()
    return BrazilStartOut(connect_token=token, connector_id=pluggy.MEU_PLUGGY_CONNECTOR_ID)


@router.post("/brazil/items", status_code=status.HTTP_204_NO_CONTENT)
async def register_brazil_item(user: CurrentUser, db: DbSession, data: BrazilItemIn) -> Response:
    await pluggy_link.register(db, user, data.item_id)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/brazil/finish", response_model=BrazilFinishOut)
async def finish_brazil(user: CurrentUser, db: DbSession) -> BrazilFinishOut:
    settled = await pluggy_link.settle(db, user.family_id)
    await db.commit()
    results = []
    for conn in settled.connected:
        results.append(await sync_service.sync_connection(db, conn))
        await db.commit()
    return await connection_service.brazil_finish_out(db, settled, results)


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
