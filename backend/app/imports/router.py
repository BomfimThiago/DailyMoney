import uuid
from typing import Annotated

from fastapi import APIRouter, File, Form, UploadFile, status

from app.core.deps import CurrentUser, DbSession
from app.families.models import Currency
from app.imports.schemas import ConfirmRequest, ImportPreview, ImportSummary, PreviewRequest
from app.imports.services import import_service
from app.statements.parsing.errors import StatementError
from app.statements.parsing.reader import MAX_BYTES

router = APIRouter(prefix="/imports", tags=["imports"])


@router.post("", response_model=ImportPreview, status_code=status.HTTP_201_CREATED)
async def upload(
    file: Annotated[UploadFile, File()],
    user: CurrentUser,
    db: DbSession,
    default_currency: Annotated[Currency | None, Form()] = None,
) -> ImportPreview:
    data = await file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise StatementError("O arquivo passa de 10 MB.")
    imp = await import_service.create_import(
        db, user, file.filename or "extrato", data, default_currency
    )
    result = await import_service.preview(db, imp)
    await db.commit()
    return result


@router.get("", response_model=list[ImportSummary])
async def list_imports(user: CurrentUser, db: DbSession) -> list[ImportSummary]:
    rows = await import_service.list_imports(db, user.family_id)
    return [ImportSummary.model_validate(i) for i in rows]


@router.post("/{import_id}/preview", response_model=ImportPreview)
async def preview(
    import_id: uuid.UUID, data: PreviewRequest, user: CurrentUser, db: DbSession
) -> ImportPreview:
    imp = await import_service.get_import(db, user.family_id, import_id)
    return await import_service.preview(db, imp, data.accounts, data.since)


@router.post("/{import_id}/confirm", response_model=ImportSummary)
async def confirm(
    import_id: uuid.UUID, data: ConfirmRequest, user: CurrentUser, db: DbSession
) -> ImportSummary:
    imp = await import_service.get_import(db, user.family_id, import_id)
    await import_service.confirm(db, user, imp, data.accounts, data.since)
    await db.commit()
    return ImportSummary.model_validate(imp)


@router.post("/{import_id}/cancel", response_model=ImportSummary)
async def cancel(import_id: uuid.UUID, user: CurrentUser, db: DbSession) -> ImportSummary:
    imp = await import_service.get_import(db, user.family_id, import_id)
    await import_service.cancel(imp)
    await db.commit()
    return ImportSummary.model_validate(imp)
