const { Pool } = require('pg');
const cluster = require('cluster');
const os = require('os');
const Redis = require('redis');
const { performance } = require('perf_hooks');

class PerformanceOptimizationService {
  constructor(pool) {
    this.pool = pool || new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      max: 20, // Increased pool size
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
      statement_timeout: 30000,
      query_timeout: 30000
    });
    this.redisClient = null;
    this.performanceMetrics = new Map();
    this.optimizationStrategies = {
      caching: {
        enabled: true,
        ttl: 300, // 5 minutes
        maxSize: 1000
      },
      parallelProcessing: {
        enabled: true,
        maxWorkers: os.cpus().length,
        batchSize: 50
      },
      databaseOptimization: {
        connectionPooling: true,
        queryOptimization: true,
        indexOptimization: true
      },
      resourceManagement: {
        memoryThreshold: 0.8, // 80% memory usage threshold
        cpuThreshold: 0.9, // 90% CPU usage threshold
        autoScaling: true
      }
    };
    this.benchmarks = {
      baseline: {
        documentProcessing: 30000, // 30 seconds baseline
        formGeneration: 15000, // 15 seconds baseline
        approvalPrediction: 5000, // 5 seconds baseline
        appealGeneration: 20000 // 20 seconds baseline
      },
      target: {
        documentProcessing: 7500, // 75% faster = 7.5 seconds
        formGeneration: 3750, // 75% faster = 3.75 seconds
        approvalPrediction: 1250, // 75% faster = 1.25 seconds
        appealGeneration: 5000 // 75% faster = 5 seconds
      }
    };
    this.cache = new Map();
    this.workerPool = [];
  }

  async initialize() {
    try {

      // Initialize Redis for distributed caching
      if (process.env.REDIS_URL) {
        this.redisClient = Redis.createClient({
          url: process.env.REDIS_URL,
          retry_strategy: (options) => {
            if (options.error && options.error.code === 'ECONNREFUSED') {
              return new Error('Redis server connection refused');
            }
            if (options.total_retry_time > 1000 * 60 * 60) {
              return new Error('Redis retry time exhausted');
            }
            if (options.attempt > 10) {
              return undefined;
            }
            return Math.min(options.attempt * 100, 3000);
          }
        });
        await this.redisClient.connect();
      }

      await this.createTables();
      await this.setupDatabaseOptimizations();
      await this.initializeWorkerPool();
      await this.startPerformanceMonitoring();
      
      console.log('Performance Optimization Service initialized');
    } catch (error) {
      console.error('Failed to initialize Performance Optimization Service:', error);
      throw error;
    }
  }

  async createTables() {
    const queries = [
      `CREATE TABLE IF NOT EXISTS performance_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        operation_type VARCHAR(50) NOT NULL,
        operation_name VARCHAR(100) NOT NULL,
        execution_time DECIMAL(10,3) NOT NULL,
        memory_usage BIGINT,
        cpu_usage DECIMAL(5,2),
        cache_hit INTEGER DEFAULT 0,
        parallel_execution INTEGER DEFAULT 0,
        optimization_applied TEXT,
        input_size INTEGER,
        success INTEGER DEFAULT 1,
        error_message TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS optimization_configs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        config_name VARCHAR(100) NOT NULL UNIQUE,
        config_type VARCHAR(50) NOT NULL,
        parameters TEXT NOT NULL,
        is_active INTEGER DEFAULT 1,
        performance_impact DECIMAL(5,4),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS cache_statistics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cache_type VARCHAR(50) NOT NULL,
        cache_key VARCHAR(200) NOT NULL,
        hit_count INTEGER DEFAULT 0,
        miss_count INTEGER DEFAULT 0,
        last_accessed DATETIME DEFAULT CURRENT_TIMESTAMP,
        data_size INTEGER,
        ttl INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS performance_benchmarks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        benchmark_name VARCHAR(100) NOT NULL,
        operation_type VARCHAR(50) NOT NULL,
        baseline_time DECIMAL(10,3) NOT NULL,
        current_time DECIMAL(10,3) NOT NULL,
        improvement_percentage DECIMAL(5,2) NOT NULL,
        target_achieved INTEGER DEFAULT 0,
        test_conditions TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`
    ];

    for (const query of queries) {
      await this.pool.query(query);
    }

    // Create performance indexes
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_performance_metrics_operation ON performance_metrics(operation_type, operation_name)',
      'CREATE INDEX IF NOT EXISTS idx_performance_metrics_time ON performance_metrics(created_at)',
      'CREATE INDEX IF NOT EXISTS idx_cache_statistics_type_key ON cache_statistics(cache_type, cache_key)',
      'CREATE INDEX IF NOT EXISTS idx_performance_benchmarks_type ON performance_benchmarks(operation_type)'
    ];

    for (const index of indexes) {
      await this.pool.query(index);
    }
  }

  async setupDatabaseOptimizations() {
    // Optimize database settings for performance
    const optimizations = [
      'SET work_mem = \'256MB\'',
      'SET shared_buffers = \'512MB\'',
      'SET effective_cache_size = \'2GB\'',
      'SET random_page_cost = 1.1',
      'SET checkpoint_completion_target = 0.9'
    ];

    for (const optimization of optimizations) {
      try {
        await this.pool.query(optimization);
      } catch (error) {
        console.warn(`Database optimization failed: ${optimization}`, error.message);
      }
    }

    // Create materialized views for common queries
    const materializedViews = [
      `CREATE MATERIALIZED VIEW IF NOT EXISTS mv_payer_performance AS
       SELECT 
         payer_name,
         COUNT(*) as total_submissions,
         AVG(EXTRACT(EPOCH FROM (decision_date - submitted_at))/3600) as avg_turnaround_hours,
         COUNT(CASE WHEN status = 'approved' THEN 1 END)::DECIMAL / COUNT(*) as approval_rate
       FROM authorizations 
       WHERE created_at >= NOW() - INTERVAL '90 days'
       GROUP BY payer_name`,
      
      `CREATE MATERIALIZED VIEW IF NOT EXISTS mv_processing_stats AS
       SELECT 
         DATE_TRUNC('hour', created_at) as hour,
         COUNT(*) as submissions_count,
         AVG(processing_time) as avg_processing_time
       FROM ai_processing_jobs 
       WHERE created_at >= NOW() - INTERVAL '7 days'
       GROUP BY DATE_TRUNC('hour', created_at)`
    ];

    for (const view of materializedViews) {
      try {
        await this.pool.query(view);
      } catch (error) {
        console.warn('Materialized view creation failed:', error.message);
      }
    }
  }

  async initializeWorkerPool() {
    if (this.optimizationStrategies.parallelProcessing.enabled && cluster.isMaster) {
      const numWorkers = Math.min(
        this.optimizationStrategies.parallelProcessing.maxWorkers,
        os.cpus().length
      );

      for (let i = 0; i < numWorkers; i++) {
        const worker = cluster.fork();
        this.workerPool.push(worker);
      }

      cluster.on('exit', (worker, code, signal) => {
        console.log(`Worker ${worker.process.pid} died. Restarting...`);
        const newWorker = cluster.fork();
        const index = this.workerPool.indexOf(worker);
        if (index > -1) {
          this.workerPool[index] = newWorker;
        }
      });
    }
  }

  async optimizeOperation(operationType, operationName, operationFn, inputData = {}) {
    const startTime = performance.now();
    const startMemory = process.memoryUsage();
    
    let result = null;
    let cacheHit = false;
    let parallelExecution = false;
    let optimizationsApplied = [];
    let success = true;
    let errorMessage = null;

    try {
      // Check cache first
      const cacheKey = this.generateCacheKey(operationType, operationName, inputData);
      const cachedResult = await this.getFromCache(cacheKey);
      
      if (cachedResult) {
        result = cachedResult;
        cacheHit = true;
        optimizationsApplied.push('cache_hit');
      } else {
        // Apply optimization strategies
        if (this.shouldUseParallelProcessing(operationType, inputData)) {
          result = await this.executeInParallel(operationFn, inputData);
          parallelExecution = true;
          optimizationsApplied.push('parallel_processing');
        } else {
          result = await operationFn(inputData);
        }
        
        // Cache the result
        await this.setCache(cacheKey, result, this.optimizationStrategies.caching.ttl);
        optimizationsApplied.push('caching');
      }
      
    } catch (error) {
      success = false;
      errorMessage = error.message;
      console.error(`Operation ${operationType}:${operationName} failed:`, error);
      throw error;
    } finally {
      // Record performance metrics
      const endTime = performance.now();
      const endMemory = process.memoryUsage();
      const executionTime = endTime - startTime;
      const memoryUsage = endMemory.heapUsed - startMemory.heapUsed;
      
      await this.recordPerformanceMetric({
        operationType,
        operationName,
        executionTime,
        memoryUsage,
        cacheHit,
        parallelExecution,
        optimizationsApplied,
        inputSize: JSON.stringify(inputData).length,
        success,
        errorMessage
      });
      
      // Check if benchmark is achieved
      await this.checkBenchmark(operationType, executionTime);
    }
    
    return result;
  }

  generateCacheKey(operationType, operationName, inputData) {
    const sanitizedInput = this.sanitizeForCaching(inputData);
    const inputHash = require('crypto')
      .createHash('md5')
      .update(JSON.stringify(sanitizedInput))
      .digest('hex');
    return `${operationType}:${operationName}:${inputHash}`;
  }

  sanitizeForCaching(data) {
    // Remove sensitive or non-cacheable data
    const sanitized = { ...data };
    const sensitiveFields = ['ssn', 'patient_id', 'member_id', 'phone', 'email', 'address'];
    
    for (const field of sensitiveFields) {
      if (sanitized[field]) {
        delete sanitized[field];
      }
    }
    
    // Remove timestamps that would make caching ineffective
    delete sanitized.timestamp;
    delete sanitized.created_at;
    delete sanitized.updated_at;
    
    return sanitized;
  }

  async getFromCache(key) {
    try {
      // Try Redis first
      if (this.redisClient) {
        const cached = await this.redisClient.get(key);
        if (cached) {
          await this.updateCacheStatistics(key, 'hit');
          return JSON.parse(cached);
        }
      }
      
      // Fallback to local cache
      if (this.cache.has(key)) {
        const cached = this.cache.get(key);
        if (cached.expiry > Date.now()) {
          await this.updateCacheStatistics(key, 'hit');
          return cached.data;
        } else {
          this.cache.delete(key);
        }
      }
      
      await this.updateCacheStatistics(key, 'miss');
      return null;
    } catch (error) {
      console.error('Cache retrieval error:', error);
      return null;
    }
  }

  async setCache(key, data, ttlSeconds) {
    try {
      const serializedData = JSON.stringify(data);
      
      // Store in Redis
      if (this.redisClient) {
        await this.redisClient.setEx(key, ttlSeconds, serializedData);
      }
      
      // Store in local cache as backup
      this.cache.set(key, {
        data,
        expiry: Date.now() + (ttlSeconds * 1000)
      });
      
      // Manage cache size
      if (this.cache.size > this.optimizationStrategies.caching.maxSize) {
        const oldestKey = this.cache.keys().next().value;
        this.cache.delete(oldestKey);
      }
      
    } catch (error) {
      console.error('Cache storage error:', error);
    }
  }

  shouldUseParallelProcessing(operationType, inputData) {
    if (!this.optimizationStrategies.parallelProcessing.enabled) {
      return false;
    }
    
    // Determine if operation benefits from parallel processing
    const parallelBeneficialOperations = [
      'document_processing',
      'batch_form_generation',
      'bulk_approval_prediction',
      'multiple_appeal_generation'
    ];
    
    if (!parallelBeneficialOperations.includes(operationType)) {
      return false;
    }
    
    // Check if input data is suitable for parallel processing
    const inputSize = Array.isArray(inputData.items) ? inputData.items.length : 1;
    return inputSize >= this.optimizationStrategies.parallelProcessing.batchSize;
  }

  async executeInParallel(operationFn, inputData) {
    const items = inputData.items || [inputData];
    const batchSize = this.optimizationStrategies.parallelProcessing.batchSize;
    const batches = [];
    
    // Split into batches
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    
    // Process batches in parallel
    const promises = batches.map(batch => 
      Promise.all(batch.map(item => operationFn(item)))
    );
    
    const results = await Promise.all(promises);
    return results.flat();
  }

  async recordPerformanceMetric(metrics) {
    try {
      await this.pool.query(
        `INSERT INTO performance_metrics 
         (operation_type, operation_name, execution_time, memory_usage, cpu_usage, 
          cache_hit, parallel_execution, optimization_applied, input_size, success, error_message) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          metrics.operationType,
          metrics.operationName,
          metrics.executionTime,
          metrics.memoryUsage,
          process.cpuUsage().user / 1000000, // Convert to seconds
          metrics.cacheHit,
          metrics.parallelExecution,
          JSON.stringify(metrics.optimizationsApplied),
          metrics.inputSize,
          metrics.success,
          metrics.errorMessage
        ]
      );
      
      // Update in-memory metrics for quick access
      const key = `${metrics.operationType}:${metrics.operationName}`;
      if (!this.performanceMetrics.has(key)) {
        this.performanceMetrics.set(key, {
          totalExecutions: 0,
          totalTime: 0,
          averageTime: 0,
          cacheHitRate: 0,
          successRate: 0
        });
      }
      
      const existing = this.performanceMetrics.get(key);
      existing.totalExecutions++;
      existing.totalTime += metrics.executionTime;
      existing.averageTime = existing.totalTime / existing.totalExecutions;
      existing.cacheHitRate = (existing.cacheHitRate * (existing.totalExecutions - 1) + (metrics.cacheHit ? 1 : 0)) / existing.totalExecutions;
      existing.successRate = (existing.successRate * (existing.totalExecutions - 1) + (metrics.success ? 1 : 0)) / existing.totalExecutions;
      
    } catch (error) {
      console.error('Error recording performance metric:', error);
    }
  }

  async updateCacheStatistics(key, type) {
    try {
      const cacheType = key.split(':')[0];
      
      await this.pool.query(
        `INSERT INTO cache_statistics (cache_type, cache_key, hit_count, miss_count, last_accessed) 
         VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP) 
         ON CONFLICT (cache_type, cache_key) 
         DO UPDATE SET 
           hit_count = cache_statistics.hit_count + $3,
           miss_count = cache_statistics.miss_count + $4,
           last_accessed = CURRENT_TIMESTAMP`,
        [cacheType, key, type === 'hit' ? 1 : 0, type === 'miss' ? 1 : 0]
      );
    } catch (error) {
      console.error('Error updating cache statistics:', error);
    }
  }

  async checkBenchmark(operationType, executionTime) {
    const baseline = this.benchmarks.baseline[operationType];
    const target = this.benchmarks.target[operationType];
    
    if (baseline && target) {
      const improvementPercentage = ((baseline - executionTime) / baseline) * 100;
      const targetAchieved = executionTime <= target;
      
      await this.pool.query(
        `INSERT INTO performance_benchmarks 
         (benchmark_name, operation_type, baseline_time, current_time, improvement_percentage, target_achieved) 
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          `${operationType}_benchmark`,
          operationType,
          baseline,
          executionTime,
          improvementPercentage,
          targetAchieved
        ]
      );
      
      if (targetAchieved) {
        console.log(`🎯 Benchmark achieved for ${operationType}: ${executionTime}ms (target: ${target}ms)`);
      } else if (improvementPercentage > 0) {
        console.log(`📈 Performance improved for ${operationType}: ${improvementPercentage.toFixed(2)}% faster`);
      }
    }
  }

  async getPerformanceReport() {
    try {
      const report = {
        summary: {},
        benchmarks: {},
        cachePerformance: {},
        optimizationImpact: {},
        recommendations: []
      };
      
      // Get summary metrics
      const summaryQuery = `
        SELECT 
          operation_type,
          COUNT(*) as total_operations,
          AVG(execution_time) as avg_execution_time,
          MIN(execution_time) as min_execution_time,
          MAX(execution_time) as max_execution_time,
          AVG(CASE WHEN cache_hit THEN 1.0 ELSE 0.0 END) as cache_hit_rate,
          AVG(CASE WHEN success THEN 1.0 ELSE 0.0 END) as success_rate
        FROM performance_metrics 
        WHERE created_at >= NOW() - INTERVAL '24 hours'
        GROUP BY operation_type
      `;
      
      const summaryResult = await this.pool.query(summaryQuery);
      report.summary = summaryResult.rows;
      
      // Get benchmark status
      const benchmarkQuery = `
        SELECT 
          operation_type,
          AVG(improvement_percentage) as avg_improvement,
          COUNT(CASE WHEN target_achieved THEN 1 END) as targets_achieved,
          COUNT(*) as total_benchmarks
        FROM performance_benchmarks 
        WHERE created_at >= NOW() - INTERVAL '24 hours'
        GROUP BY operation_type
      `;
      
      const benchmarkResult = await this.pool.query(benchmarkQuery);
      report.benchmarks = benchmarkResult.rows;
      
      // Get cache performance
      const cacheQuery = `
        SELECT 
          cache_type,
          SUM(hit_count) as total_hits,
          SUM(miss_count) as total_misses,
          SUM(hit_count)::DECIMAL / NULLIF(SUM(hit_count + miss_count), 0) as hit_rate
        FROM cache_statistics 
        GROUP BY cache_type
      `;
      
      const cacheResult = await this.pool.query(cacheQuery);
      report.cachePerformance = cacheResult.rows;
      
      // Generate recommendations
      report.recommendations = await this.generateOptimizationRecommendations(report);
      
      return report;
    } catch (error) {
      console.error('Error generating performance report:', error);
      throw error;
    }
  }

  async generateOptimizationRecommendations(report) {
    const recommendations = [];
    
    // Analyze cache performance
    for (const cache of report.cachePerformance) {
      if (cache.hit_rate < 0.7) {
        recommendations.push({
          type: 'cache_optimization',
          priority: 'high',
          description: `Cache hit rate for ${cache.cache_type} is low (${(cache.hit_rate * 100).toFixed(1)}%)`,
          actions: [
            'Increase cache TTL',
            'Optimize cache key generation',
            'Consider cache warming strategies'
          ]
        });
      }
    }
    
    // Analyze execution times
    for (const summary of report.summary) {
      const baseline = this.benchmarks.baseline[summary.operation_type];
      const target = this.benchmarks.target[summary.operation_type];
      
      if (baseline && summary.avg_execution_time > target) {
        const gap = ((summary.avg_execution_time - target) / target * 100).toFixed(1);
        recommendations.push({
          type: 'performance_optimization',
          priority: 'medium',
          description: `${summary.operation_type} is ${gap}% slower than target`,
          actions: [
            'Enable parallel processing',
            'Optimize database queries',
            'Consider algorithm improvements'
          ]
        });
      }
    }
    
    // Analyze success rates
    for (const summary of report.summary) {
      if (summary.success_rate < 0.95) {
        recommendations.push({
          type: 'reliability_improvement',
          priority: 'high',
          description: `${summary.operation_type} has low success rate (${(summary.success_rate * 100).toFixed(1)}%)`,
          actions: [
            'Investigate error patterns',
            'Implement better error handling',
            'Add retry mechanisms'
          ]
        });
      }
    }
    
    return recommendations;
  }

  async startPerformanceMonitoring() {
    // Monitor system resources every 30 seconds
    setInterval(async () => {
      try {
        const memoryUsage = process.memoryUsage();
        const cpuUsage = process.cpuUsage();
        
        // Check memory threshold
        const memoryPercentage = memoryUsage.heapUsed / memoryUsage.heapTotal;
        if (memoryPercentage > this.optimizationStrategies.resourceManagement.memoryThreshold) {
          console.warn(`High memory usage detected: ${(memoryPercentage * 100).toFixed(1)}%`);
          await this.triggerGarbageCollection();
        }
        
        // Update materialized views periodically
        if (Date.now() % (5 * 60 * 1000) === 0) { // Every 5 minutes
          await this.refreshMaterializedViews();
        }
        
      } catch (error) {
        console.error('Performance monitoring error:', error);
      }
    }, 30000);
  }

  async triggerGarbageCollection() {
    if (global.gc) {
      global.gc();
      console.log('Garbage collection triggered');
    }
    
    // Clear old cache entries
    const now = Date.now();
    for (const [key, value] of this.cache.entries()) {
      if (value.expiry < now) {
        this.cache.delete(key);
      }
    }
  }

  async refreshMaterializedViews() {
    const views = ['mv_payer_performance', 'mv_processing_stats'];
    
    for (const view of views) {
      try {
        await this.pool.query(`REFRESH MATERIALIZED VIEW ${view}`);
      } catch (error) {
        console.error(`Error refreshing materialized view ${view}:`, error);
      }
    }
  }

  async getOptimizationStatus() {
    return {
      strategies: this.optimizationStrategies,
      benchmarks: this.benchmarks,
      cacheSize: this.cache.size,
      workerPoolSize: this.workerPool.length,
      redisConnected: this.redisClient ? this.redisClient.isReady : false,
      performanceMetrics: Object.fromEntries(this.performanceMetrics)
    };
  }

  async shutdown() {
    // Close Redis connection
    if (this.redisClient) {
      await this.redisClient.quit();
    }
    
    // Close database pool
    if (this.pool) {
      await this.pool.end();
    }
    
    // Terminate worker processes
    for (const worker of this.workerPool) {
      worker.kill();
    }
    
    // Clear caches
    this.cache.clear();
    this.performanceMetrics.clear();
  }
}

module.exports = PerformanceOptimizationService;