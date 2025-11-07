# Stage 1: Build
FROM node:22-slim AS builder

# Install pnpm
RUN npm install -g pnpm

# Set working directory
WORKDIR /app

# Copy monorepo files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./

# Copy all packages and apps
COPY packages ./packages
COPY apps ./apps

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build all packages using Turbo
RUN pnpm build

# Stage 2: Runtime
FROM node:22-slim

# Install pnpm
RUN npm install -g pnpm

# Set working directory
WORKDIR /app

# Copy package.json files and turbo config
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./

# Copy built packages and apps from builder
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/web ./apps/web

# Install production dependencies only
RUN pnpm install --prod --frozen-lockfile

# Expose port
EXPOSE 3000

# Set environment to production
ENV NODE_ENV=production

# Start the application
CMD ["pnpm", "--filter=web", "start"]
