# Long-Short Backend Skills

## Database Operations

```bash
cd apps/long-short-backend

# Run migrations
DATABASE_URL=postgres://postgres:JBNGlQ9wNFLlYWc2mG@localhost:5432/margin pnpm run:migrate

# Create new migration
DATABASE_URL=postgres://postgres:JBNGlQ9wNFLlYWc2mG@localhost:5432/margin pnpm kysely migrate:make <migration_name>

# Run seeds
DATABASE_URL=postgres://postgres:JBNGlQ9wNFLlYWc2mG@localhost:5432/margin pnpm run:seed

# Regenerate database types
DATABASE_URL=postgres://postgres:JBNGlQ9wNFLlYWc2mG@localhost:5432/margin pnpm codegen
```

## Development

```bash
cd apps/long-short-backend

# Start dev server
DATABASE_URL=postgres://postgres:JBNGlQ9wNFLlYWc2mG@localhost:5432/margin pnpm dev

# Build
pnpm build
```

## Docker

```bash
docker compose build long-short-backend    # Build image
docker compose up -d                       # Start services
docker compose logs -f long-short-backend  # View logs
docker compose exec long-short-backend pnpm --filter=long-short-backend run:migrate  # Migrate in Docker
docker compose exec long-short-backend pnpm --filter=long-short-backend run:seed     # Seed in Docker
```
