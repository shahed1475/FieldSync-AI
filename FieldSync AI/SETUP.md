# InsightFlow AI Backend - Setup Guide

## 🚀 Quick Start

Follow these steps to get your InsightFlow AI backend up and running:

### 1. Prerequisites Check ✅

Make sure you have the following installed:
- **Node.js** (v14 or higher) - [Download here](https://nodejs.org/)
- **PostgreSQL** (v12 or higher) - [Download here](https://www.postgresql.org/download/)
- **Git** (optional) - [Download here](https://git-scm.com/)

### 2. Project Setup 📁

The project structure is already created with all necessary files:

```
InsightFlow AI/
├── config/          # Database configuration
├── middleware/      # Authentication, validation, security
├── models/          # Database models (Sequelize)
├── routes/          # API endpoints
├── scripts/         # Database initialization
├── .env             # Environment variables
├── .env.example     # Environment template
├── package.json     # Dependencies
├── server.js        # Main application
└── README.md        # Documentation
```

### 3. Install Dependencies 📦

Dependencies are already installed using Yarn. If you need to reinstall:

```bash
# Using Yarn (recommended)
yarn install

# Or using npm (if you encounter SSL issues, use yarn)
npm install
```

### 4. Database Setup 🗄️

#### Install PostgreSQL
1. Download and install PostgreSQL from the official website
2. During installation, remember your superuser password
3. Start the PostgreSQL service

#### Create Database
Open PostgreSQL command line (psql) or pgAdmin and run:

```sql
CREATE DATABASE insightflow_ai;
```

#### Configure Environment Variables
Update the `.env` file with your database credentials:

```env
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=insightflow_ai
DB_USER=postgres
DB_PASSWORD=your_actual_password_here

# JWT Configuration (change this!)
JWT_SECRET=your_super_secret_jwt_key_change_this_in_production
JWT_EXPIRES_IN=24h

# Server Configuration
PORT=3000
NODE_ENV=development
```

### 5. Initialize Database 🌱

Run the database initialization script to create tables and sample data:

```bash
# Using npm script
npm run init-db

# Or directly
node scripts/initDatabase.js
```

This will:
- Create all database tables
- Add sample organization, data sources, queries, dashboards, and insights
- Set up query cache

### 6. Start the Server 🚀

```bash
# Development mode (with auto-reload)
npm run dev

# Or production mode
npm start
```

You should see:
```
✅ Database connection established successfully.
✅ Database tables synchronized successfully.
🚀 InsightFlow AI server is running on port 3000
🌐 Server URL: http://localhost:3000
```

### 7. Test the API 🧪

#### Health Check
```bash
curl http://localhost:3000/health
```

#### Register an Organization
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Organization", "subscription_tier": "premium"}'
```

#### Login and Get Token
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Organization"}'
```

#### Use the API (replace YOUR_TOKEN with the token from login)
```bash
curl -X GET http://localhost:3000/api/organizations/1 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## 🔧 Troubleshooting

### Common Issues

#### 1. Database Connection Failed
```
❌ Database initialization failed: ConnectionRefusedError
```

**Solutions:**
- Make sure PostgreSQL is running
- Check your database credentials in `.env`
- Verify the database `insightflow_ai` exists
- Test connection: `psql -h localhost -U postgres -d insightflow_ai`

#### 2. npm Install SSL Errors
```
npm error code ERR_SSL_CIPHER_OPERATION_FAILED
```

**Solution:** Use Yarn instead:
```bash
yarn install
```

#### 3. Port Already in Use
```
Error: listen EADDRINUSE: address already in use :::3000
```

**Solutions:**
- Change the PORT in `.env` file
- Kill the process using port 3000: `netstat -ano | findstr :3000`

#### 4. JWT Token Issues
```
Invalid token / Token expired
```

**Solutions:**
- Make sure JWT_SECRET is set in `.env`
- Re-login to get a fresh token
- Check token format: `Bearer <token>`

### 5. Permission Errors (Windows)
```
EPERM: operation not permitted
```

**Solutions:**
- Run terminal as Administrator
- Close any antivirus software temporarily
- Use Yarn instead of npm

## 📊 Sample Data

After running the initialization script, you'll have:

- **1 Organization**: "Acme Analytics Corp"
- **2 Data Sources**: PostgreSQL and MySQL connections
- **2 Sample Queries**: Customer analysis and inventory check
- **1 Dashboard**: Sales Performance Dashboard
- **2 Insights**: Sales trend and anomaly detection
- **1 Cache Entry**: Sample cached query result

## 🔐 Security Features

The backend includes:
- JWT authentication for all protected routes
- Rate limiting (100 requests/15min general, 5 requests/15min auth)
- Input sanitization and XSS protection
- SQL injection protection
- Request size limiting (10MB max)
- CORS and security headers

## 🚀 Next Steps

1. **Connect to Real Data Sources**: Update the data source connection strings
2. **Implement AI Features**: Add natural language to SQL conversion
3. **Add Tests**: Create unit and integration tests
4. **Deploy**: Set up production environment
5. **Monitor**: Add logging and monitoring tools

## 📞 Support

If you encounter any issues:
1. Check this troubleshooting guide
2. Review the logs in the terminal
3. Check the `.env` configuration
4. Ensure all prerequisites are installed

## 🎉 Success!

If everything is working, you should be able to:
- ✅ Start the server without errors
- ✅ Access the health endpoint
- ✅ Register and login organizations
- ✅ Create and query data sources
- ✅ Manage queries, dashboards, and insights

Your InsightFlow AI backend is now ready for development!