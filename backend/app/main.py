from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.config import settings
from app.database import engine, AsyncSessionLocal, Base
from app.models.user import User, UserRole
from app.services.auth import AuthService
from app.routers import auth as auth_router
from app.routers import users as users_router
from app.routers import transcriptions as transcriptions_router
from app.routers import templates as templates_router
from app.routers import summaries as summaries_router
from app.routers import chat as chat_router
from app.routers import chat_conversations as chat_conversations_router
from app.routers import collections as collections_router
from app.routers import app_settings as settings_router
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(
    title="OpenHiNotes API",
    description="API for managing audio transcriptions from HiDock recording devices",
    version="1.0.0",
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth_router.router, prefix="/api")
app.include_router(users_router.router, prefix="/api")
app.include_router(transcriptions_router.router, prefix="/api")
app.include_router(templates_router.router, prefix="/api")
app.include_router(summaries_router.router, prefix="/api")
app.include_router(chat_router.router, prefix="/api")
app.include_router(chat_conversations_router.router, prefix="/api")
app.include_router(collections_router.router, prefix="/api")
app.include_router(settings_router.router, prefix="/api")


@app.get("/api/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy"}


async def create_admin_user():
    """Create default admin user if it doesn't exist."""
    try:
        async with AsyncSessionLocal() as db:
            # Check if admin user exists
            result = await db.execute(select(User).where(User.email == settings.admin_email))
            admin_user = result.scalars().first()

            if not admin_user:
                logger.info(f"Creating default admin user: {settings.admin_email}")
                await AuthService.create_user(
                    db,
                    email=settings.admin_email,
                    password=settings.admin_password,
                    display_name="Administrator",
                    role=UserRole.admin,
                )
                logger.info("Default admin user created successfully")
            else:
                logger.info("Admin user already exists")
    except Exception as e:
        logger.error(f"Failed to create admin user: {str(e)}")


@app.on_event("startup")
async def startup_event():
    """Run on application startup."""
    # Create all tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        logger.info("Database tables initialized")

    # Create admin user
    await create_admin_user()
    logger.info("Application startup complete")


@app.on_event("shutdown")
async def shutdown_event():
    """Run on application shutdown."""
    await engine.dispose()
    logger.info("Application shutdown complete")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
