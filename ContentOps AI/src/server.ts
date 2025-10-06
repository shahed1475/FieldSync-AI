import app from './app';
import { config } from 'dotenv';

// Load environment variables
config();

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

const server = app.listen(PORT, HOST, () => {
  const env = process.env.NODE_ENV || 'development';
  const displayHost = HOST === '0.0.0.0' ? 'localhost' : HOST;
  const url = `http://${displayHost}:${PORT}`;
  console.log([
    '✅ ContentOps AI Backend API v1.0.0',
    `🚀 Running on ${url}`,
    '📡 Status: Online and Ready for Testing',
    `Environment: ${env}`,
    'Endpoints:   /           (HTML dashboard)\n             /api/status (JSON status)\n             /api/health  (health check)',
    `Timestamp:   ${new Date().toISOString()}`,
  ].join('\n'));
});

// Handle server errors
server.on('error', (err) => {
  console.error('Server error:', err);
});

// Graceful shutdown
const shutdown = (signal: string) => {
  console.log(`${signal} received, shutting down gracefully...`);
  server.close(() => {
    console.log('HTTP server closed.');
    process.exit(0);
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Promise Rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});