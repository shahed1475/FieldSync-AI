# Docker Setup Guide for FieldSync AI

This guide provides instructions for running FieldSync AI using Docker containers in both development and production environments.

## Prerequisites

- Docker Desktop (Windows/Mac) or Docker Engine (Linux)
- Docker Compose v2.0+
- At least 4GB RAM available for containers
- Ports 3000, 3001, 5432, 6379, 80, 443 available

## Quick Start

### Development Environment

1. **Clone and navigate to the project:**
   ```bash
   cd "FieldSync AI"
   ```

2. **Create environment file:**
   ```bash
   cp .env.example .env
   ```

3. **Start development environment:**
   ```bash
   npm run docker:up-dev
   ```

4. **View logs:**
   ```bash
   npm run docker:logs
   ```

5. **Access the application:**
   - Frontend: http://localhost:3001
   - Backend API: http://localhost:3000
   - Health Check: http://localhost:3000/health

### Production Environment

1. **Build production images:**
   ```bash
   npm run docker:build
   ```

2. **Start production environment:**
   ```bash
   docker-compose --profile production up -d
   ```

## Services Overview

### Backend (Node.js/Express)
- **Port:** 3000
- **Health Check:** `/health`
- **Features:** JWT auth, RBAC, rate limiting, logging
- **Database:** PostgreSQL with connection pooling
- **Cache:** Redis for sessions and caching

### Frontend (React)
- **Port:** 3001 (dev) / 80 (prod)
- **Features:** SPA routing, responsive design
- **Proxy:** Nginx for production with SSL support

### Database (PostgreSQL)
- **Port:** 5432
- **Version:** 15-alpine
- **Features:** Automatic backups, performance tuning
- **Extensions:** uuid-ossp, pg_trgm, btree_gin

### Cache (Redis)
- **Port:** 6379
- **Version:** 7-alpine
- **Features:** Persistence, password protection

### Reverse Proxy (Nginx) - Production Only
- **Ports:** 80, 443
- **Features:** SSL termination, load balancing, security headers

## Environment Configuration

### Development (.env)
```env
NODE_ENV=development
DB_NAME=fieldsync_ai_dev
DB_USER=fieldsync_dev
DB_PASSWORD=dev_password
REDIS_PASSWORD=dev_password
JWT_SECRET=dev-jwt-secret-not-for-production
LOG_LEVEL=debug
CORS_ORIGIN=http://localhost:3001
```

### Production (.env.production)
```env
NODE_ENV=production
DB_NAME=fieldsync_ai
DB_USER=fieldsync
DB_PASSWORD=your-secure-db-password
REDIS_PASSWORD=your-secure-redis-password
JWT_SECRET=your-super-secret-jwt-key-256-bits-long
LOG_LEVEL=info
CORS_ORIGIN=https://yourdomain.com
```

## Docker Commands

### Basic Operations
```bash
# Start all services
docker-compose up -d

# Start development environment
docker-compose -f docker-compose.yml -f docker-compose.override.yml up -d

# Stop all services
docker-compose down

# View logs
docker-compose logs -f [service-name]

# Restart a service
docker-compose restart [service-name]
```

### Development Commands
```bash
# Build development images
npm run docker:build-dev

# Start development environment
npm run docker:up-dev

# View logs
npm run docker:logs

# Stop development environment
npm run docker:down

# Clean up (remove volumes and images)
npm run docker:clean
```

### Production Commands
```bash
# Build production images
docker build -t fieldsync-ai-backend .
docker build -t fieldsync-ai-frontend ./frontend

# Start production with SSL
docker-compose --profile production up -d

# Scale backend instances
docker-compose up -d --scale backend=3
```

## Volume Management

### Development Volumes
- `postgres_dev_data`: Development database data
- `./logs`: Application logs (mounted from host)
- `.:/app`: Source code hot reloading

### Production Volumes
- `postgres_data`: Production database data
- `redis_data`: Redis persistence data
- `./logs`: Application logs
- `./uploads`: File uploads

## Networking

### Development Network
- **Name:** fieldsync-network
- **Type:** Bridge
- **Subnet:** 172.20.0.0/16

### Service Communication
- Backend → PostgreSQL: `postgres:5432`
- Backend → Redis: `redis:6379`
- Frontend → Backend: `backend:3000`
- Nginx → Backend: `backend:3000`
- Nginx → Frontend: `frontend:80`

## Health Checks

All services include health checks:

```bash
# Check service health
docker-compose ps

# Manual health check
curl http://localhost:3000/health
curl http://localhost:3001/health
```

## Troubleshooting

### Common Issues

1. **Port conflicts:**
   ```bash
   # Check what's using the port
   netstat -tulpn | grep :3000
   
   # Kill process using port
   sudo kill -9 $(lsof -t -i:3000)
   ```

2. **Database connection issues:**
   ```bash
   # Check PostgreSQL logs
   docker-compose logs postgres
   
   # Connect to database
   docker-compose exec postgres psql -U fieldsync -d fieldsync_ai
   ```

3. **Permission issues:**
   ```bash
   # Fix file permissions
   sudo chown -R $USER:$USER ./logs
   sudo chmod -R 755 ./logs
   ```

4. **Memory issues:**
   ```bash
   # Check container resource usage
   docker stats
   
   # Increase Docker memory limit in Docker Desktop
   ```

### Debugging

1. **Access container shell:**
   ```bash
   docker-compose exec backend sh
   docker-compose exec postgres psql -U fieldsync -d fieldsync_ai
   ```

2. **View detailed logs:**
   ```bash
   docker-compose logs -f --tail=100 backend
   ```

3. **Check container status:**
   ```bash
   docker-compose ps
   docker inspect fieldsync-backend
   ```

## Performance Optimization

### Production Optimizations
- Multi-stage Docker builds for smaller images
- Non-root user for security
- Health checks for reliability
- Resource limits and reservations
- Nginx caching and compression
- Database connection pooling

### Monitoring
- Application metrics at `/metrics`
- Health checks at `/health`
- Detailed health at `/health/detailed`
- Container logs via Docker logging drivers

## Security Considerations

1. **Secrets Management:**
   - Use Docker secrets in production
   - Never commit .env files
   - Rotate passwords regularly

2. **Network Security:**
   - Internal network isolation
   - Firewall rules for exposed ports
   - SSL/TLS encryption

3. **Container Security:**
   - Non-root users
   - Read-only file systems where possible
   - Security scanning of images

## Backup and Recovery

### Database Backup
```bash
# Create backup
docker-compose exec postgres pg_dump -U fieldsync fieldsync_ai > backup.sql

# Restore backup
docker-compose exec -T postgres psql -U fieldsync fieldsync_ai < backup.sql
```

### Volume Backup
```bash
# Backup volumes
docker run --rm -v fieldsync_postgres_data:/data -v $(pwd):/backup alpine tar czf /backup/postgres_backup.tar.gz /data
```

## Scaling

### Horizontal Scaling
```bash
# Scale backend instances
docker-compose up -d --scale backend=3

# Use external load balancer for multiple nodes
```

### Vertical Scaling
```yaml
# Add resource limits in docker-compose.yml
services:
  backend:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
        reservations:
          cpus: '1'
          memory: 1G
```

## Next Steps

1. Set up CI/CD pipeline with GitHub Actions
2. Deploy to cloud provider (AWS ECS, Google Cloud Run, etc.)
3. Implement monitoring with Prometheus/Grafana
4. Set up log aggregation with ELK stack
5. Configure automated backups and disaster recovery