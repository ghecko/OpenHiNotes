# Stage 1: Build the web application
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first for better Docker layer caching
COPY package*.json ./
RUN npm install

# Copy the rest of the source code
COPY . .

# Build the Vite application for production
RUN npm run build

# Stage 2: Serve the application using Caddy
FROM caddy:2-alpine

# Copy the built static files from the builder stage
COPY --from=builder /app/dist /srv

# Copy the production Caddy configuration for serving the SPA
COPY Caddyfile /etc/caddy/Caddyfile

# Expose HTTP and HTTPS ports
EXPOSE 80 443
