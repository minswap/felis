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

# Build all packages and web app
RUN pnpm build --filter=web

# Stage 2: Runtime
FROM node:22-slim

# Install pnpm
RUN npm install -g pnpm

# Set working directory
WORKDIR /app

# Copy package.json files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy built app
COPY --from=builder /app/apps/web ./apps/web
COPY --from=builder /app/packages ./packages

# Install production dependencies only
RUN pnpm install --prod --frozen-lockfile

# Expose port
EXPOSE 3000

# Set environment to production
ENV NODE_ENV=production

# Start the application
CMD ["pnpm", "--filter=web", "start"]
