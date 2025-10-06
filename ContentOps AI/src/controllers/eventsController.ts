import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { AuthRequest } from '../types';
import { addClient, removeClient } from '../utils/sse';
import { verifyAccessToken } from '../utils/jwt';

export const subscribeEvents = asyncHandler(async (req: AuthRequest, res: Response) => {
  // Support token via query for EventSource
  let accountId = req.user?.id as string | undefined;
  const token = (req.query.token as string) || undefined;
  if (!accountId && token) {
    try {
      const decoded = verifyAccessToken(token);
      accountId = decoded.id;
    } catch (e) {
      // Fall through; will reject below
    }
  }
  if (!accountId) {
    res.status(401).end();
    return;
  }
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  addClient(accountId, res);
  res.write(`event: connected\ndata: ${JSON.stringify({ accountId, ts: Date.now() })}\n\n`);

  req.on('close', () => {
    removeClient(accountId!, res);
  });
});