import { Response } from 'express';
import { logger } from './logger';

type Client = { res: Response; createdAt: number };

const clientsByAccount: Map<string, Set<Client>> = new Map();

export function addClient(accountId: string, res: Response) {
  const set = clientsByAccount.get(accountId) || new Set<Client>();
  const client: Client = { res, createdAt: Date.now() };
  set.add(client);
  clientsByAccount.set(accountId, set);
  logger.info('SSE client connected', { accountId, clients: set.size });
}

export function removeClient(accountId: string, res: Response) {
  const set = clientsByAccount.get(accountId);
  if (!set) return;
  for (const c of set) {
    if (c.res === res) set.delete(c);
  }
  if (set.size === 0) clientsByAccount.delete(accountId);
  logger.info('SSE client disconnected', { accountId, clients: set.size });
}

export function broadcastToAccount(accountId: string, event: string, data: unknown) {
  const set = clientsByAccount.get(accountId);
  if (!set || set.size === 0) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of set) {
    try {
      client.res.write(payload);
    } catch (err) {
      logger.warn('SSE broadcast error', { accountId, err });
    }
  }
}