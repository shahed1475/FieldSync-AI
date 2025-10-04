-- Database initialization script for FieldSync AI
-- This script runs when the PostgreSQL container starts for the first time

-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gin";

-- Create additional user for application (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'fieldsync_app') THEN
        CREATE ROLE fieldsync_app WITH LOGIN PASSWORD 'app_password';
    END IF;
END
$$;

-- Grant necessary permissions
GRANT CONNECT ON DATABASE fieldsync_ai TO fieldsync_app;
GRANT USAGE ON SCHEMA public TO fieldsync_app;
GRANT CREATE ON SCHEMA public TO fieldsync_app;

-- Create indexes for better performance (will be created after tables are created by Sequelize)
-- These are placeholder comments for indexes that will be created by the application

-- Performance optimization settings
ALTER SYSTEM SET shared_preload_libraries = 'pg_stat_statements';
ALTER SYSTEM SET pg_stat_statements.track = 'all';
ALTER SYSTEM SET log_statement = 'all';
ALTER SYSTEM SET log_min_duration_statement = 1000;

-- Reload configuration
SELECT pg_reload_conf();