module.exports = {
  apps: [
    {
      name: 'fieldsync-ai-api',
      script: './server.js',
      instances: process.env.NODE_ENV === 'production' ? 'max' : 1,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'development',
        PORT: 3000,
        JWT_SECRET: 'your-development-secret-key',
        DB_HOST: 'localhost',
        DB_PORT: 5432,
        DB_NAME: 'fieldsync_ai_dev',
        DB_USER: 'postgres',
        DB_PASS: 'password',
        REDIS_URL: 'redis://localhost:6379',
        LOG_LEVEL: 'debug'
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
        JWT_SECRET: process.env.JWT_SECRET,
        DB_HOST: process.env.DB_HOST,
        DB_PORT: process.env.DB_PORT,
        DB_NAME: process.env.DB_NAME,
        DB_USER: process.env.DB_USER,
        DB_PASS: process.env.DB_PASS,
        REDIS_URL: process.env.REDIS_URL,
        LOG_LEVEL: 'info'
      },
      env_staging: {
        NODE_ENV: 'staging',
        PORT: 3000,
        JWT_SECRET: process.env.JWT_SECRET,
        DB_HOST: process.env.DB_HOST,
        DB_PORT: process.env.DB_PORT,
        DB_NAME: process.env.DB_NAME,
        DB_USER: process.env.DB_USER,
        DB_PASS: process.env.DB_PASS,
        REDIS_URL: process.env.REDIS_URL,
        LOG_LEVEL: 'info'
      },
      // Logging
      log_file: './logs/pm2-combined.log',
      out_file: './logs/pm2-out.log',
      error_file: './logs/pm2-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      
      // Process management
      watch: process.env.NODE_ENV === 'development',
      watch_delay: 1000,
      ignore_watch: [
        'node_modules',
        'logs',
        'uploads',
        'temp',
        '.git',
        '*.log'
      ],
      
      // Auto restart
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      max_memory_restart: '1G',
      
      // Graceful shutdown
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 3000,
      
      // Health monitoring
      health_check_grace_period: 3000,
      
      // Advanced features
      merge_logs: true,
      combine_logs: true,
      
      // Source map support
      source_map_support: true,
      
      // Node.js options
      node_args: '--max-old-space-size=1024',
      
      // Cron restart (restart every day at 2 AM in production)
      cron_restart: process.env.NODE_ENV === 'production' ? '0 2 * * *' : null,
      
      // Monitoring
      pmx: true,
      
      // Custom metrics and actions
      instance_var: 'INSTANCE_ID'
    },
    
    // Background job processor (if needed)
    {
      name: 'fieldsync-ai-worker',
      script: './workers/index.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'development',
        WORKER_TYPE: 'background',
        JWT_SECRET: 'your-development-secret-key',
        DB_HOST: 'localhost',
        DB_PORT: 5432,
        DB_NAME: 'fieldsync_ai_dev',
        DB_USER: 'postgres',
        DB_PASS: 'password',
        REDIS_URL: 'redis://localhost:6379'
      },
      env_production: {
        NODE_ENV: 'production',
        WORKER_TYPE: 'background',
        JWT_SECRET: process.env.JWT_SECRET,
        DB_HOST: process.env.DB_HOST,
        DB_PORT: process.env.DB_PORT,
        DB_NAME: process.env.DB_NAME,
        DB_USER: process.env.DB_USER,
        DB_PASS: process.env.DB_PASS,
        REDIS_URL: process.env.REDIS_URL
      },
      
      // Logging
      log_file: './logs/worker-combined.log',
      out_file: './logs/worker-out.log',
      error_file: './logs/worker-error.log',
      
      // Process management
      autorestart: true,
      max_restarts: 5,
      min_uptime: '10s',
      max_memory_restart: '512M',
      
      // Cron restart
      cron_restart: process.env.NODE_ENV === 'production' ? '0 3 * * *' : null
    }
  ],

  // Deployment configuration
  deploy: {
    production: {
      user: 'deploy',
      host: process.env.PRODUCTION_HOST || 'your-production-server.com',
      ref: 'origin/main',
      repo: 'https://github.com/your-username/fieldsync-ai.git',
      path: '/var/www/fieldsync-ai',
      'pre-deploy-local': '',
      'post-deploy': 'npm install && npm run build && pm2 reload ecosystem.config.js --env production',
      'pre-setup': '',
      ssh_options: 'StrictHostKeyChecking=no'
    },
    
    staging: {
      user: 'deploy',
      host: process.env.STAGING_HOST || 'your-staging-server.com',
      ref: 'origin/develop',
      repo: 'https://github.com/your-username/fieldsync-ai.git',
      path: '/var/www/fieldsync-ai-staging',
      'post-deploy': 'npm install && npm run build && pm2 reload ecosystem.config.js --env staging',
      ssh_options: 'StrictHostKeyChecking=no'
    }
  }
};