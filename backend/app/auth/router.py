from typing import Annotated

from fastapi import APIRouter, Depends, status

from app.auth.schemas import (
    GoogleLoginRequest,
    MagicLinkRequest,
    MagicLinkVerify,
    RefreshRequest,
    TokenPair,
)
from app.auth.services import auth_service, magic_link
from app.auth.services.google import GoogleVerifier, get_google_verifier
from app.core.deps import CurrentUser, DbSession
from app.core.email import EmailSender, get_email_sender
from app.families.schemas import FamilyOut, MeOut
from app.families.services import family_service

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/google", response_model=TokenPair)
async def login_google(
    body: GoogleLoginRequest,
    db: DbSession,
    verify: Annotated[GoogleVerifier, Depends(get_google_verifier)],
) -> TokenPair:
    identity = await verify(body.id_token)
    user = await auth_service.login_with_google(db, identity)
    tokens = await auth_service.issue_tokens(db, user.id)
    await db.commit()
    return tokens


@router.post("/magic-link", status_code=status.HTTP_202_ACCEPTED)
async def request_magic_link(
    body: MagicLinkRequest,
    db: DbSession,
    send: Annotated[EmailSender, Depends(get_email_sender)],
) -> dict[str, str]:
    await magic_link.request_link(db, body.email, send)
    await db.commit()
    return {"detail": "Se o e-mail tiver acesso, o link chega em instantes."}


@router.post("/magic-link/verify", response_model=TokenPair)
async def verify_magic_link(body: MagicLinkVerify, db: DbSession) -> TokenPair:
    email = await magic_link.consume_link(db, body.token)
    user = await auth_service.login_with_email(db, email)
    tokens = await auth_service.issue_tokens(db, user.id)
    await db.commit()
    return tokens


@router.post("/refresh", response_model=TokenPair)
async def refresh(body: RefreshRequest, db: DbSession) -> TokenPair:
    tokens = await auth_service.refresh_tokens(db, body.refresh_token)
    await db.commit()
    return tokens


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(body: RefreshRequest, db: DbSession) -> None:
    await auth_service.logout(db, body.refresh_token)
    await db.commit()


@router.get("/me", response_model=MeOut)
async def me(user: CurrentUser, db: DbSession) -> MeOut:
    family = await family_service.get_family(db, user.family_id)
    return MeOut(
        id=user.id,
        email=user.email,
        name=user.name,
        picture_url=user.picture_url,
        family=FamilyOut.model_validate(family),
    )
