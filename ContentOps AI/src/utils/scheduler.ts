import { publishDueScheduledPosts } from '../services/publishService';
import { logger } from './logger';

let intervalHandle: NodeJS.Timeout | null = null;

export const startScheduler = (intervalMs: number = 60_000) => {
  if (intervalHandle) return; // prevent duplicate
  intervalHandle = setInterval(async () => {
    try {
      const results = await publishDueScheduledPosts();
      if (results.length) {
        logger.info(`[Scheduler] Processed ${results.length} scheduled posts`);
      }
    } catch (e) {
      logger.error('[Scheduler] Error processing scheduled posts', { error: e });
    }
  }, intervalMs);
  logger.info(`[Scheduler] Started with interval ${intervalMs}ms`);
};

export const stopScheduler = () => {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    logger.info('[Scheduler] Stopped');
  }
};