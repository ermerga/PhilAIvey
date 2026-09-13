# PhilAIvey

PhilAIvey is a Texas Hold'em training app. You play hands against AI opponents, and an in-app coach named Phil gives live guidance while the hand is running.

The goal is to help you learn how to think through poker decisions, not just click an action. The app supports different skill levels and keeps advice tied to the current game state.

The project is split into a React frontend and a FastAPI backend. The frontend renders the table and coaching UI, and the backend runs game logic, AI behavior, and API and WebSocket updates. Data services in the repo include PostgreSQL and Redis.

## Tech stack

- Frontend: React, TypeScript, Vite, Vitest
- Backend: Python, FastAPI, SQLAlchemy, Alembic
- Services: PostgreSQL, Redis
- Runtime communication: REST + WebSockets

## Getting started

The repository includes a `docker-compose.yml`, Dockerfiles for frontend and backend, and an `.env.example`, so Docker Compose is the clearest way to run it.

1. Create your environment file:

```bash
cp .env.example .env
```

2. Fill in real values in `.env` where needed (for example API keys).

3. Start the app:

```bash
docker compose up --build
```

4. Open the frontend at `http://localhost:3000`.

To stop everything, use `Ctrl+C` and then run:

```bash
docker compose down
```

## Development notes

If you want to run parts of the app directly instead of Docker, the frontend and backend each have their own dependency files and scripts under `frontend/` and `backend/`. The current test setup is strongest on the frontend, with backend pytest scaffolding present in `backend/tests`.
