/**
 * OCCAM Regulatory Intelligence API Routes
 * Phase 2: Regulatory Intelligence
 */

import { Router, Request, Response } from 'express';
import { regulatoryLogicMatrix, regulatoryDriftDetector } from '@otrix/occam-agents';

const router = Router();

/**
 * POST /api/occam/regint/matrix
 * Build regulatory logic matrix from requirements
 */
router.post('/matrix', async (req: Request, res: Response) => {
  try {
    const { domain, requirements } = req.body;

    if (!domain || !requirements || !Array.isArray(requirements)) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: domain and requirements array',
      });
    }

    const result = regulatoryLogicMatrix.combineRequirements({
      domain,
      requirements,
    });

    res.json({
      success: true,
      matrix: result,
    });
  } catch (error) {
    console.error('Matrix generation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to build regulatory matrix',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/occam/regint/drift/scan
 * Run drift detection between regulatory snapshots
 */
router.post('/drift/scan', async (req: Request, res: Response) => {
  try {
    const { framework, previousSnapshot, currentSnapshot } = req.body;

    if (!framework || !previousSnapshot || !currentSnapshot) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: framework, previousSnapshot, currentSnapshot',
      });
    }

    const result = regulatoryDriftDetector.detectDrift({
      framework,
      previousSnapshot,
      currentSnapshot,
    });

    res.json({
      success: true,
      drift: result,
    });
  } catch (error) {
    console.error('Drift detection error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to detect drift',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/occam/regint/drift/store
 * Store a regulatory snapshot for future comparison
 */
router.post('/drift/store', async (req: Request, res: Response) => {
  try {
    const { framework, version, requirements } = req.body;

    if (!framework || !version || !requirements) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: framework, version, requirements',
      });
    }

    const snapshot = {
      framework,
      version,
      snapshotDate: new Date(),
      requirements,
    };

    regulatoryDriftDetector.storeSnapshot(snapshot);

    res.json({
      success: true,
      message: 'Snapshot stored successfully',
      snapshot: {
        framework,
        version,
        snapshotDate: snapshot.snapshotDate,
        requirementCount: requirements.length,
      },
    });
  } catch (error) {
    console.error('Snapshot storage error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to store snapshot',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/occam/regint/drift/history/:framework
 * Get snapshot history for a framework
 */
router.get('/drift/history/:framework', async (req: Request, res: Response) => {
  try {
    const { framework } = req.params;

    const history = regulatoryDriftDetector.getSnapshotHistory(framework as any);

    res.json({
      success: true,
      framework,
      snapshotCount: history.length,
      snapshots: history.map(s => ({
        version: s.version,
        snapshotDate: s.snapshotDate,
        requirementCount: s.requirements.length,
      })),
    });
  } catch (error) {
    console.error('History retrieval error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve snapshot history',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/occam/regint/health
 * Health check for regulatory intelligence engine
 */
router.get('/health', (req: Request, res: Response) => {
  res.json({
    success: true,
    service: 'OCCAM Regulatory Intelligence',
    status: 'operational',
    timestamp: new Date().toISOString(),
    features: {
      logicMatrix: 'enabled',
      driftDetection: 'enabled',
      snapshotStorage: 'enabled',
    },
  });
});

export const regintRouter = router;
