from fastapi import APIRouter, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.auth.router import router as auth_router
from app.core.config import settings
from app.core.exceptions import AppError
from app.db.session import SessionLocal
from app.families.router import router as family_router

app = FastAPI(
    title="Daily Money API",
    version=settings.APP_VERSION,
    docs_url="/api/docs" if settings.DEBUG else None,
    redoc_url=None,
    openapi_url="/api/openapi.json" if settings.DEBUG else None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.exception_handler(AppError)
async def handle_app_error(_: Request, exc: AppError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code, content={"detail": exc.detail, "code": exc.code}
    )


api = APIRouter(prefix="/api/v1")
api.include_router(auth_router)
api.include_router(family_router)
app.include_router(api)


@app.get("/api/health")
async def health() -> JSONResponse:
    try:
        async with SessionLocal() as session:
            await session.execute(text("SELECT 1"))
        db_ok = True
    except Exception:
        db_ok = False
    return JSONResponse(
        status_code=200 if db_ok else 503,
        content={
            "status": "ok" if db_ok else "degraded",
            "db": db_ok,
            "version": settings.APP_VERSION,
        },
    )
