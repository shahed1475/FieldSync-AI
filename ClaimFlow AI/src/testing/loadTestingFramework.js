const axios = require('axios');
const { performance } = require('perf_hooks');
const fs = require('fs').promises;
const path = require('path');
const { Pool } = require('pg');
const cluster = require('cluster');
const os = require('os');

class LoadTestingFramework {
  constructor(config = {}) {
    this.config = {
      baseUrl: config.baseUrl || 'http://localhost:3000',
      maxConcurrentUsers: config.maxConcurrentUsers || 100,
      testDuration: config.testDuration || 300000, // 5 minutes
      rampUpTime: config.rampUpTime || 60000, // 1 minute
      targetThroughput: config.targetThroughput || 10000, // 10k authorizations/month
      ...config
    };
    
    this.pool = null;
    this.testResults = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      minResponseTime: Infinity,
      maxResponseTime: 0,
      throughput: 0,
      errorRate: 0,
      responseTimePercentiles: {},
      errors: [],
      resourceUsage: [],
      performanceMetrics: []
    };
    
    this.testScenarios = {
      documentProcessing: {
        endpoint: '/api/ai/process-document',
        method: 'POST',
        weight: 30, // 30% of traffic
        payload: this.generateDocumentPayload
      },
      formSubmission: {
        endpoint: '/api/authorizations',
        method: 'POST',
        weight: 25, // 25% of traffic
        payload: this.generateAuthorizationPayload
      },
      approvalPrediction: {
        endpoint: '/api/ai/predict-approval',
        method: 'POST',
        weight: 20, // 20% of traffic
        payload: this.generatePredictionPayload
      },
      appealGeneration: {
        endpoint: '/api/ai/generate-appeal',
        method: 'POST',
        weight: 15, // 15% of traffic
        payload: this.generateAppealPayload
      },
      statusCheck: {
        endpoint: '/api/authorizations/status',
        method: 'GET',
        weight: 10, // 10% of traffic
        payload: this.generateStatusPayload
      }
    };
    
    this.performanceThresholds = {
      responseTime: {
        p50: 2000, // 2 seconds
        p95: 5000, // 5 seconds
        p99: 10000 // 10 seconds
      },
      throughput: {
        minimum: 10000 / (30 * 24 * 60), // 10k/month = ~23 requests/minute
        target: 15000 / (30 * 24 * 60) // 15k/month = ~35 requests/minute
      },
      errorRate: {
        maximum: 0.01 // 1% error rate
      },
      resourceUsage: {
        cpu: 80, // 80% CPU usage
        memory: 85, // 85% memory usage
        database: 90 // 90% database connections
      }
    };
    
    this.workers = [];
    this.isRunning = false;
    this.startTime = null;
  }

  async initialize() {
    try {
      // Initialize database connection for monitoring
      this.pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
      });

      await this.createTestTables();
      await this.validateTestEnvironment();
      
      console.log('Load Testing Framework initialized');
    } catch (error) {
      console.error('Failed to initialize Load Testing Framework:', error);
      throw error;
    }
  }

  async createTestTables() {
    const queries = [
      `CREATE TABLE IF NOT EXISTS load_test_results (
        id SERIAL PRIMARY KEY,
        test_name VARCHAR(100) NOT NULL,
        test_type VARCHAR(50) NOT NULL,
        start_time TIMESTAMP NOT NULL,
        end_time TIMESTAMP,
        duration_ms INTEGER,
        total_requests INTEGER DEFAULT 0,
        successful_requests INTEGER DEFAULT 0,
        failed_requests INTEGER DEFAULT 0,
        average_response_time DECIMAL(10,3),
        min_response_time DECIMAL(10,3),
        max_response_time DECIMAL(10,3),
        throughput DECIMAL(10,3),
        error_rate DECIMAL(5,4),
        p50_response_time DECIMAL(10,3),
        p95_response_time DECIMAL(10,3),
        p99_response_time DECIMAL(10,3),
        max_concurrent_users INTEGER,
        test_config JSONB,
        performance_thresholds_met BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS load_test_requests (
        id SERIAL PRIMARY KEY,
        test_id INTEGER REFERENCES load_test_results(id),
        request_id VARCHAR(50) NOT NULL,
        scenario_name VARCHAR(50) NOT NULL,
        endpoint VARCHAR(200) NOT NULL,
        method VARCHAR(10) NOT NULL,
        start_time TIMESTAMP NOT NULL,
        end_time TIMESTAMP,
        response_time DECIMAL(10,3),
        status_code INTEGER,
        success BOOLEAN DEFAULT false,
        error_message TEXT,
        request_size INTEGER,
        response_size INTEGER,
        worker_id INTEGER
      )`,
      `CREATE TABLE IF NOT EXISTS load_test_metrics (
        id SERIAL PRIMARY KEY,
        test_id INTEGER REFERENCES load_test_results(id),
        timestamp TIMESTAMP NOT NULL,
        cpu_usage DECIMAL(5,2),
        memory_usage BIGINT,
        memory_percentage DECIMAL(5,2),
        active_connections INTEGER,
        database_connections INTEGER,
        requests_per_second DECIMAL(10,3),
        errors_per_second DECIMAL(10,3),
        average_response_time DECIMAL(10,3)
      )`
    ];

    for (const query of queries) {
      await this.pool.query(query);
    }
  }

  async validateTestEnvironment() {
    try {
      // Check if the application is running
      const healthCheck = await axios.get(`${this.config.baseUrl}/health`, {
        timeout: 5000
      });
      
      if (healthCheck.status !== 200) {
        throw new Error('Application health check failed');
      }
      
      // Check database connectivity
      await this.pool.query('SELECT 1');
      
      // Verify required endpoints exist
      const endpoints = Object.values(this.testScenarios).map(scenario => scenario.endpoint);
      for (const endpoint of endpoints) {
        try {
          await axios.options(`${this.config.baseUrl}${endpoint}`, {
            timeout: 2000
          });
        } catch (error) {
          console.warn(`Endpoint ${endpoint} may not be available:`, error.message);
        }
      }
      
      console.log('✅ Test environment validation passed');
    } catch (error) {
      console.error('❌ Test environment validation failed:', error);
      throw error;
    }
  }

  async runLoadTest(testName = 'default_load_test', testType = 'capacity') {
    if (this.isRunning) {
      throw new Error('Load test is already running');
    }

    this.isRunning = true;
    this.startTime = new Date();
    
    console.log(`🚀 Starting load test: ${testName}`);
    console.log(`📊 Configuration:`);
    console.log(`   - Max Concurrent Users: ${this.config.maxConcurrentUsers}`);
    console.log(`   - Test Duration: ${this.config.testDuration / 1000}s`);
    console.log(`   - Ramp-up Time: ${this.config.rampUpTime / 1000}s`);
    console.log(`   - Target Throughput: ${this.config.targetThroughput}/month`);

    try {
      // Create test record
      const testResult = await this.pool.query(
        `INSERT INTO load_test_results 
         (test_name, test_type, start_time, max_concurrent_users, test_config) 
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [
          testName,
          testType,
          this.startTime,
          this.config.maxConcurrentUsers,
          JSON.stringify(this.config)
        ]
      );
      
      const testId = testResult.rows[0].id;
      
      // Start resource monitoring
      const monitoringInterval = this.startResourceMonitoring(testId);
      
      // Run the load test
      await this.executeLoadTest(testId);
      
      // Stop monitoring
      clearInterval(monitoringInterval);
      
      // Calculate final results
      await this.calculateFinalResults(testId);
      
      // Generate report
      const report = await this.generateTestReport(testId);
      
      // Save report to file
      await this.saveTestReport(testName, report);
      
      console.log(`✅ Load test completed: ${testName}`);
      return report;
      
    } catch (error) {
      console.error(`❌ Load test failed: ${testName}`, error);
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  async executeLoadTest(testId) {
    const { maxConcurrentUsers, testDuration, rampUpTime } = this.config;
    const rampUpStep = maxConcurrentUsers / (rampUpTime / 1000); // Users per second
    
    let currentUsers = 0;
    let activeWorkers = [];
    
    const testEndTime = Date.now() + testDuration;
    const rampUpEndTime = Date.now() + rampUpTime;
    
    // Ramp-up phase
    console.log('📈 Ramp-up phase started');
    while (Date.now() < rampUpEndTime && currentUsers < maxConcurrentUsers) {
      const usersToAdd = Math.min(
        Math.ceil(rampUpStep),
        maxConcurrentUsers - currentUsers
      );
      
      for (let i = 0; i < usersToAdd; i++) {
        const worker = this.createVirtualUser(testId, currentUsers + i);
        activeWorkers.push(worker);
      }
      
      currentUsers += usersToAdd;
      console.log(`👥 Active users: ${currentUsers}/${maxConcurrentUsers}`);
      
      await this.sleep(1000); // Wait 1 second
    }
    
    console.log('🔥 Full load phase started');
    
    // Wait for test duration to complete
    while (Date.now() < testEndTime) {
      await this.sleep(5000); // Check every 5 seconds
      
      // Log progress
      const elapsed = Date.now() - this.startTime.getTime();
      const remaining = testEndTime - Date.now();
      console.log(`⏱️  Elapsed: ${Math.floor(elapsed / 1000)}s, Remaining: ${Math.floor(remaining / 1000)}s`);
    }
    
    console.log('🛑 Stopping virtual users...');
    
    // Stop all workers
    for (const worker of activeWorkers) {
      worker.stop = true;
    }
    
    // Wait for workers to finish current requests
    await Promise.allSettled(activeWorkers.map(worker => worker.promise));
    
    console.log('✅ All virtual users stopped');
  }

  createVirtualUser(testId, userId) {
    const worker = {
      id: userId,
      stop: false,
      promise: null
    };
    
    worker.promise = this.runVirtualUser(testId, userId, worker);
    return worker;
  }

  async runVirtualUser(testId, userId, worker) {
    while (!worker.stop) {
      try {
        // Select random scenario based on weights
        const scenario = this.selectScenario();
        
        // Generate request
        const requestId = `${testId}-${userId}-${Date.now()}`;
        const payload = scenario.payload();
        
        // Execute request
        await this.executeRequest(testId, requestId, scenario, payload, userId);
        
        // Random think time between requests (1-5 seconds)
        const thinkTime = Math.random() * 4000 + 1000;
        await this.sleep(thinkTime);
        
      } catch (error) {
        console.error(`Virtual user ${userId} error:`, error.message);
        await this.sleep(5000); // Wait before retrying
      }
    }
  }

  selectScenario() {
    const scenarios = Object.entries(this.testScenarios);
    const totalWeight = scenarios.reduce((sum, [, scenario]) => sum + scenario.weight, 0);
    
    let random = Math.random() * totalWeight;
    
    for (const [name, scenario] of scenarios) {
      random -= scenario.weight;
      if (random <= 0) {
        return { name, ...scenario };
      }
    }
    
    // Fallback to first scenario
    return { name: scenarios[0][0], ...scenarios[0][1] };
  }

  async executeRequest(testId, requestId, scenario, payload, workerId) {
    const startTime = performance.now();
    const timestamp = new Date();
    
    let success = false;
    let statusCode = 0;
    let errorMessage = null;
    let responseSize = 0;
    
    try {
      const config = {
        method: scenario.method,
        url: `${this.config.baseUrl}${scenario.endpoint}`,
        timeout: 30000,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': `LoadTest-Worker-${workerId}`
        }
      };
      
      if (scenario.method !== 'GET' && payload) {
        config.data = payload;
      } else if (scenario.method === 'GET' && payload) {
        config.params = payload;
      }
      
      const response = await axios(config);
      
      success = response.status >= 200 && response.status < 300;
      statusCode = response.status;
      responseSize = JSON.stringify(response.data).length;
      
      this.testResults.successfulRequests++;
      
    } catch (error) {
      success = false;
      statusCode = error.response ? error.response.status : 0;
      errorMessage = error.message;
      
      this.testResults.failedRequests++;
      this.testResults.errors.push({
        timestamp,
        scenario: scenario.name,
        error: errorMessage,
        statusCode
      });
    }
    
    const endTime = performance.now();
    const responseTime = endTime - startTime;
    
    // Update test results
    this.testResults.totalRequests++;
    this.testResults.minResponseTime = Math.min(this.testResults.minResponseTime, responseTime);
    this.testResults.maxResponseTime = Math.max(this.testResults.maxResponseTime, responseTime);
    
    // Record request in database
    await this.pool.query(
      `INSERT INTO load_test_requests 
       (test_id, request_id, scenario_name, endpoint, method, start_time, end_time, 
        response_time, status_code, success, error_message, request_size, response_size, worker_id) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [
        testId,
        requestId,
        scenario.name,
        scenario.endpoint,
        scenario.method,
        timestamp,
        new Date(endTime),
        responseTime,
        statusCode,
        success,
        errorMessage,
        payload ? JSON.stringify(payload).length : 0,
        responseSize,
        workerId
      ]
    );
  }

  startResourceMonitoring(testId) {
    return setInterval(async () => {
      try {
        const memoryUsage = process.memoryUsage();
        const cpuUsage = process.cpuUsage();
        
        // Get database connection count
        const dbStats = await this.pool.query(
          'SELECT count(*) as active_connections FROM pg_stat_activity WHERE state = \'active\''
        );
        
        // Calculate metrics
        const memoryPercentage = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;
        const cpuPercentage = (cpuUsage.user + cpuUsage.system) / 1000000; // Convert to seconds
        
        // Calculate current RPS
        const now = Date.now();
        const elapsed = (now - this.startTime.getTime()) / 1000;
        const requestsPerSecond = elapsed > 0 ? this.testResults.totalRequests / elapsed : 0;
        const errorsPerSecond = elapsed > 0 ? this.testResults.failedRequests / elapsed : 0;
        
        // Record metrics
        await this.pool.query(
          `INSERT INTO load_test_metrics 
           (test_id, timestamp, cpu_usage, memory_usage, memory_percentage, 
            active_connections, database_connections, requests_per_second, 
            errors_per_second, average_response_time) 
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            testId,
            new Date(),
            cpuPercentage,
            memoryUsage.heapUsed,
            memoryPercentage,
            this.testResults.totalRequests - this.testResults.successfulRequests - this.testResults.failedRequests,
            dbStats.rows[0].active_connections,
            requestsPerSecond,
            errorsPerSecond,
            this.testResults.totalRequests > 0 ? this.testResults.averageResponseTime : 0
          ]
        );
        
        // Log current status
        console.log(`📊 RPS: ${requestsPerSecond.toFixed(2)}, Errors: ${errorsPerSecond.toFixed(2)}, Memory: ${memoryPercentage.toFixed(1)}%`);
        
      } catch (error) {
        console.error('Resource monitoring error:', error);
      }
    }, 5000); // Every 5 seconds
  }

  async calculateFinalResults(testId) {
    // Get all request data
    const requestsResult = await this.pool.query(
      'SELECT response_time FROM load_test_requests WHERE test_id = $1 AND success = true ORDER BY response_time',
      [testId]
    );
    
    const responseTimes = requestsResult.rows.map(row => parseFloat(row.response_time));
    
    if (responseTimes.length > 0) {
      // Calculate percentiles
      const p50Index = Math.floor(responseTimes.length * 0.5);
      const p95Index = Math.floor(responseTimes.length * 0.95);
      const p99Index = Math.floor(responseTimes.length * 0.99);
      
      this.testResults.responseTimePercentiles = {
        p50: responseTimes[p50Index],
        p95: responseTimes[p95Index],
        p99: responseTimes[p99Index]
      };
      
      // Calculate average response time
      this.testResults.averageResponseTime = responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length;
    }
    
    // Calculate throughput and error rate
    const testDuration = (Date.now() - this.startTime.getTime()) / 1000; // seconds
    this.testResults.throughput = this.testResults.totalRequests / testDuration;
    this.testResults.errorRate = this.testResults.totalRequests > 0 ? 
      this.testResults.failedRequests / this.testResults.totalRequests : 0;
    
    // Update database with final results
    await this.pool.query(
      `UPDATE load_test_results SET 
       end_time = $2, duration_ms = $3, total_requests = $4, successful_requests = $5, 
       failed_requests = $6, average_response_time = $7, min_response_time = $8, 
       max_response_time = $9, throughput = $10, error_rate = $11, 
       p50_response_time = $12, p95_response_time = $13, p99_response_time = $14,
       performance_thresholds_met = $15
       WHERE id = $1`,
      [
        testId,
        new Date(),
        testDuration * 1000,
        this.testResults.successfulRequests,
        this.testResults.failedRequests,
        this.testResults.averageResponseTime,
        this.testResults.minResponseTime === Infinity ? 0 : this.testResults.minResponseTime,
        this.testResults.maxResponseTime,
        this.testResults.throughput,
        this.testResults.errorRate,
        this.testResults.responseTimePercentiles.p50 || 0,
        this.testResults.responseTimePercentiles.p95 || 0,
        this.testResults.responseTimePercentiles.p99 || 0,
        this.checkPerformanceThresholds()
      ]
    );
  }

  checkPerformanceThresholds() {
    const thresholds = this.performanceThresholds;
    
    const responseTimeOk = 
      (this.testResults.responseTimePercentiles.p50 || 0) <= thresholds.responseTime.p50 &&
      (this.testResults.responseTimePercentiles.p95 || 0) <= thresholds.responseTime.p95 &&
      (this.testResults.responseTimePercentiles.p99 || 0) <= thresholds.responseTime.p99;
    
    const throughputOk = this.testResults.throughput >= thresholds.throughput.minimum;
    const errorRateOk = this.testResults.errorRate <= thresholds.errorRate.maximum;
    
    return responseTimeOk && throughputOk && errorRateOk;
  }

  async generateTestReport(testId) {
    const testResult = await this.pool.query(
      'SELECT * FROM load_test_results WHERE id = $1',
      [testId]
    );
    
    const test = testResult.rows[0];
    const thresholdsMet = this.checkPerformanceThresholds();
    
    const report = {
      testInfo: {
        id: testId,
        name: test.test_name,
        type: test.test_type,
        startTime: test.start_time,
        endTime: test.end_time,
        duration: test.duration_ms,
        maxConcurrentUsers: test.max_concurrent_users
      },
      performance: {
        totalRequests: test.total_requests,
        successfulRequests: test.successful_requests,
        failedRequests: test.failed_requests,
        throughput: test.throughput,
        errorRate: test.error_rate,
        responseTime: {
          average: test.average_response_time,
          min: test.min_response_time,
          max: test.max_response_time,
          p50: test.p50_response_time,
          p95: test.p95_response_time,
          p99: test.p99_response_time
        }
      },
      thresholds: {
        met: thresholdsMet,
        details: this.performanceThresholds,
        results: {
          responseTime: {
            p50: {
              actual: test.p50_response_time,
              threshold: this.performanceThresholds.responseTime.p50,
              passed: test.p50_response_time <= this.performanceThresholds.responseTime.p50
            },
            p95: {
              actual: test.p95_response_time,
              threshold: this.performanceThresholds.responseTime.p95,
              passed: test.p95_response_time <= this.performanceThresholds.responseTime.p95
            },
            p99: {
              actual: test.p99_response_time,
              threshold: this.performanceThresholds.responseTime.p99,
              passed: test.p99_response_time <= this.performanceThresholds.responseTime.p99
            }
          },
          throughput: {
            actual: test.throughput,
            minimum: this.performanceThresholds.throughput.minimum,
            target: this.performanceThresholds.throughput.target,
            passed: test.throughput >= this.performanceThresholds.throughput.minimum
          },
          errorRate: {
            actual: test.error_rate,
            maximum: this.performanceThresholds.errorRate.maximum,
            passed: test.error_rate <= this.performanceThresholds.errorRate.maximum
          }
        }
      },
      scenarios: await this.getScenarioBreakdown(testId),
      errors: this.testResults.errors.slice(0, 50), // Top 50 errors
      recommendations: this.generateRecommendations(test, thresholdsMet)
    };
    
    return report;
  }

  async getScenarioBreakdown(testId) {
    const scenarioStats = await this.pool.query(
      `SELECT 
         scenario_name,
         COUNT(*) as total_requests,
         COUNT(CASE WHEN success THEN 1 END) as successful_requests,
         AVG(response_time) as avg_response_time,
         MIN(response_time) as min_response_time,
         MAX(response_time) as max_response_time
       FROM load_test_requests 
       WHERE test_id = $1 
       GROUP BY scenario_name`,
      [testId]
    );
    
    return scenarioStats.rows;
  }

  generateRecommendations(test, thresholdsMet) {
    const recommendations = [];
    
    if (!thresholdsMet) {
      if (test.p95_response_time > this.performanceThresholds.responseTime.p95) {
        recommendations.push({
          type: 'performance',
          priority: 'high',
          issue: 'High response times detected',
          suggestion: 'Consider implementing caching, database optimization, or horizontal scaling'
        });
      }
      
      if (test.error_rate > this.performanceThresholds.errorRate.maximum) {
        recommendations.push({
          type: 'reliability',
          priority: 'critical',
          issue: 'High error rate detected',
          suggestion: 'Investigate error patterns and implement better error handling'
        });
      }
      
      if (test.throughput < this.performanceThresholds.throughput.minimum) {
        recommendations.push({
          type: 'capacity',
          priority: 'high',
          issue: 'Throughput below minimum requirements',
          suggestion: 'Scale infrastructure or optimize application performance'
        });
      }
    }
    
    // Monthly capacity projection
    const monthlyCapacity = test.throughput * 60 * 60 * 24 * 30; // requests per month
    if (monthlyCapacity < this.config.targetThroughput) {
      recommendations.push({
        type: 'capacity',
        priority: 'medium',
        issue: `Current capacity (${Math.round(monthlyCapacity)} req/month) below target (${this.config.targetThroughput} req/month)`,
        suggestion: 'Scale infrastructure to meet monthly capacity requirements'
      });
    }
    
    return recommendations;
  }

  async saveTestReport(testName, report) {
    const reportDir = path.join(process.cwd(), 'test-reports');
    await fs.mkdir(reportDir, { recursive: true });
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `load-test-${testName}-${timestamp}.json`;
    const filepath = path.join(reportDir, filename);
    
    await fs.writeFile(filepath, JSON.stringify(report, null, 2));
    console.log(`📄 Test report saved: ${filepath}`);
    
    // Also save a summary report
    const summaryFilename = `load-test-${testName}-${timestamp}-summary.txt`;
    const summaryFilepath = path.join(reportDir, summaryFilename);
    const summary = this.generateTextSummary(report);
    
    await fs.writeFile(summaryFilepath, summary);
    console.log(`📄 Test summary saved: ${summaryFilepath}`);
  }

  generateTextSummary(report) {
    const { testInfo, performance, thresholds } = report;
    
    return `
🚀 LOAD TEST SUMMARY
===================

Test Information:
- Name: ${testInfo.name}
- Type: ${testInfo.type}
- Duration: ${Math.round(testInfo.duration / 1000)}s
- Max Concurrent Users: ${testInfo.maxConcurrentUsers}

Performance Results:
- Total Requests: ${performance.totalRequests.toLocaleString()}
- Successful Requests: ${performance.successfulRequests.toLocaleString()}
- Failed Requests: ${performance.failedRequests.toLocaleString()}
- Throughput: ${performance.throughput.toFixed(2)} req/s
- Error Rate: ${(performance.errorRate * 100).toFixed(2)}%

Response Times:
- Average: ${performance.responseTime.average.toFixed(2)}ms
- 50th Percentile: ${performance.responseTime.p50.toFixed(2)}ms
- 95th Percentile: ${performance.responseTime.p95.toFixed(2)}ms
- 99th Percentile: ${performance.responseTime.p99.toFixed(2)}ms

Threshold Results:
- Overall: ${thresholds.met ? '✅ PASSED' : '❌ FAILED'}
- Response Time P50: ${thresholds.results.responseTime.p50.passed ? '✅' : '❌'} ${thresholds.results.responseTime.p50.actual.toFixed(2)}ms (threshold: ${thresholds.results.responseTime.p50.threshold}ms)
- Response Time P95: ${thresholds.results.responseTime.p95.passed ? '✅' : '❌'} ${thresholds.results.responseTime.p95.actual.toFixed(2)}ms (threshold: ${thresholds.results.responseTime.p95.threshold}ms)
- Throughput: ${thresholds.results.throughput.passed ? '✅' : '❌'} ${thresholds.results.throughput.actual.toFixed(2)} req/s (minimum: ${thresholds.results.throughput.minimum.toFixed(2)} req/s)
- Error Rate: ${thresholds.results.errorRate.passed ? '✅' : '❌'} ${(thresholds.results.errorRate.actual * 100).toFixed(2)}% (maximum: ${(thresholds.results.errorRate.maximum * 100).toFixed(2)}%)

Monthly Capacity Projection:
- Current: ${Math.round(performance.throughput * 60 * 60 * 24 * 30).toLocaleString()} requests/month
- Target: ${this.config.targetThroughput.toLocaleString()} requests/month
- Status: ${performance.throughput * 60 * 60 * 24 * 30 >= this.config.targetThroughput ? '✅ MEETS TARGET' : '❌ BELOW TARGET'}

Recommendations:
${report.recommendations.map(rec => `- [${rec.priority.toUpperCase()}] ${rec.issue}: ${rec.suggestion}`).join('\n')}
`;
  }

  // Test data generators
  generateDocumentPayload() {
    return {
      document_type: 'prior_authorization',
      file_data: 'base64_encoded_document_data',
      patient_info: {
        name: 'Test Patient',
        dob: '1980-01-01',
        member_id: 'TEST123456'
      }
    };
  }

  generateAuthorizationPayload() {
    return {
      patient_name: 'Test Patient',
      patient_dob: '1980-01-01',
      member_id: 'TEST123456',
      payer_name: ['Aetna', 'BCBS', 'Cigna', 'Humana'][Math.floor(Math.random() * 4)],
      procedure_code: 'CPT12345',
      diagnosis_code: 'ICD10-ABC',
      provider_npi: '1234567890',
      urgency: ['routine', 'urgent', 'stat'][Math.floor(Math.random() * 3)]
    };
  }

  generatePredictionPayload() {
    return {
      authorization_data: {
        payer_name: ['Aetna', 'BCBS', 'Cigna', 'Humana'][Math.floor(Math.random() * 4)],
        procedure_code: 'CPT12345',
        diagnosis_code: 'ICD10-ABC',
        patient_age: Math.floor(Math.random() * 80) + 18,
        provider_specialty: 'cardiology'
      }
    };
  }

  generateAppealPayload() {
    return {
      authorization_id: Math.floor(Math.random() * 10000),
      denial_reason: 'medical_necessity',
      additional_documentation: 'Clinical notes and test results'
    };
  }

  generateStatusPayload() {
    return {
      authorization_id: Math.floor(Math.random() * 10000)
    };
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async shutdown() {
    this.isRunning = false;
    
    if (this.pool) {
      await this.pool.end();
    }
  }
};

module.exports = LoadTestingFramework;

// CLI interface for running load tests
if (require.main === module) {
  const framework = new LoadTestingFramework({
    baseUrl: process.env.TEST_BASE_URL || 'http://localhost:3000',
    maxConcurrentUsers: parseInt(process.env.MAX_USERS) || 100,
    testDuration: parseInt(process.env.TEST_DURATION) || 300000,
    targetThroughput: parseInt(process.env.TARGET_THROUGHPUT) || 10000
  });
  
  framework.initialize()
    .then(() => framework.runLoadTest('cli_load_test', 'capacity'))
    .then(report => {
      console.log('\n🎉 Load test completed successfully!');
      console.log(`📊 Throughput: ${report.performance.throughput.toFixed(2)} req/s`);
      console.log(`⚡ P95 Response Time: ${report.performance.responseTime.p95.toFixed(2)}ms`);
      console.log(`✅ Thresholds Met: ${report.thresholds.met ? 'YES' : 'NO'}`);
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Load test failed:', error);
      process.exit(1);
    });
}