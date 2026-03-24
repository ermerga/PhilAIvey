from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.database import get_redis
from app.routers import game, tutor
from app.services.game_manager import game_manager
from app.services.phil_tutor import phil_tutor


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Runs once on startup and once on shutdown.
    We use this to inject the Redis client into the game_manager singleton
    so it can persist game state between requests.
    """
    redis = get_redis()
    game_manager.redis = redis
    phil_tutor.redis = redis
    yield
    # Shutdown: close the Redis connection cleanly
    await redis.aclose()


app = FastAPI(
    title="PhilAIvey API",
    version="0.1.0",
    description="Texas Hold'em AI poker tutor backend",
    lifespan=lifespan,
)

# ---------------------------------------------------------------------------
# CORS
# Allow the React dev server (port 3000) to talk to this API.
# ---------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------
app.include_router(game.router)
app.include_router(tutor.router)


# ---------------------------------------------------------------------------
# Health check
# Docker and load balancers use this to verify the service is running.
# ---------------------------------------------------------------------------
@app.get("/health", tags=["meta"])
async def health():
    return {"status": "ok"}
