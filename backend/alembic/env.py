import asyncio
import os
from logging.config import fileConfig

from sqlalchemy.ext.asyncio import async_engine_from_config
from sqlalchemy import pool
from alembic import context

# Import our models so Alembic can see them when autogenerating migrations.
# Any model that inherits from Base will be included automatically.
from app.models.db import Base

# ---------------------------------------------------------------------------
# Alembic config object — gives access to values in alembic.ini
# ---------------------------------------------------------------------------
config = context.config

# Set up Python logging using the alembic.ini config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# This is what Alembic compares against the live DB to detect schema changes
target_metadata = Base.metadata

# Override the placeholder URL in alembic.ini with the real one from env
config.set_main_option("sqlalchemy.url", os.environ["DATABASE_URL"])


# ---------------------------------------------------------------------------
# Offline mode — generates SQL without connecting to the DB
# Useful for reviewing what a migration will do before running it.
# ---------------------------------------------------------------------------
def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


# ---------------------------------------------------------------------------
# Online mode — connects to the DB and runs migrations directly
# ---------------------------------------------------------------------------
def do_run_migrations(connection):
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    # Build an async engine using the sqlalchemy.url we set above
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


# ---------------------------------------------------------------------------
# Entry point — Alembic calls this file directly
# ---------------------------------------------------------------------------
if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
