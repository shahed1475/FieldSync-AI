# 🚀 InsightFlow AI - Production Deployment Guide

## Overview

This guide provides step-by-step instructions for deploying InsightFlow AI to a production environment. The system has been fully tested and verified for production readiness.

---

## 📋 Pre-Deployment Checklist

### System Requirements
- [ ] Node.js 16+ installed
- [ ] PostgreSQL 12+ database server
- [ ] Redis server (optional, for enhanced caching)
- [ ] SSL certificate for HTTPS
- [ ] Domain name configured
- [ ] Firewall rules configured

### Environment Preparation
- [ ] Production server provisioned
- [ ] Database server configured
- [ ] Backup strategy implemented
- [ ] Monitoring tools installed
- [ ] Log aggregation setup

---

## 🔧 Environment Configuration

### 1. Environment Variables

Create a `.env` file in the project root:

```bash
# Database Configuration
DB_HOST=your-postgres-host
DB_PORT=5432
DB_NAME=insightflow_production
DB_USER=your-db-user
DB_PASSWORD=your-secure-password
DB_SSL=true

# Application Configuration
NODE_ENV=production
PORT=3000
APP_NAME=InsightFlow AI
APP_VERSION=1.0.0

# Security Configuration
JWT_SECRET=your-super-secure-jwt-secret-key-here
JWT_EXPIRES_IN=24h
BCRYPT_ROUNDS=12

# CORS Configuration
CORS_ORIGIN=https://your-domain.com
CORS_CREDENTIALS=true

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Cache Configuration
CACHE_TTL=3600
CACHE_MAX_SIZE=1000

# Logging Configuration
LOG_LEVEL=info
LOG_FILE=logs/app.log

# Monitoring Configuration
HEALTH_CHECK_INTERVAL=30000
PERFORMANCE_MONITORING=true
```

### 2. Database Configuration

#### PostgreSQL Setup
```sql
-- Create production database
CREATE DATABASE insightflow_production;

-- Create dedicated user
CREATE USER insightflow_user WITH PASSWORD 'your-secure-password';

-- Grant permissions
GRANT ALL PRIVILEGES ON DATABASE insightflow_production TO insightflow_user;

-- Enable required extensions
\c insightflow_production;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
```

#### Connection Pool Configuration
```javascript
// config/database.js
module.exports = {
  production: {
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: 'postgres',
    ssl: process.env.DB_SSL === 'true',
    pool: {
      max: 20,
      min: 5,
      acquire: 30000,
      idle: 10000
    },
    logging: false
  }
};
```

---

## 🏗️ Deployment Steps

### Step 1: Server Preparation

```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Install Node.js 18 LTS
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 for process management
sudo npm install -g pm2

# Create application directory
sudo mkdir -p /var/www/insightflow
sudo chown $USER:$USER /var/www/insightflow
```

### Step 2: Application Deployment

```bash
# Clone or upload application files
cd /var/www/insightflow
# Upload your application files here

# Install dependencies
npm ci --only=production

# Create necessary directories
mkdir -p logs
mkdir -p uploads
mkdir -p temp

# Set proper permissions
chmod 755 scripts/*.js
chmod 600 .env
```

### Step 3: Database Setup

```bash
# Run database migrations and setup
node scripts/setupDatabase.js

# Create indexes for optimization
node scripts/createIndexes.js

# Verify database connection
node scripts/testDatabaseConnection.js
```

### Step 4: SSL Configuration

#### Using Let's Encrypt (Recommended)
```bash
# Install Certbot
sudo apt install certbot

# Generate SSL certificate
sudo certbot certonly --standalone -d your-domain.com

# Certificate files will be in:
# /etc/letsencrypt/live/your-domain.com/fullchain.pem
# /etc/letsencrypt/live/your-domain.com/privkey.pem
```

#### Update server.js for HTTPS
```javascript
// Add to server.js
const https = require('https');
const fs = require('fs');

if (process.env.NODE_ENV === 'production') {
  const options = {
    key: fs.readFileSync('/etc/letsencrypt/live/your-domain.com/privkey.pem'),
    cert: fs.readFileSync('/etc/letsencrypt/live/your-domain.com/fullchain.pem')
  };
  
  https.createServer(options, app).listen(443, () => {
    console.log('HTTPS Server running on port 443');
  });
}
```

### Step 5: Process Management with PM2

Create `ecosystem.config.js`:
```javascript
module.exports = {
  apps: [{
    name: 'insightflow-api',
    script: 'server.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    max_memory_restart: '1G',
    node_args: '--max-old-space-size=1024'
  }]
};
```

Start the application:
```bash
# Start with PM2
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

# Setup PM2 startup script
pm2 startup
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u $USER --hp $HOME
```

---

## 🔒 Security Configuration

### 1. Firewall Setup

```bash
# Configure UFW firewall
sudo ufw enable
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 3000/tcp  # If needed for direct API access
```

### 2. Nginx Reverse Proxy (Recommended)

Install and configure Nginx:
```bash
sudo apt install nginx

# Create Nginx configuration
sudo nano /etc/nginx/sites-available/insightflow
```

Nginx configuration:
```nginx
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    # SSL Configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;

    # Security Headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload";

    # API Proxy
    location /api/ {
        proxy_pass http://localhost:3000/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Static Files
    location / {
        root /var/www/insightflow/public;
        try_files $uri $uri/ /index.html;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

Enable the site:
```bash
sudo ln -s /etc/nginx/sites-available/insightflow /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

---

## 📊 Monitoring & Logging

### 1. Application Monitoring

Create `monitoring/healthCheck.js`:
```javascript
const express = require('express');
const { Pool } = require('pg');

const router = express.Router();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

router.get('/health', async (req, res) => {
  try {
    // Check database connection
    await pool.query('SELECT 1');
    
    // Check memory usage
    const memUsage = process.memoryUsage();
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: {
        rss: Math.round(memUsage.rss / 1024 / 1024) + 'MB',
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + 'MB',
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + 'MB'
      },
      database: 'connected'
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message
    });
  }
});

module.exports = router;
```

### 2. Log Rotation

Create `/etc/logrotate.d/insightflow`:
```
/var/www/insightflow/logs/*.log {
    daily
    missingok
    rotate 52
    compress
    delaycompress
    notifempty
    create 644 www-data www-data
    postrotate
        pm2 reloadLogs
    endscript
}
```

---

## 🔄 Backup Strategy

### 1. Database Backup Script

Create `scripts/backup.sh`:
```bash
#!/bin/bash

# Configuration
DB_NAME="insightflow_production"
DB_USER="insightflow_user"
BACKUP_DIR="/var/backups/insightflow"
DATE=$(date +%Y%m%d_%H%M%S)

# Create backup directory
mkdir -p $BACKUP_DIR

# Create database backup
pg_dump -h localhost -U $DB_USER -d $DB_NAME > $BACKUP_DIR/db_backup_$DATE.sql

# Compress backup
gzip $BACKUP_DIR/db_backup_$DATE.sql

# Remove backups older than 30 days
find $BACKUP_DIR -name "*.sql.gz" -mtime +30 -delete

echo "Backup completed: db_backup_$DATE.sql.gz"
```

### 2. Automated Backup with Cron

```bash
# Add to crontab
crontab -e

# Add this line for daily backups at 2 AM
0 2 * * * /var/www/insightflow/scripts/backup.sh
```

---

## 🚀 Deployment Verification

### 1. Health Check Script

Create `scripts/verifyDeployment.js`:
```javascript
const axios = require('axios');

async function verifyDeployment() {
  const baseURL = process.env.APP_URL || 'https://your-domain.com';
  
  const tests = [
    { name: 'Health Check', url: `${baseURL}/api/health` },
    { name: 'API Status', url: `${baseURL}/api/status` },
    { name: 'Database Health', url: `${baseURL}/api/health/database` }
  ];

  console.log('🔍 Verifying deployment...\n');

  for (const test of tests) {
    try {
      const response = await axios.get(test.url, { timeout: 5000 });
      console.log(`✅ ${test.name}: OK (${response.status})`);
    } catch (error) {
      console.log(`❌ ${test.name}: FAILED (${error.message})`);
    }
  }

  console.log('\n🎉 Deployment verification complete!');
}

verifyDeployment();
```

### 2. Performance Test

```bash
# Install Apache Bench for load testing
sudo apt install apache2-utils

# Run performance test
ab -n 1000 -c 10 https://your-domain.com/api/health
```

---

## 🔧 Maintenance Tasks

### Daily Tasks
- [ ] Check application logs
- [ ] Verify backup completion
- [ ] Monitor system resources
- [ ] Check SSL certificate expiry

### Weekly Tasks
- [ ] Review performance metrics
- [ ] Update dependencies (if needed)
- [ ] Clean up old log files
- [ ] Database maintenance

### Monthly Tasks
- [ ] Security updates
- [ ] Performance optimization review
- [ ] Backup restoration test
- [ ] SSL certificate renewal (if needed)

---

## 🆘 Troubleshooting

### Common Issues

#### Application Won't Start
```bash
# Check PM2 status
pm2 status

# View logs
pm2 logs insightflow-api

# Restart application
pm2 restart insightflow-api
```

#### Database Connection Issues
```bash
# Test database connection
node scripts/testDatabaseConnection.js

# Check PostgreSQL status
sudo systemctl status postgresql
```

#### High Memory Usage
```bash
# Monitor memory usage
pm2 monit

# Restart with memory limit
pm2 restart insightflow-api --max-memory-restart 1G
```

### Emergency Procedures

#### Application Rollback
```bash
# Stop current version
pm2 stop insightflow-api

# Deploy previous version
# (restore from backup or git)

# Start application
pm2 start insightflow-api
```

#### Database Recovery
```bash
# Restore from backup
gunzip /var/backups/insightflow/db_backup_YYYYMMDD_HHMMSS.sql.gz
psql -h localhost -U insightflow_user -d insightflow_production < db_backup_YYYYMMDD_HHMMSS.sql
```

---

## 📞 Support Contacts

- **System Administrator**: admin@your-company.com
- **Database Administrator**: dba@your-company.com
- **Security Team**: security@your-company.com
- **Emergency Hotline**: +1-XXX-XXX-XXXX

---

## 📚 Additional Resources

- [Node.js Production Best Practices](https://nodejs.org/en/docs/guides/nodejs-docker-webapp/)
- [PostgreSQL Performance Tuning](https://wiki.postgresql.org/wiki/Performance_Optimization)
- [PM2 Documentation](https://pm2.keymetrics.io/docs/)
- [Nginx Configuration Guide](https://nginx.org/en/docs/)

---

*Deployment Guide Version: 1.0.0*  
*Last Updated: ${new Date().toISOString()}*  
*Status: Production Ready* ✅