# Multi-stage build for production optimization
FROM node:18-alpine AS base

# Install dependencies only when needed
FROM base AS deps
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install dependencies based on the preferred package manager
COPY package.json package-lock.json* ./
RUN npm ci --only=production && npm cache clean --force

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 fieldsync

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 fieldsync

# Copy necessary files
COPY --from=builder --chown=fieldsync:nodejs /app/package.json ./
COPY --from=builder --chown=fieldsync:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=fieldsync:nodejs /app/server.js ./
COPY --from=builder --chown=fieldsync:nodejs /app/config ./config
COPY --from=builder --chown=fieldsync:nodejs /app/middleware ./middleware
COPY --from=builder --chown=fieldsync:nodejs /app/models ./models
COPY --from=builder --chown=fieldsync:nodejs /app/routes ./routes
COPY --from=builder --chown=fieldsync:nodejs /app/services ./services
COPY --from=builder --chown=fieldsync:nodejs /app/utils ./utils
COPY --from=builder --chown=fieldsync:nodejs /app/public ./public
COPY --from=builder --chown=fieldsync:nodejs /app/ecosystem.config.js ./

# Create logs directory
RUN mkdir -p /app/logs && chown -R fieldsync:nodejs /app/logs

USER fieldsync

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Start the application
CMD ["node", "server.js"]