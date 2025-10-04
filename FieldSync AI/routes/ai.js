const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { authenticateToken } = require('../middleware/auth');
const intentDetection = require('../services/ai/intentDetection');
const sqlGenerator = require('../services/ai/sqlGenerator');
const sqlExecutor = require('../services/ai/sqlExecutor');
const queryManager = require('../services/ai/queryManager');
const websocketServer = require('../services/websocket/websocketServer');
const { DataSource } = require('../models');

// Validation schemas
const querySchema = Joi.object({
  query: Joi.string().required().min(5).max(1000),
  dataSourceId: Joi.number().integer().required(),
  useCache: Joi.boolean().default(true),
  explain: Joi.boolean().default(false),
  streaming: Joi.boolean().default(false)
});

const streamQuerySchema = Joi.object({
  query: Joi.string().required().min(5).max(1000),
  dataSourceId: Joi.number().integer().required(),
  useCache: Joi.boolean().default(true),
  explain: Joi.boolean().default(false)
});

const feedbackSchema = Joi.object({
  helpful: Joi.boolean().required(),
  accurate: Joi.boolean().required(),
  comments: Joi.string().max(500).allow(''),
  rating: Joi.number().integer().min(1).max(5)
});

const historyQuerySchema = Joi.object({
  limit: Joi.number().integer().min(1).max(100).default(50),
  offset: Joi.number().integer().min(0).default(0),
  dataSourceId: Joi.number().integer(),
  status: Joi.string().valid('completed', 'failed'),
  intent: Joi.string(),
  startDate: Joi.date().iso(),
  endDate: Joi.date().iso(),
  search: Joi.string().max(100)
});

// POST /api/ai/query - Process natural language query
router.post('/query', authenticateToken, async (req, res) => {
  try {
    const { error, value } = querySchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.details[0].message
      });
    }

    const { query, dataSourceId, useCache, explain } = value;
    const organizationId = req.user.organization_id;

    // Verify data source access
    const dataSource = await DataSource.findOne({
      where: { 
        id: dataSourceId, 
        organization_id: organizationId 
      }
    });

    if (!dataSource) {
      return res.status(404).json({
        success: false,
        error: 'Data source not found or access denied'
      });
    }

    const startTime = Date.now();
    let queryResult = null;

    try {
      // Step 1: Intent Detection
      const intentResult = await intentDetection.classifyQuery(query);
      
      if (intentResult.confidence < 0.3) {
        return res.status(400).json({
          success: false,
          error: 'Unable to understand the query. Please try rephrasing your question.',
          suggestions: intentResult.suggestions,
          intent: intentResult
        });
      }

      // Step 2: Check cache for similar queries if enabled
      let cachedResult = null;
      if (useCache) {
        const similarQueries = await queryManager.findSimilarQueries(
          query, 
          organizationId, 
          dataSourceId, 
          1
        );
        
        if (similarQueries.length > 0) {
          cachedResult = await queryManager.getCachedResult(similarQueries[0].id);
        }
      }

      if (cachedResult) {
        // Return cached result
        queryResult = {
          success: true,
          data: cachedResult.data,
          columns: cachedResult.columns,
          rowCount: cachedResult.data.length,
          executionTime: Date.now() - startTime,
          cached: true,
          cachedAt: cachedResult.cached_at,
          intent: intentResult,
          sql: null // Don't expose SQL for cached results
        };
      } else {
        // Step 3: Generate SQL
        const sqlResult = await sqlGenerator.generateSQL(query, dataSource, intentResult);
        
        if (!sqlResult.success) {
          throw new Error(sqlResult.error);
        }

        // Step 4: Execute SQL
        const executionResult = await sqlExecutor.executeQuery(
          sqlResult.sql, 
          dataSource, 
          { timeout: 30000 }
        );

        if (!executionResult.success) {
          throw new Error(executionResult.error);
        }

        queryResult = {
          success: true,
          data: executionResult.data,
          columns: executionResult.columns,
          rowCount: executionResult.rowCount,
          executionTime: Date.now() - startTime,
          cached: false,
          intent: intentResult,
          sql: explain ? sqlResult.sql : null,
          optimizations: sqlResult.optimizations,
          dataSourceType: dataSource.type
        };
      }

      // Step 5: Save query and results
      const savedQuery = await queryManager.saveQuery({
        naturalLanguage: query,
        sql: queryResult.sql || (cachedResult ? 'CACHED' : 'UNKNOWN'),
        intent: intentResult.intent,
        confidence: intentResult.confidence,
        dataSourceId: dataSourceId,
        executionTime: queryResult.executionTime,
        rowCount: queryResult.rowCount,
        success: true,
        data: queryResult.data,
        columns: queryResult.columns,
        entities: intentResult.entities,
        timeframe: intentResult.timeframe,
        metrics: intentResult.metrics,
        dimensions: intentResult.dimensions,
        optimizations: queryResult.optimizations
      }, organizationId);

      // Add query ID to response
      queryResult.queryId = savedQuery.id;

      res.json(queryResult);

    } catch (executionError) {
      console.error('Query execution error:', executionError);

      // Save failed query
      await queryManager.saveQuery({
        naturalLanguage: query,
        sql: null,
        intent: intentResult?.intent || 'unknown',
        confidence: intentResult?.confidence || 0,
        dataSourceId: dataSourceId,
        executionTime: Date.now() - startTime,
        rowCount: 0,
        success: false,
        error: executionError.message,
        entities: intentResult?.entities || {},
        timeframe: intentResult?.timeframe || null,
        metrics: intentResult?.metrics || [],
        dimensions: intentResult?.dimensions || [],
        dataSourceType: dataSource.type
      }, organizationId);

      res.status(500).json({
        success: false,
        error: 'Failed to execute query',
        details: executionError.message,
        intent: intentResult,
        executionTime: Date.now() - startTime
      });
    }

  } catch (error) {
    console.error('AI query processing error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
});

// GET /api/ai/queries - Get query history
router.get('/queries', authenticateToken, async (req, res) => {
  try {
    const { error, value } = historyQuerySchema.validate(req.query);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.details[0].message
      });
    }

    const organizationId = req.user.organization_id;
    const result = await queryManager.getQueryHistory(organizationId, value);

    res.json({
      success: true,
      ...result
    });

  } catch (error) {
    console.error('Error retrieving query history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve query history',
      details: error.message
    });
  }
});

// GET /api/ai/queries/:id - Get specific query details
router.get('/queries/:id', authenticateToken, async (req, res) => {
  try {
    const queryId = parseInt(req.params.id);
    if (isNaN(queryId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid query ID'
      });
    }

    const organizationId = req.user.organization_id;
    const query = await queryManager.getQuery(queryId, organizationId);

    // Check for cached results
    const cachedResult = await queryManager.getCachedResult(queryId);

    res.json({
      success: true,
      query,
      cachedResult: cachedResult ? {
        available: true,
        cachedAt: cachedResult.cached_at,
        rowCount: cachedResult.data.length
      } : { available: false }
    });

  } catch (error) {
    console.error('Error retrieving query:', error);
    
    if (error.message === 'Query not found') {
      return res.status(404).json({
        success: false,
        error: 'Query not found'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to retrieve query',
      details: error.message
    });
  }
});

// GET /api/ai/queries/:id/results - Get cached query results
router.get('/queries/:id/results', authenticateToken, async (req, res) => {
  try {
    const queryId = parseInt(req.params.id);
    if (isNaN(queryId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid query ID'
      });
    }

    const organizationId = req.user.organization_id;
    
    // Verify query ownership
    const query = await queryManager.getQuery(queryId, organizationId);
    
    // Get cached results
    const cachedResult = await queryManager.getCachedResult(queryId);
    
    if (!cachedResult) {
      return res.status(404).json({
        success: false,
        error: 'Cached results not found or expired'
      });
    }

    res.json({
      success: true,
      data: cachedResult.data,
      columns: cachedResult.columns,
      rowCount: cachedResult.data.length,
      cachedAt: cachedResult.cached_at,
      queryId: queryId
    });

  } catch (error) {
    console.error('Error retrieving cached results:', error);
    
    if (error.message === 'Query not found') {
      return res.status(404).json({
        success: false,
        error: 'Query not found'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to retrieve cached results',
      details: error.message
    });
  }
});

// POST /api/ai/queries/:id/feedback - Submit query feedback
router.post('/queries/:id/feedback', authenticateToken, async (req, res) => {
  try {
    const queryId = parseInt(req.params.id);
    if (isNaN(queryId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid query ID'
      });
    }

    const { error, value } = feedbackSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.details[0].message
      });
    }

    const organizationId = req.user.organization_id;
    const updatedQuery = await queryManager.updateQueryFeedback(
      queryId, 
      organizationId, 
      value
    );

    res.json({
      success: true,
      message: 'Feedback submitted successfully',
      queryId: updatedQuery.id
    });

  } catch (error) {
    console.error('Error submitting feedback:', error);
    
    if (error.message === 'Query not found') {
      return res.status(404).json({
        success: false,
        error: 'Query not found'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to submit feedback',
      details: error.message
    });
  }
});

// DELETE /api/ai/queries/:id - Delete query and cached results
router.delete('/queries/:id', authenticateToken, async (req, res) => {
  try {
    const queryId = parseInt(req.params.id);
    if (isNaN(queryId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid query ID'
      });
    }

    const organizationId = req.user.organization_id;
    await queryManager.deleteQuery(queryId, organizationId);

    res.json({
      success: true,
      message: 'Query deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting query:', error);
    
    if (error.message === 'Query not found') {
      return res.status(404).json({
        success: false,
        error: 'Query not found'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to delete query',
      details: error.message
    });
  }
});

// GET /api/ai/analytics - Get query analytics
router.get('/analytics', authenticateToken, async (req, res) => {
  try {
    const timeframe = req.query.timeframe || '30d';
    const validTimeframes = ['1d', '7d', '30d', '90d', '1y'];
    
    if (!validTimeframes.includes(timeframe)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid timeframe. Valid options: ' + validTimeframes.join(', ')
      });
    }

    const organizationId = req.user.organization_id;
    const analytics = await queryManager.getQueryAnalytics(organizationId, timeframe);

    res.json({
      success: true,
      analytics,
      timeframe
    });

  } catch (error) {
    console.error('Error retrieving analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve analytics',
      details: error.message
    });
  }
});

// GET /api/ai/optimization-report - Get query optimization report
router.get('/optimization-report', authenticateToken, async (req, res) => {
  try {
    const timeframe = req.query.timeframe || '30d';
    const validTimeframes = ['1d', '7d', '30d', '90d', '1y'];
    
    if (!validTimeframes.includes(timeframe)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid timeframe. Valid options: ' + validTimeframes.join(', ')
      });
    }

    const organizationId = req.user.organization_id;
    const report = await queryManager.getOptimizationReport(organizationId, timeframe);

    res.json({
      success: true,
      report,
      timeframe
    });

  } catch (error) {
    console.error('Error retrieving optimization report:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve optimization report',
      details: error.message
    });
  }
});

// POST /api/ai/explain - Explain a natural language query without executing
router.post('/explain', authenticateToken, async (req, res) => {
  try {
    const { error, value } = Joi.object({
      query: Joi.string().required().min(5).max(1000),
      dataSourceId: Joi.number().integer().required()
    }).validate(req.body);

    if (error) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.details[0].message
      });
    }

    const { query, dataSourceId } = value;
    const organizationId = req.user.organization_id;

    // Verify data source access
    const dataSource = await DataSource.findOne({
      where: { 
        id: dataSourceId, 
        organization_id: organizationId 
      }
    });

    if (!dataSource) {
      return res.status(404).json({
        success: false,
        error: 'Data source not found or access denied'
      });
    }

    // Analyze intent
    const intentResult = await intentDetection.classifyQuery(query);
    
    // Generate SQL without executing
    let sqlResult = null;
    if (intentResult.confidence >= 0.3) {
      sqlResult = await sqlGenerator.generateSQL(query, dataSource, intentResult);
    }

    res.json({
      success: true,
      query,
      intent: intentResult,
      sql: sqlResult?.success ? {
        query: sqlResult.sql,
        explanation: sqlResult.explanation,
        optimizations: sqlResult.optimizations,
        estimated_complexity: sqlResult.complexity
      } : null,
      recommendations: intentResult.suggestions
    });

  } catch (error) {
    console.error('Error explaining query:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to explain query',
      details: error.message
    });
  }
});

module.exports = router;

// POST /api/ai/query/stream - Process natural language query with streaming response
router.post('/query/stream', authenticateToken, async (req, res) => {
  try {
    const { error, value } = streamQuerySchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.details[0].message
      });
    }

    const { query, dataSourceId, useCache, explain } = value;
    const organizationId = req.user.organization_id;
    const userId = req.user.id;

    // Verify data source access
    const dataSource = await DataSource.findOne({
      where: { 
        id: dataSourceId, 
        organization_id: organizationId 
      }
    });

    if (!dataSource) {
      return res.status(404).json({
        success: false,
        error: 'Data source not found or access denied'
      });
    }

    // Set up SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    });

    const streamId = `ai_query_${Date.now()}_${userId}`;
    const startTime = Date.now();

    // Send initial connection confirmation
    res.write(`data: ${JSON.stringify({
      type: 'connection',
      streamId: streamId,
      message: 'Connected to AI Query Stream'
    })}\n\n`);

    try {
      // Step 1: Intent Detection
      res.write(`data: ${JSON.stringify({
        type: 'progress',
        step: 'intent_detection',
        message: 'Analyzing query intent...',
        progress: 10
      })}\n\n`);

      const intentResult = await intentDetection.classifyQuery(query);
      
      if (intentResult.confidence < 0.3) {
        res.write(`data: ${JSON.stringify({
          type: 'error',
          step: 'intent_detection',
          message: 'Unable to understand the query. Please try rephrasing your question.',
          suggestions: intentResult.suggestions,
          intent: intentResult
        })}\n\n`);
        return res.end();
      }

      res.write(`data: ${JSON.stringify({
        type: 'progress',
        step: 'intent_detection',
        message: `Intent detected: ${intentResult.intent}`,
        progress: 20,
        data: { intent: intentResult }
      })}\n\n`);

      // Step 2: Check cache for similar queries if enabled
      let cachedResult = null;
      if (useCache) {
        res.write(`data: ${JSON.stringify({
          type: 'progress',
          step: 'cache_check',
          message: 'Checking query cache...',
          progress: 30
        })}\n\n`);

        const similarQueries = await queryManager.findSimilarQueries(
          query, 
          organizationId, 
          dataSourceId, 
          1
        );
        
        if (similarQueries.length > 0) {
          cachedResult = await queryManager.getCachedResult(similarQueries[0].id);
        }
      }

      if (cachedResult) {
        // Return cached result
        res.write(`data: ${JSON.stringify({
          type: 'progress',
          step: 'cache_hit',
          message: 'Found cached result',
          progress: 90
        })}\n\n`);

        const queryResult = {
          success: true,
          data: cachedResult.data,
          columns: cachedResult.columns,
          rowCount: cachedResult.data.length,
          executionTime: Date.now() - startTime,
          cached: true,
          cachedAt: cachedResult.cached_at,
          intent: intentResult,
          sql: null
        };

        res.write(`data: ${JSON.stringify({
          type: 'result',
          step: 'completed',
          message: 'Query completed successfully',
          progress: 100,
          data: queryResult
        })}\n\n`);

      } else {
        // Step 3: Generate SQL
        res.write(`data: ${JSON.stringify({
          type: 'progress',
          step: 'sql_generation',
          message: 'Generating SQL query...',
          progress: 40
        })}\n\n`);

        const sqlResult = await sqlGenerator.generateSQL(query, dataSource, intentResult);
        
        if (!sqlResult.success) {
          throw new Error(sqlResult.error);
        }

        res.write(`data: ${JSON.stringify({
          type: 'progress',
          step: 'sql_generation',
          message: 'SQL generated successfully',
          progress: 60,
          data: { 
            sql: explain ? sqlResult.sql : null,
            optimizations: sqlResult.optimizations
          }
        })}\n\n`);

        // Step 4: Execute SQL with streaming progress
        res.write(`data: ${JSON.stringify({
          type: 'progress',
          step: 'sql_execution',
          message: 'Executing SQL query...',
          progress: 70
        })}\n\n`);

        const executionResult = await sqlExecutor.executeQueryWithProgress(
          sqlResult.sql, 
          dataSource, 
          { 
            timeout: 120000, // 2 minutes for streaming queries
            onProgress: (progressData) => {
              res.write(`data: ${JSON.stringify({
                type: 'progress',
                step: 'sql_execution',
                message: progressData.message || 'Processing...',
                progress: 70 + (progressData.progress * 0.2), // 70-90%
                data: progressData
              })}\n\n`);
            }
          }
        );

        if (!executionResult.success) {
          throw new Error(executionResult.error);
        }

        const queryResult = {
          success: true,
          data: executionResult.data,
          columns: executionResult.columns,
          rowCount: executionResult.rowCount,
          executionTime: Date.now() - startTime,
          cached: false,
          intent: intentResult,
          sql: explain ? sqlResult.sql : null,
          optimizations: sqlResult.optimizations,
          dataSourceType: dataSource.type
        };

        res.write(`data: ${JSON.stringify({
          type: 'progress',
          step: 'saving_results',
          message: 'Saving query results...',
          progress: 95
        })}\n\n`);

        // Step 5: Save query and results
        const savedQuery = await queryManager.saveQuery({
          naturalLanguage: query,
          sql: sqlResult.sql,
          intent: intentResult.intent,
          confidence: intentResult.confidence,
          dataSourceId: dataSourceId,
          executionTime: queryResult.executionTime,
          rowCount: queryResult.rowCount,
          success: true,
          data: queryResult.data,
          columns: queryResult.columns,
          entities: intentResult.entities,
          timeframe: intentResult.timeframe,
          metrics: intentResult.metrics,
          dimensions: intentResult.dimensions,
          optimizations: queryResult.optimizations
        }, organizationId);

        queryResult.queryId = savedQuery.id;

        res.write(`data: ${JSON.stringify({
          type: 'result',
          step: 'completed',
          message: 'Query completed successfully',
          progress: 100,
          data: queryResult
        })}\n\n`);
      }

    } catch (executionError) {
      console.error('Streaming query execution error:', executionError);

      // Save failed query
      await queryManager.saveQuery({
        naturalLanguage: query,
        sql: null,
        intent: intentResult?.intent || 'unknown',
        confidence: intentResult?.confidence || 0,
        dataSourceId: dataSourceId,
        executionTime: Date.now() - startTime,
        rowCount: 0,
        success: false,
        error: executionError.message,
        entities: intentResult?.entities || {},
        timeframe: intentResult?.timeframe || null,
        metrics: intentResult?.metrics || [],
        dimensions: intentResult?.dimensions || [],
        dataSourceType: dataSource.type
      }, organizationId);

      res.write(`data: ${JSON.stringify({
        type: 'error',
        step: 'execution_failed',
        message: 'Failed to execute query',
        error: executionError.message,
        intent: intentResult,
        executionTime: Date.now() - startTime
      })}\n\n`);
    }

    res.end();

  } catch (error) {
    console.error('AI streaming query processing error:', error);
    
    res.write(`data: ${JSON.stringify({
      type: 'error',
      step: 'processing_failed',
      message: 'Internal server error',
      error: error.message
    })}\n\n`);
    
    res.end();
  }
});