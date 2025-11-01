import { beforeAll, afterAll } from 'vitest';
import dotenv from 'dotenv';

// Load test environment variables
dotenv.config({ path: '.env.test' });

// If no test env file, use development env
if (!process.env.DATABASE_URL) {
  dotenv.config({ path: '.env' });
}

beforeAll(async () => {
  // Setup test database if needed
  console.log('Setting up test environment...');
});

afterAll(async () => {
  // Cleanup
  console.log('Cleaning up test environment...');
});
