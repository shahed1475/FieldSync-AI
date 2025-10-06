import request from 'supertest';
import app from '../src/app';

describe('Health endpoint', () => {
  it('returns OK with database health', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('OK');
    expect(res.body).toHaveProperty('database');
  });
});