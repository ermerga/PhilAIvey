from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from redis.asyncio import Redis

from app.core.config import get_settings

settings = get_settings()

# ---------------------------------------------------------------------------
# PostgreSQL (SQLAlchemy async)
# ---------------------------------------------------------------------------

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,
    pool_pre_ping=True,
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency that yields an async database session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


# ---------------------------------------------------------------------------
# Redis
# ---------------------------------------------------------------------------

_redis_client: Redis | None = None


def get_redis() -> Redis:
    """FastAPI dependency that returns the shared async Redis client."""
    global _redis_client
    if _redis_client is None:
        _redis_client = Redis.from_url(settings.REDIS_URL, decode_responses=True)
    return _redis_client
