import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { prisma } from './lib/prisma';

// Import admin routes
import { adminAnalyticsRouter } from './routes/admin/analytics';
import { adminUsersRouter } from './routes/admin/users';
import { adminProjectsRouter } from './routes/admin/projects';
import { adminSubscriptionsRouter } from './routes/admin/subscriptions';
import { adminFinancialsRouter } from './routes/admin/financials';
import { adminSystemRouter } from './routes/admin/system';
import { adminAuditRouter } from './routes/admin/audit';
import { adminNotificationsRouter } from './routes/admin/notifications';

// Import OCCAM routes
import { occamRouter } from './routes/occam';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.get('/api', (req, res) => {
  res.json({
    message: 'OtriX API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// Admin routes
app.use('/api/admin/analytics', adminAnalyticsRouter);
app.use('/api/admin/users', adminUsersRouter);
app.use('/api/admin/projects', adminProjectsRouter);
app.use('/api/admin/subscriptions', adminSubscriptionsRouter);
app.use('/api/admin/financials', adminFinancialsRouter);
app.use('/api/admin/system', adminSystemRouter);
app.use('/api/admin/audit', adminAuditRouter);
app.use('/api/admin/notifications', adminNotificationsRouter);

// OCCAM routes
app.use('/api/occam', occamRouter);

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'An error occurred',
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: 'The requested resource was not found',
  });
});

// Start server
async function start() {
  try {
    // Test database connection
    await prisma.$connect();
    console.log('✅ Database connected');

    app.listen(PORT, () => {
      console.log(`🚀 API server running on http://localhost:${PORT}`);
      console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle shutdown gracefully
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  await prisma.$disconnect();
  process.exit(0);
});

start();
