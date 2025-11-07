# Docker Deployment Guide

## Build and Run Locally

### Using Docker Compose (Recommended)
```bash
# Build and start the container
docker-compose up -d

# View logs
docker-compose logs -f web

# Stop the container
docker-compose down
```

### Using Docker directly
```bash
# Build the image
docker build -t minswap-web:latest .

# Run the container
docker run -p 3000:3000 \
  -e NODE_ENV=production \
  -e NEXT_PUBLIC_NETWORK_ENV=TESTNET_PREVIEW \
  --restart unless-stopped \
  minswap-web:latest
```

## File Overview

- **Dockerfile**: Multi-stage build
  - Stage 1: Build - installs dependencies and builds the app
  - Stage 2: Runtime - copies only necessary files for production

- **docker-compose.yml**: Docker composition
  - Ports: 3000 (mapped to host:3000)
  - Health checks enabled
  - Restart policy: unless-stopped
  - Networks: isolated minswap-network

- **.dockerignore**: Excludes unnecessary files from build

## Environment Variables

You can set environment variables in docker-compose.yml:
```yaml
environment:
  - NODE_ENV=production
  - NEXT_PUBLIC_NETWORK_ENV=TESTNET_PREVIEW
```

## Accessing the App

- Local: http://localhost:3000
- Docker container: http://minswap-web:3000

## Deployment to Server

### Option 1: Using Docker Compose
```bash
# SSH to your server
ssh user@your-server

# Clone your repo
git clone <your-repo-url> cannon
cd cannon

# Build and run
docker-compose up -d

# Check status
docker-compose ps
docker-compose logs -f
```

### Option 2: Push to Docker Registry
```bash
# Build and tag
docker build -t your-registry/minswap-web:latest .

# Push to registry
docker push your-registry/minswap-web:latest

# On server, pull and run
docker pull your-registry/minswap-web:latest
docker run -p 3000:3000 --restart unless-stopped your-registry/minswap-web:latest
```

## Useful Commands

```bash
# View container logs
docker-compose logs -f web

# Rebuild image (after code changes)
docker-compose up -d --build

# Stop all containers
docker-compose down

# Remove unused images
docker image prune -a

# Check container health
docker-compose ps
```

## Production Considerations

### With Nginx Reverse Proxy
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Resource Limits (Optional)
Add to docker-compose.yml:
```yaml
services:
  web:
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 1G
        reservations:
          cpus: '0.5'
          memory: 512M
```

## Troubleshooting

**Port already in use:**
```bash
# Change port in docker-compose.yml
ports:
  - "3001:3000"  # Use 3001 instead
```

**Build fails:**
```bash
# Clean rebuild
docker-compose down
docker system prune -a
docker-compose up --build
```

**Container exits immediately:**
```bash
# Check logs
docker-compose logs web

# Run interactive for debugging
docker-compose run web sh
```
