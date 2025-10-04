# InsightFlow AI Backend

A secure, scalable backend system for InsightFlow AI - an analytics platform that converts natural language into business insights.

## 🚀 Features

- **RESTful API** with JWT authentication
- **PostgreSQL** database with Sequelize ORM
- **Comprehensive CRUD operations** for all entities
- **Advanced security** with rate limiting, input sanitization, and SQL injection protection
- **Query caching** for improved performance
- **Modular architecture** ready for AI integration

## 📋 Prerequisites

- Node.js (v14 or higher)
- PostgreSQL (v12 or higher)
- npm or yarn

## 🛠️ Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd insightflow-ai-backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` file with your database credentials and JWT secret.

4. **Set up PostgreSQL database**
   ```sql
   CREATE DATABASE insightflow_ai;
   ```

5. **Initialize the database**
   ```bash
   node scripts/initDatabase.js
   ```

6. **Start the server**
   ```bash
   # Development mode
   npm run dev
   
   # Production mode
   npm start
   ```

## 📚 API Documentation

### Authentication

#### Register Organization
```http
POST /api/auth/register
Content-Type: application/json

{
  "name": "Organization Name",
  "subscription_tier": "premium"
}
```

#### Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "name": "Organization Name"
}
```

### Organizations

#### Get Organization
```http
GET /api/organizations/:id
Authorization: Bearer <token>
```

#### Update Organization
```http
PUT /api/organizations/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Updated Name",
  "subscription_tier": "enterprise"
}
```

### Data Sources

#### List Data Sources
```http
GET /api/data-sources?page=1&limit=10
Authorization: Bearer <token>
```

#### Create Data Source
```http
POST /api/data-sources
Authorization: Bearer <token>
Content-Type: application/json

{
  "type": "postgresql",
  "connection_string": "postgresql://user:pass@host:port/db",
  "schema": {"tables": ["users", "orders"]}
}
```

### Queries

#### List Queries
```http
GET /api/queries?page=1&limit=10
Authorization: Bearer <token>
```

#### Create Query
```http
POST /api/queries
Authorization: Bearer <token>
Content-Type: application/json

{
  "data_source_id": 1,
  "natural_language": "Show me top 10 customers by revenue"
}
```

### Dashboards

#### List Dashboards
```http
GET /api/dashboards?page=1&limit=10
Authorization: Bearer <token>
```

#### Create Dashboard
```http
POST /api/dashboards
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Sales Dashboard",
  "layout": {"widgets": []},
  "refresh_schedule": "0 */6 * * *"
}
```

### Insights

#### List Insights
```http
GET /api/insights?page=1&limit=10
Authorization: Bearer <token>
```

#### Create Insight
```http
POST /api/insights
Authorization: Bearer <token>
Content-Type: application/json

{
  "type": "trend",
  "description": "Sales increased by 15%",
  "severity": "info",
  "confidence_score": 0.85
}
```

## 🗄️ Database Schema

### Organizations
- `id` (Primary Key)
- `name` (String, Unique)
- `subscription_tier` (Enum: basic, premium, enterprise)
- `created_at`, `updated_at`

### Data Sources
- `id` (Primary Key)
- `org_id` (Foreign Key)
- `type` (Enum: postgresql, mysql, mongodb, etc.)
- `connection_string` (Encrypted)
- `schema` (JSON)
- `is_active` (Boolean)
- `last_connected` (DateTime)
- `created_at`, `updated_at`

### Queries
- `id` (Primary Key)
- `org_id` (Foreign Key)
- `data_source_id` (Foreign Key)
- `natural_language` (Text)
- `sql_generated` (Text)
- `results` (JSON)
- `execution_time_ms` (Integer)
- `status` (Enum: pending, running, completed, failed)
- `error_message` (Text)
- `created_at`, `updated_at`

### Dashboards
- `id` (Primary Key)
- `org_id` (Foreign Key)
- `name` (String)
- `layout` (JSON)
- `refresh_schedule` (String - Cron format)
- `is_public` (Boolean)
- `last_refreshed` (DateTime)
- `created_at`, `updated_at`

### Insights
- `id` (Primary Key)
- `org_id` (Foreign Key)
- `type` (Enum: trend, anomaly, prediction, recommendation)
- `description` (Text)
- `severity` (Enum: info, warning, critical)
- `confidence_score` (Float)
- `metadata` (JSON)
- `is_acknowledged` (Boolean)
- `acknowledged_at` (DateTime)
- `created_at`, `updated_at`

### Query Cache
- `query_hash` (Primary Key)
- `results` (JSON)
- `expiry` (DateTime)
- `hit_count` (Integer)
- `created_at`, `updated_at`

## 🔒 Security Features

- **JWT Authentication** for all protected routes
- **Rate Limiting** (100 requests per 15 minutes for general API, 5 for auth)
- **Input Sanitization** to prevent XSS attacks
- **SQL Injection Protection** for user inputs
- **Request Size Limiting** (10MB max)
- **CORS** and **Helmet** for additional security headers

## 🚀 Scripts

```bash
# Start development server with auto-reload
npm run dev

# Start production server
npm start

# Initialize database with sample data
npm run init-db

# Run tests (when implemented)
npm test
```

## 📁 Project Structure

```
├── config/
│   └── database.js          # Database configuration
├── middleware/
│   ├── auth.js              # JWT authentication
│   ├── validation.js        # Input validation schemas
│   ├── errorHandler.js      # Global error handling
│   └── security.js          # Security middleware
├── models/
│   ├── index.js             # Model associations
│   ├── Organization.js      # Organization model
│   ├── DataSource.js        # Data source model
│   ├── Query.js             # Query model
│   ├── Dashboard.js         # Dashboard model
│   ├── Insight.js           # Insight model
│   └── QueryCache.js        # Query cache model
├── routes/
│   ├── auth.js              # Authentication routes
│   ├── organizations.js     # Organization CRUD
│   ├── dataSources.js       # Data source CRUD
│   ├── queries.js           # Query CRUD
│   ├── dashboards.js        # Dashboard CRUD
│   └── insights.js          # Insight CRUD
├── scripts/
│   └── initDatabase.js      # Database initialization
├── .env.example             # Environment variables template
├── .env                     # Environment variables (create from template)
├── package.json             # Dependencies and scripts
└── server.js                # Main application entry point
```

## 🔧 Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DB_HOST` | PostgreSQL host | localhost |
| `DB_PORT` | PostgreSQL port | 5432 |
| `DB_NAME` | Database name | insightflow_ai |
| `DB_USER` | Database username | postgres |
| `DB_PASSWORD` | Database password | - |
| `JWT_SECRET` | JWT signing secret | - |
| `JWT_EXPIRES_IN` | JWT expiration time | 24h |
| `PORT` | Server port | 3000 |
| `NODE_ENV` | Environment | development |

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 🆘 Support

For support and questions, please open an issue in the repository.