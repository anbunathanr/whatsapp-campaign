# ─────────────────────────────────────────────────────────────────────────────
# WhatsApp Campaign Platform — React Frontend
# Multi-stage build: build with Vite, serve with Nginx.
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: Build ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency manifests
COPY package.json package-lock.json ./

# Install all dependencies (including devDependencies needed for Vite build)
RUN npm ci

# Copy source files
COPY . .

# VITE_API_URL must be passed as a build argument for the frontend to know
# where the backend API is. Example:
#   docker build --build-arg VITE_API_URL=https://api.yourdomain.com/api .
ARG VITE_API_URL=http://localhost:5000/api
ENV VITE_API_URL=$VITE_API_URL

# Build the production bundle
RUN npm run build


# ── Stage 2: Serve with Nginx ──────────────────────────────────────────────────
FROM nginx:1.25-alpine AS runner

# Remove default Nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy custom Nginx config optimised for a React SPA
COPY nginx.conf /etc/nginx/conf.d/app.conf

# Copy built assets from the builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Expose HTTP port
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1/index.html || exit 1

CMD ["nginx", "-g", "daemon off;"]
