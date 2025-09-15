#!/usr/bin/env node

const LoadTestingFramework = require('../src/testing/loadTestingFramework');
const path = require('path');
const fs = require('fs');

/**
 * ClaimFlow AI Load Testing Script
 * 
 * This script runs comprehensive load tests to validate the system's ability
 * to handle 10,000+ authorizations per month with 75% faster processing.
 * 
 * Usage:
 *   node scripts/runLoadTest.js [options]
 * 
 * Options:
 *   --target-rps <number>     Target requests per second (default: 10)
 *   --duration <seconds>      Test duration in seconds (default: 300)
 *   --ramp-up <seconds>       Ramp-up period in seconds (default: 60)
 *   --concurrent <number>     Max concurrent requests (default: 100)
 *   --scenario <name>         Test scenario (default: comprehensive)
 *   --output <path>           Output directory for reports (default: ./load-test-results)
 *   --verbose                 Enable verbose logging
 *   --help                    Show help message
 */

class LoadTestRunner {
  constructor() {
    this.framework = new LoadTestingFramework();
    this.config = this.parseArguments();
    this.scenarios = {
      comprehensive: {
        name: 'Comprehensive Load Test',
        description: 'Tests all major endpoints with realistic load patterns',
        targetRps: 10,
        duration: 300,
        rampUpTime: 60,
        maxConcurrent: 100,
        endpoints: [
          { path: '/api/auth/login', weight: 5, method: 'POST' },
          { path: '/api/authorizations', weight: 30, method: 'POST' },
          { path: '/api/authorizations', weight: 20, method: 'GET' },
          { path: '/api/ai/process-document', weight: 15, method: 'POST' },
          { path: '/api/ai/analytics/dashboard', weight: 10, method: 'GET' },
          { path: '/api/ai/trends/payer-analysis', weight: 10, method: 'GET' },
          { path: '/api/providers', weight: 5, method: 'GET' },
          { path: '/api/payers', weight: 5, method: 'GET' }
        ]
      },
      peak_load: {
        name: 'Peak Load Test',
        description: 'Simulates peak usage periods with high concurrent load',
        targetRps: 25,
        duration: 180,
        rampUpTime: 30,
        maxConcurrent: 250,
        endpoints: [
          { path: '/api/authorizations', weight: 50, method: 'POST' },
          { path: '/api/authorizations', weight: 30, method: 'GET' },
          { path: '/api/ai/process-document', weight: 20, method: 'POST' }
        ]
      },
      endurance: {
        name: 'Endurance Test',
        description: 'Long-running test to identify memory leaks and stability issues',
        targetRps: 5,
        duration: 1800, // 30 minutes
        rampUpTime: 120,
        maxConcurrent: 50,
        endpoints: [
          { path: '/api/authorizations', weight: 40, method: 'POST' },
          { path: '/api/authorizations', weight: 30, method: 'GET' },
          { path: '/api/ai/analytics/dashboard', weight: 15, method: 'GET' },
          { path: '/api/ai/collective-learning/insights', weight: 15, method: 'GET' }
        ]
      },
      ai_intensive: {
        name: 'AI Processing Intensive Test',
        description: 'Focuses on AI processing pipeline performance',
        targetRps: 8,
        duration: 240,
        rampUpTime: 45,
        maxConcurrent: 80,
        endpoints: [
          { path: '/api/ai/process-document', weight: 35, method: 'POST' },
          { path: '/api/ai/collective-learning/insights', weight: 20, method: 'GET' },
          { path: '/api/ai/analytics/comprehensive-report', weight: 15, method: 'GET' },
          { path: '/api/ai/trends/predictive-insights', weight: 15, method: 'GET' },
          { path: '/api/ai/performance/metrics', weight: 15, method: 'GET' }
        ]
      }
    };
  }

  parseArguments() {
    const args = process.argv.slice(2);
    const config = {
      targetRps: 10,
      duration: 300,
      rampUpTime: 60,
      maxConcurrent: 100,
      scenario: 'comprehensive',
      outputDir: './load-test-results',
      verbose: false,
      baseUrl: process.env.LOAD_TEST_URL || 'http://localhost:3000',
      help: false
    };

    for (let i = 0; i < args.length; i++) {
      switch (args[i]) {
        case '--target-rps':
          config.targetRps = parseInt(args[++i]) || config.targetRps;
          break;
        case '--duration':
          config.duration = parseInt(args[++i]) || config.duration;
          break;
        case '--ramp-up':
          config.rampUpTime = parseInt(args[++i]) || config.rampUpTime;
          break;
        case '--concurrent':
          config.maxConcurrent = parseInt(args[++i]) || config.maxConcurrent;
          break;
        case '--scenario':
          config.scenario = args[++i] || config.scenario;
          break;
        case '--output':
          config.outputDir = args[++i] || config.outputDir;
          break;
        case '--base-url':
          config.baseUrl = args[++i] || config.baseUrl;
          break;
        case '--verbose':
          config.verbose = true;
          break;
        case '--help':
          config.help = true;
          break;
      }
    }

    return config;
  }

  showHelp() {
    console.log(`
ClaimFlow AI Load Testing Script
`);
    console.log('Usage: node scripts/runLoadTest.js [options]\n');
    console.log('Options:');
    console.log('  --target-rps <number>     Target requests per second (default: 10)');
    console.log('  --duration <seconds>      Test duration in seconds (default: 300)');
    console.log('  --ramp-up <seconds>       Ramp-up period in seconds (default: 60)');
    console.log('  --concurrent <number>     Max concurrent requests (default: 100)');
    console.log('  --scenario <name>         Test scenario (default: comprehensive)');
    console.log('  --output <path>           Output directory for reports (default: ./load-test-results)');
    console.log('  --base-url <url>          Base URL for testing (default: http://localhost:3000)');
    console.log('  --verbose                 Enable verbose logging');
    console.log('  --help                    Show this help message\n');
    
    console.log('Available scenarios:');
    Object.entries(this.scenarios).forEach(([key, scenario]) => {
      console.log(`  ${key.padEnd(15)} - ${scenario.description}`);
    });
    
    console.log('\nExamples:');
    console.log('  node scripts/runLoadTest.js --scenario peak_load --duration 180');
    console.log('  node scripts/runLoadTest.js --target-rps 20 --concurrent 200 --verbose');
    console.log('  node scripts/runLoadTest.js --scenario endurance --output ./results/endurance\n');
  }

  async validateEnvironment() {
    console.log('🔍 Validating test environment...');
    
    try {
      // Check if server is running
      const response = await fetch(`${this.config.baseUrl}/health`);
      if (!response.ok) {
        throw new Error(`Server health check failed: ${response.status}`);
      }
      
      const health = await response.json();
      console.log('✅ Server is running and healthy');
      
      if (this.config.verbose) {
        console.log('Server status:', JSON.stringify(health, null, 2));
      }
      
      // Check database connectivity
      if (health.database && health.database.status !== 'connected') {
        console.warn('⚠️  Database connection issues detected');
      }
      
      // Check AI services
      if (health.advancedServices) {
        const inactiveServices = Object.entries(health.advancedServices)
          .filter(([_, status]) => status !== 'active')
          .map(([service]) => service);
        
        if (inactiveServices.length > 0) {
          console.warn(`⚠️  Inactive AI services: ${inactiveServices.join(', ')}`);
        } else {
          console.log('✅ All AI services are active');
        }
      }
      
      return true;
    } catch (error) {
      console.error('❌ Environment validation failed:', error.message);
      console.error('Please ensure the ClaimFlow AI server is running at:', this.config.baseUrl);
      return false;
    }
  }

  async setupOutputDirectory() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const testDir = path.join(this.config.outputDir, `load-test-${timestamp}`);
    
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    
    this.testOutputDir = testDir;
    console.log(`📁 Test results will be saved to: ${testDir}`);
    
    return testDir;
  }

  async runLoadTest() {
    try {
      console.log('🚀 Starting ClaimFlow AI Load Test\n');
      
      if (this.config.help) {
        this.showHelp();
        return;
      }
      
      // Validate environment
      const isValid = await this.validateEnvironment();
      if (!isValid) {
        process.exit(1);
      }
      
      // Setup output directory
      await this.setupOutputDirectory();
      
      // Get scenario configuration
      const scenario = this.scenarios[this.config.scenario];
      if (!scenario) {
        console.error(`❌ Unknown scenario: ${this.config.scenario}`);
        console.log('Available scenarios:', Object.keys(this.scenarios).join(', '));
        process.exit(1);
      }
      
      // Merge scenario config with command line options
      const testConfig = {
        ...scenario,
        targetRps: this.config.targetRps || scenario.targetRps,
        duration: this.config.duration || scenario.duration,
        rampUpTime: this.config.rampUpTime || scenario.rampUpTime,
        maxConcurrent: this.config.maxConcurrent || scenario.maxConcurrent,
        baseUrl: this.config.baseUrl,
        verbose: this.config.verbose
      };
      
      console.log(`📋 Test Scenario: ${scenario.name}`);
      console.log(`📝 Description: ${scenario.description}`);
      console.log(`🎯 Target RPS: ${testConfig.targetRps}`);
      console.log(`⏱️  Duration: ${testConfig.duration}s`);
      console.log(`📈 Ramp-up: ${testConfig.rampUpTime}s`);
      console.log(`🔄 Max Concurrent: ${testConfig.maxConcurrent}`);
      console.log(`🌐 Base URL: ${testConfig.baseUrl}\n`);
      
      // Initialize framework
      await this.framework.initialize();
      
      // Validate test environment
      const envValidation = await this.framework.validateTestEnvironment();
      if (!envValidation.isValid) {
        console.error('❌ Test environment validation failed:');
        envValidation.issues.forEach(issue => console.error(`  - ${issue}`));
        process.exit(1);
      }
      
      console.log('✅ Test environment validated\n');
      
      // Run the load test
      console.log('🏃 Starting load test execution...');
      const startTime = Date.now();
      
      const results = await this.framework.runLoadTest({
        name: scenario.name,
        targetRps: testConfig.targetRps,
        duration: testConfig.duration,
        rampUpTime: testConfig.rampUpTime,
        maxConcurrent: testConfig.maxConcurrent,
        endpoints: testConfig.endpoints,
        baseUrl: testConfig.baseUrl
      });
      
      const endTime = Date.now();
      const totalTime = (endTime - startTime) / 1000;
      
      console.log(`\n✅ Load test completed in ${totalTime.toFixed(2)}s\n`);
      
      // Display results summary
      this.displayResults(results);
      
      // Generate detailed report
      const reportPath = await this.generateDetailedReport(results, testConfig);
      console.log(`📊 Detailed report saved to: ${reportPath}`);
      
      // Check if performance targets were met
      this.evaluatePerformance(results, testConfig);
      
    } catch (error) {
      console.error('❌ Load test failed:', error.message);
      if (this.config.verbose) {
        console.error(error.stack);
      }
      process.exit(1);
    } finally {
      // Cleanup
      if (this.framework) {
        await this.framework.shutdown();
      }
    }
  }

  displayResults(results) {
    console.log('📊 Load Test Results Summary:');
    console.log('=' .repeat(50));
    console.log(`Total Requests: ${results.totalRequests.toLocaleString()}`);
    console.log(`Successful Requests: ${results.successfulRequests.toLocaleString()}`);
    console.log(`Failed Requests: ${results.failedRequests.toLocaleString()}`);
    console.log(`Success Rate: ${(results.successRate * 100).toFixed(2)}%`);
    console.log(`Error Rate: ${(results.errorRate * 100).toFixed(2)}%`);
    console.log(`Average RPS: ${results.averageRps.toFixed(2)}`);
    console.log(`Peak RPS: ${results.peakRps.toFixed(2)}`);
    console.log(`Average Response Time: ${results.averageResponseTime.toFixed(2)}ms`);
    console.log(`95th Percentile: ${results.responseTimeP95.toFixed(2)}ms`);
    console.log(`99th Percentile: ${results.responseTimeP99.toFixed(2)}ms`);
    console.log(`Max Response Time: ${results.maxResponseTime.toFixed(2)}ms`);
    
    if (results.resourceUsage) {
      console.log('\n💻 Resource Usage:');
      console.log(`Peak CPU: ${results.resourceUsage.peakCpu.toFixed(1)}%`);
      console.log(`Peak Memory: ${(results.resourceUsage.peakMemory / 1024 / 1024).toFixed(1)}MB`);
      console.log(`Average CPU: ${results.resourceUsage.averageCpu.toFixed(1)}%`);
      console.log(`Average Memory: ${(results.resourceUsage.averageMemory / 1024 / 1024).toFixed(1)}MB`);
    }
    
    if (results.errorBreakdown && Object.keys(results.errorBreakdown).length > 0) {
      console.log('\n❌ Error Breakdown:');
      Object.entries(results.errorBreakdown).forEach(([error, count]) => {
        console.log(`  ${error}: ${count}`);
      });
    }
    
    console.log('=' .repeat(50));
  }

  async generateDetailedReport(results, config) {
    const timestamp = new Date().toISOString();
    const report = {
      metadata: {
        testName: config.name,
        timestamp,
        configuration: config,
        environment: {
          nodeVersion: process.version,
          platform: process.platform,
          arch: process.arch
        }
      },
      results,
      analysis: this.analyzeResults(results, config)
    };
    
    const reportPath = path.join(this.testOutputDir, 'load-test-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    // Generate HTML report
    const htmlReportPath = path.join(this.testOutputDir, 'load-test-report.html');
    const htmlContent = this.generateHtmlReport(report);
    fs.writeFileSync(htmlReportPath, htmlContent);
    
    return reportPath;
  }

  analyzeResults(results, config) {
    const analysis = {
      performanceGrade: 'A',
      issues: [],
      recommendations: [],
      targetsMet: {
        rps: results.averageRps >= config.targetRps * 0.9,
        errorRate: results.errorRate < 0.01, // Less than 1%
        responseTime: results.responseTimeP95 < 2000, // Less than 2s for 95th percentile
        throughput: results.totalRequests >= (config.targetRps * config.duration * 0.8)
      }
    };
    
    // Evaluate performance
    if (results.errorRate > 0.05) {
      analysis.performanceGrade = 'F';
      analysis.issues.push('High error rate detected (>5%)');
      analysis.recommendations.push('Investigate server errors and optimize error handling');
    } else if (results.errorRate > 0.01) {
      analysis.performanceGrade = 'C';
      analysis.issues.push('Moderate error rate detected (>1%)');
    }
    
    if (results.responseTimeP95 > 5000) {
      analysis.performanceGrade = 'F';
      analysis.issues.push('Very slow response times (95th percentile >5s)');
      analysis.recommendations.push('Optimize database queries and implement caching');
    } else if (results.responseTimeP95 > 2000) {
      if (analysis.performanceGrade === 'A') analysis.performanceGrade = 'B';
      analysis.issues.push('Slow response times (95th percentile >2s)');
    }
    
    if (results.averageRps < config.targetRps * 0.7) {
      analysis.performanceGrade = 'D';
      analysis.issues.push('Low throughput compared to target');
      analysis.recommendations.push('Scale up server resources or optimize application performance');
    }
    
    // Resource usage analysis
    if (results.resourceUsage) {
      if (results.resourceUsage.peakCpu > 90) {
        analysis.issues.push('High CPU usage detected');
        analysis.recommendations.push('Consider CPU optimization or horizontal scaling');
      }
      
      if (results.resourceUsage.peakMemory > 2 * 1024 * 1024 * 1024) { // 2GB
        analysis.issues.push('High memory usage detected');
        analysis.recommendations.push('Investigate memory leaks and optimize memory usage');
      }
    }
    
    return analysis;
  }

  generateHtmlReport(report) {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ClaimFlow AI Load Test Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background-color: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { text-align: center; margin-bottom: 30px; }
        .metric-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin: 20px 0; }
        .metric-card { background: #f8f9fa; padding: 15px; border-radius: 6px; border-left: 4px solid #007bff; }
        .metric-value { font-size: 24px; font-weight: bold; color: #007bff; }
        .metric-label { color: #666; font-size: 14px; }
        .grade { display: inline-block; padding: 5px 15px; border-radius: 20px; color: white; font-weight: bold; }
        .grade-A { background-color: #28a745; }
        .grade-B { background-color: #17a2b8; }
        .grade-C { background-color: #ffc107; color: #212529; }
        .grade-D { background-color: #fd7e14; }
        .grade-F { background-color: #dc3545; }
        .issues { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 6px; margin: 10px 0; }
        .recommendations { background: #d1ecf1; border: 1px solid #bee5eb; padding: 15px; border-radius: 6px; margin: 10px 0; }
        .timestamp { color: #666; font-size: 12px; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background-color: #f8f9fa; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>ClaimFlow AI Load Test Report</h1>
            <p class="timestamp">Generated: ${report.metadata.timestamp}</p>
            <p><strong>Test:</strong> ${report.metadata.configuration.name}</p>
            <p><strong>Performance Grade:</strong> <span class="grade grade-${report.analysis.performanceGrade}">${report.analysis.performanceGrade}</span></p>
        </div>
        
        <h2>Test Configuration</h2>
        <table>
            <tr><td><strong>Target RPS</strong></td><td>${report.metadata.configuration.targetRps}</td></tr>
            <tr><td><strong>Duration</strong></td><td>${report.metadata.configuration.duration}s</td></tr>
            <tr><td><strong>Ramp-up Time</strong></td><td>${report.metadata.configuration.rampUpTime}s</td></tr>
            <tr><td><strong>Max Concurrent</strong></td><td>${report.metadata.configuration.maxConcurrent}</td></tr>
            <tr><td><strong>Base URL</strong></td><td>${report.metadata.configuration.baseUrl}</td></tr>
        </table>
        
        <h2>Performance Metrics</h2>
        <div class="metric-grid">
            <div class="metric-card">
                <div class="metric-value">${report.results.totalRequests.toLocaleString()}</div>
                <div class="metric-label">Total Requests</div>
            </div>
            <div class="metric-card">
                <div class="metric-value">${(report.results.successRate * 100).toFixed(2)}%</div>
                <div class="metric-label">Success Rate</div>
            </div>
            <div class="metric-card">
                <div class="metric-value">${report.results.averageRps.toFixed(2)}</div>
                <div class="metric-label">Average RPS</div>
            </div>
            <div class="metric-card">
                <div class="metric-value">${report.results.averageResponseTime.toFixed(2)}ms</div>
                <div class="metric-label">Avg Response Time</div>
            </div>
            <div class="metric-card">
                <div class="metric-value">${report.results.responseTimeP95.toFixed(2)}ms</div>
                <div class="metric-label">95th Percentile</div>
            </div>
            <div class="metric-card">
                <div class="metric-value">${report.results.responseTimeP99.toFixed(2)}ms</div>
                <div class="metric-label">99th Percentile</div>
            </div>
        </div>
        
        ${report.analysis.issues.length > 0 ? `
        <h2>Issues Identified</h2>
        <div class="issues">
            <ul>
                ${report.analysis.issues.map(issue => `<li>${issue}</li>`).join('')}
            </ul>
        </div>
        ` : ''}
        
        ${report.analysis.recommendations.length > 0 ? `
        <h2>Recommendations</h2>
        <div class="recommendations">
            <ul>
                ${report.analysis.recommendations.map(rec => `<li>${rec}</li>`).join('')}
            </ul>
        </div>
        ` : ''}
        
        <h2>Target Achievement</h2>
        <table>
            <tr><td><strong>RPS Target</strong></td><td>${report.analysis.targetsMet.rps ? '✅ Met' : '❌ Not Met'}</td></tr>
            <tr><td><strong>Error Rate Target</strong></td><td>${report.analysis.targetsMet.errorRate ? '✅ Met' : '❌ Not Met'}</td></tr>
            <tr><td><strong>Response Time Target</strong></td><td>${report.analysis.targetsMet.responseTime ? '✅ Met' : '❌ Not Met'}</td></tr>
            <tr><td><strong>Throughput Target</strong></td><td>${report.analysis.targetsMet.throughput ? '✅ Met' : '❌ Not Met'}</td></tr>
        </table>
    </div>
</body>
</html>
    `;
  }

  evaluatePerformance(results, config) {
    console.log('\n🎯 Performance Evaluation:');
    console.log('=' .repeat(30));
    
    const monthlyCapacity = (results.averageRps * 60 * 60 * 24 * 30); // Requests per month
    const targetCapacity = 10000; // 10,000+ authorizations per month
    
    console.log(`Monthly Capacity: ${monthlyCapacity.toLocaleString()} requests`);
    console.log(`Target Capacity: ${targetCapacity.toLocaleString()}+ requests`);
    
    if (monthlyCapacity >= targetCapacity) {
      console.log('✅ Monthly capacity target MET');
    } else {
      console.log('❌ Monthly capacity target NOT MET');
      console.log(`   Need ${((targetCapacity - monthlyCapacity) / monthlyCapacity * 100).toFixed(1)}% improvement`);
    }
    
    // Performance improvement target (75% faster)
    const baselineResponseTime = 3000; // Assume 3s baseline
    const improvementTarget = 0.75; // 75% faster
    const targetResponseTime = baselineResponseTime * (1 - improvementTarget);
    
    console.log(`\nResponse Time Performance:`);
    console.log(`Current P95: ${results.responseTimeP95.toFixed(2)}ms`);
    console.log(`Target P95: ${targetResponseTime.toFixed(2)}ms (75% faster than ${baselineResponseTime}ms baseline)`);
    
    if (results.responseTimeP95 <= targetResponseTime) {
      console.log('✅ 75% faster processing target MET');
    } else {
      console.log('❌ 75% faster processing target NOT MET');
      const currentImprovement = ((baselineResponseTime - results.responseTimeP95) / baselineResponseTime) * 100;
      console.log(`   Current improvement: ${currentImprovement.toFixed(1)}%`);
    }
    
    console.log('=' .repeat(30));
  }
}

// Run the load test if this script is executed directly
if (require.main === module) {
  const runner = new LoadTestRunner();
  runner.runLoadTest().catch(error => {
    console.error('Load test execution failed:', error);
    process.exit(1);
  });
}

module.exports = LoadTestRunner;