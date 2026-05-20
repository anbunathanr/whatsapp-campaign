# ─────────────────────────────────────────────────────────────────────────────
# WhatsApp Campaign Platform — Node.js Backend
# Multi-stage build for a lean production image.
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: Install dependencies ──────────────────────────────────────────────
FROM node:20-alpine AS deps

# Required for bcrypt native addon compilation
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy dependency manifests only (for layer caching)
COPY package.json package-lock.json ./

# Install production dependencies only
RUN npm ci --omit=dev


# ── Stage 2: Production image ──────────────────────────────────────────────────
FROM node:20-alpine AS runner

# Set non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Copy production node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy application source
COPY src ./src
COPY package.json ./

# Create required runtime directories and set permissions
RUN mkdir -p uploads/media logs && \
    chown -R appuser:appgroup /app

# Drop privileges
USER appuser

# Expose the application port
EXPOSE 5000

# Health check — calls the /api/health endpoint (no auth required)
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:5000/api/health || exit 1

# Start the server
CMD ["node", "src/server.js"]
