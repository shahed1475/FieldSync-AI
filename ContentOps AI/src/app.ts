import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { config } from 'dotenv';
import routes from './routes';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { testDatabaseConnection } from './utils/database';

// Load environment variables
config();

const app = express();

// Pretty-print JSON responses
app.set('json spaces', 2);
// Remove x-powered-by header for security
app.disable('x-powered-by');

// Security middleware
app.use(helmet({
  // Allow embedding in IDE webviews during development
  frameguard: false,
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      // Permit framing by any origin for local preview/demo
      frameAncestors: ["*"]
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// CORS configuration
const corsOptions = {
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
};

app.use(cors(corsOptions));

// Compression middleware
app.use(compression());

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Simple request logging: method, path, timestamp
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// Logging middleware
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Trust proxy for rate limiting and IP detection
app.set('trust proxy', 1);

// API Routes
app.use('/api', routes);

// Root HTML dashboard
app.get('/', (req, res) => {
  const version = '1.0.0';
  const now = new Date().toISOString();
  res.type('html').send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>ContentOps AI Backend API</title>
  <style>
    :root { --bg:#0b1220; --card:#111a2e; --text:#e6edf7; --muted:#9aa4b2; --ok:#22c55e; --bad:#ef4444; --warn:#f59e0b; --link:#60a5fa; }
    body { margin:0; font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Noto Sans,sans-serif; background:var(--bg); color:var(--text); }
    header { padding:24px; border-bottom:1px solid #1f2b44; }
    .wrap { max-width:920px; margin:0 auto; padding:24px; }
    .title { font-size:22px; font-weight:600; }
    .sub { color:var(--muted); font-size:14px; }
    .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:16px; }
    .card { background:var(--card); border:1px solid #1f2b44; border-radius:10px; padding:16px; }
    .badge { display:inline-flex; align-items:center; gap:8px; padding:6px 10px; border-radius:999px; font-size:13px; }
    .ok { background-color:rgba(34,197,94,0.16); color:#22c55e; }
    .bad { background-color:rgba(239,68,68,0.16); color:#ef4444; }
    .warn { background-color:rgba(245,158,11,0.16); color:#f59e0b; }
    .list { list-style:none; padding:0; margin:0; }
    .list li { display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px dashed #1f2b44; }
    .list li:last-child { border-bottom:0; }
    a { color:var(--link); text-decoration:none; }
    a:hover { text-decoration:underline; }
    .foot { margin-top:16px; color:var(--muted); font-size:12px; }
  </style>
</head>
<body>
  <header>
    <div class="wrap">
      <div class="title">✅ ContentOps AI Backend API <span style="color:var(--muted);">v${version}</span></div>
      <div class="sub">🚀 Running on <code>http://localhost:${Number(process.env.PORT)||3000}</code> • 📡 Status: <span id="apiStatus">Checking…</span></div>
    </div>
  </header>
  <main class="wrap">
    <div class="grid">
      <section class="card">
        <h3>Live Status</h3>
        <p>
          <span id="healthBadge" class="badge warn">⌛ Loading health…</span>
        </p>
        <div id="healthDetails" class="sub"></div>
      </section>
      <section class="card">
        <h3>Endpoints</h3>
        <ul class="list">
          <li><span>Health</span><a href="/api/health" target="_blank">GET /api/health</a></li>
          <li><span>Status</span><a href="/api/status" target="_blank">GET /api/status</a></li>
          <li><span>Auth</span><span class="badge warn">Auth Required</span></li>
          <li><span>Accounts</span><span class="badge warn">Auth Required</span></li>
          <li><span>Channels</span><span class="badge warn">Auth Required</span></li>
          <li><span>Content</span><span class="badge warn">Auth Required</span></li>
          <li><span>Posts</span><span class="badge warn">Auth Required</span></li>
          <li><span>Analytics</span><span class="badge warn">Auth Required</span></li>
          <li><span>Dashboard</span><span class="badge warn">Auth Required</span></li>
          <li><span>Events</span><a href="/api/events/subscribe" target="_blank">GET /api/events/subscribe</a></li>
        </ul>
        <div class="foot">Use Postman for authenticated endpoints.</div>
      </section>
      <section class="card">
        <h3>Quick Test</h3>
        <p><a href="/test" target="_blank">Open /test</a> — simple connectivity check.</p>
      </section>
    </div>
    <div class="foot">Updated: ${now}</div>
  </main>
  <script>
    async function updateHealth(){
      try {
        const res = await fetch('/api/health');
        const data = await res.json();
        const ok = res.ok && data.status === 'OK';
        document.getElementById('apiStatus').textContent = ok ? 'Online and Ready for Testing' : 'Down';
        const badge = document.getElementById('healthBadge');
        badge.className = 'badge ' + (ok ? 'ok' : 'bad');
        badge.textContent = ok ? '✅ API Healthy' : '❌ API Unhealthy';
        document.getElementById('healthDetails').textContent = 'Uptime: ' + (data.uptime ?? 'n/a') + 's • Version: ' + (data.version ?? 'n/a') + ' • DB: ' + ((data.database && data.database.status) ? data.database.status : 'unknown');
      } catch (e) {
        document.getElementById('apiStatus').textContent = 'Down';
        const badge = document.getElementById('healthBadge');
        badge.className = 'badge bad';
        badge.textContent = '❌ API Unreachable';
        document.getElementById('healthDetails').textContent = '';
      }
    }
    updateHealth();
    setInterval(updateHealth, 5000);
  </script>
</body>
</html>`);
});

// JSON status endpoint
app.get('/api/status', (req, res) => {
  res.json({
    message: 'ContentOps AI Backend API',
    version: '1.0.0',
    status: 'Running ✅',
    timestamp: new Date().toISOString(),
    endpoints: {
      health: '/api/health',
      auth: '/api/auth',
      accounts: '/api/accounts',
      channels: '/api/channels',
      content: '/api/content',
      posts: '/api/posts',
      analytics: '/api/analytics',
      dashboard: '/api/dashboard'
    }
  });
});

// Optional connectivity test page
app.get('/test', (_req, res) => {
  res.type('html').send(`<!doctype html>
<html><head><meta charset="utf-8" /><title>Server Test</title>
<style>body{font-family:system-ui;background:#0b1220;color:#e6edf7;display:grid;place-items:center;height:100vh;margin:0}.box{padding:24px;border-radius:12px;background:#111a2e;border:1px solid #1f2b44;text-align:center}.ok{color:#22c55e}</style>
</head><body><div class="box"><h2>Server Connected Successfully</h2><p class="ok">● Online</p></div></body></html>`);
});

// Error handling middleware (must be last)
app.use(notFoundHandler);
app.use(errorHandler);

// Initialize database connection
testDatabaseConnection().catch((error) => {
  console.error('Failed to connect to database:', error);
  console.warn('Continuing server startup without database connection. Some routes may be unavailable.');
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  process.exit(0);
});

export default app;