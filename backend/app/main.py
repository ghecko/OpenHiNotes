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
from app.routers import groups as groups_router
from app.routers import shares as shares_router
from app.routers import voice_profiles as voice_profiles_router
from app.routers import oidc as oidc_router
from app.models.template import SummaryTemplate
from app.default_templates import DEFAULT_TEMPLATES
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
app.include_router(groups_router.router, prefix="/api")
app.include_router(shares_router.router, prefix="/api")
app.include_router(voice_profiles_router.router, prefix="/api")
app.include_router(oidc_router.public_router, prefix="/api")
app.include_router(oidc_router.admin_router, prefix="/api")


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


async def seed_default_templates():
    """Seed default summary templates if they don't exist yet.

    On subsequent startups, sync categories and add any new templates
    that were added to DEFAULT_TEMPLATES since the last seed.
    """
    try:
        async with AsyncSessionLocal() as db:
            # Get admin user to assign as creator
            result = await db.execute(
                select(User).where(User.email == settings.admin_email)
            )
            admin_user = result.scalars().first()
            if not admin_user:
                logger.warning("Admin user not found — skipping template seeding")
                return

            # Load existing default templates
            result = await db.execute(
                select(SummaryTemplate).where(SummaryTemplate.is_default == True)
            )
            existing = {t.name: t for t in result.scalars().all()}

            if not existing:
                # First-time seed: create all templates
                for tpl in DEFAULT_TEMPLATES:
                    template = SummaryTemplate(
                        name=tpl["name"],
                        description=tpl["description"],
                        prompt_template=tpl["prompt_template"],
                        category=tpl.get("category"),
                        target_type=tpl.get("target_type", "both"),
                        created_by=admin_user.id,
                        is_active=True,
                        is_default=True,
                    )
                    db.add(template)
                await db.commit()
                logger.info(f"Seeded {len(DEFAULT_TEMPLATES)} default templates")
            else:
                # Sync: update categories, target_type + add missing templates
                updated = 0
                added = 0
                for tpl in DEFAULT_TEMPLATES:
                    if tpl["name"] in existing:
                        db_tpl = existing[tpl["name"]]
                        new_cat = tpl.get("category")
                        new_target = tpl.get("target_type", "both")
                        if db_tpl.category != new_cat:
                            db_tpl.category = new_cat
                            updated += 1
                        if str(db_tpl.target_type) != new_target and str(getattr(db_tpl.target_type, 'value', db_tpl.target_type)) != new_target:
                            db_tpl.target_type = new_target
                            updated += 1
                    else:
                        # New template added since last seed
                        template = SummaryTemplate(
                            name=tpl["name"],
                            description=tpl["description"],
                            prompt_template=tpl["prompt_template"],
                            category=tpl.get("category"),
                            target_type=tpl.get("target_type", "both"),
                            created_by=admin_user.id,
                            is_active=True,
                            is_default=True,
                        )
                        db.add(template)
                        added += 1
                await db.commit()
                if updated or added:
                    logger.info(f"Default templates sync: {updated} updated, {added} added")
                else:
                    logger.info("Default templates already up to date")
    except Exception as e:
        logger.error(f"Failed to seed default templates: {str(e)}")


@app.on_event("startup")
async def startup_event():
    """Run on application startup."""
    # Create all tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        logger.info("Database tables initialized")

    # Create admin user
    await create_admin_user()

    # Seed default templates
    await seed_default_templates()

    # Start the transcription queue worker
    from app.services.queue import transcription_queue
    await transcription_queue.start()

    logger.info("Application startup complete")


@app.on_event("shutdown")
async def shutdown_event():
    """Run on application shutdown."""
    # Stop the transcription queue worker
    from app.services.queue import transcription_queue
    await transcription_queue.stop()

    await engine.dispose()
    logger.info("Application shutdown complete")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
