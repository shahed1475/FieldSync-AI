const { Parser } = require('node-sql-parser');
const { format } = require('sql-formatter');

class QueryOptimizer {
  constructor() {
    this.parser = new Parser();
    this.performanceThresholds = {
      fast: 1000,      // < 1 second
      medium: 5000,    // 1-5 seconds
      slow: 10000      // 5-10 seconds
      // > 10 seconds is considered very slow
    };
  }

  analyzeQuery(sql, executionTime, rowCount, dataSourceType) {
    try {
      const analysis = {
        sql: sql,
        executionTime: executionTime,
        rowCount: rowCount,
        dataSourceType: dataSourceType,
        performance: this.categorizePerformance(executionTime),
        complexity: this.analyzeComplexity(sql),
        optimizations: [],
        warnings: [],
        recommendations: [],
        score: 0
      };

      // Parse SQL to get AST
      let ast = null;
      try {
        ast = this.parser.astify(sql);
        analysis.parsed = true;
      } catch (parseError) {
        analysis.parsed = false;
        analysis.warnings.push('Unable to parse SQL for detailed analysis');
        return analysis;
      }

      // Analyze different aspects
      this.analyzeSelectClause(ast, analysis);
      this.analyzeWhereClause(ast, analysis);
      this.analyzeJoins(ast, analysis);
      this.analyzeOrderBy(ast, analysis);
      this.analyzeGroupBy(ast, analysis);
      this.analyzeSubqueries(ast, analysis);
      this.analyzeLimits(ast, analysis);

      // Performance-based recommendations
      this.addPerformanceRecommendations(analysis);

      // Calculate overall score
      analysis.score = this.calculateOptimizationScore(analysis);

      return analysis;
    } catch (error) {
      console.error('Error analyzing query:', error);
      return {
        sql: sql,
        executionTime: executionTime,
        rowCount: rowCount,
        error: error.message,
        performance: this.categorizePerformance(executionTime),
        complexity: 'unknown',
        optimizations: [],
        warnings: ['Analysis failed due to parsing error'],
        recommendations: ['Consider simplifying the query structure'],
        score: 0
      };
    }
  }

  categorizePerformance(executionTime) {
    if (executionTime < this.performanceThresholds.fast) {
      return 'fast';
    } else if (executionTime < this.performanceThresholds.medium) {
      return 'medium';
    } else if (executionTime < this.performanceThresholds.slow) {
      return 'slow';
    } else {
      return 'very_slow';
    }
  }

  analyzeComplexity(sql) {
    const complexityFactors = {
      joins: (sql.match(/\bJOIN\b/gi) || []).length,
      subqueries: (sql.match(/\(\s*SELECT\b/gi) || []).length,
      unions: (sql.match(/\bUNION\b/gi) || []).length,
      ctes: (sql.match(/\bWITH\b/gi) || []).length,
      aggregates: (sql.match(/\b(COUNT|SUM|AVG|MIN|MAX|GROUP_CONCAT)\b/gi) || []).length,
      windowFunctions: (sql.match(/\bOVER\s*\(/gi) || []).length
    };

    const totalComplexity = Object.values(complexityFactors).reduce((sum, count) => sum + count, 0);

    if (totalComplexity === 0) return 'simple';
    if (totalComplexity <= 2) return 'moderate';
    if (totalComplexity <= 5) return 'complex';
    return 'very_complex';
  }

  analyzeSelectClause(ast, analysis) {
    if (!ast || ast.type !== 'select') return;

    const columns = ast.columns;
    if (!columns) return;

    // Check for SELECT *
    const hasSelectAll = columns.some(col => col.expr && col.expr.type === 'column_ref' && col.expr.column === '*');
    if (hasSelectAll) {
      analysis.warnings.push('Using SELECT * can impact performance');
      analysis.recommendations.push('Specify only the columns you need instead of using SELECT *');
    }

    // Check for too many columns
    if (columns.length > 20) {
      analysis.warnings.push('Selecting many columns may impact performance');
      analysis.recommendations.push('Consider reducing the number of selected columns');
    }

    // Check for complex expressions in SELECT
    const complexExpressions = columns.filter(col => 
      col.expr && (col.expr.type === 'function' || col.expr.type === 'case')
    );
    
    if (complexExpressions.length > 5) {
      analysis.recommendations.push('Consider moving complex calculations to application layer if possible');
    }
  }

  analyzeWhereClause(ast, analysis) {
    if (!ast || ast.type !== 'select' || !ast.where) return;

    const whereClause = ast.where;
    
    // Check for functions on columns (non-sargable)
    this.checkForNonSargableConditions(whereClause, analysis);
    
    // Check for OR conditions
    this.checkForOrConditions(whereClause, analysis);
    
    // Check for LIKE patterns
    this.checkForLikePatterns(whereClause, analysis);
  }

  analyzeJoins(ast, analysis) {
    if (!ast || ast.type !== 'select' || !ast.from) return;

    const joins = [];
    this.extractJoins(ast.from, joins);

    if (joins.length === 0) return;

    analysis.optimizations.push(`Query uses ${joins.length} join(s)`);

    // Check for cross joins
    const crossJoins = joins.filter(join => join.join && join.join.toLowerCase() === 'cross join');
    if (crossJoins.length > 0) {
      analysis.warnings.push('Cross joins detected - these can be very expensive');
      analysis.recommendations.push('Consider using INNER JOIN with proper conditions instead of CROSS JOIN');
    }

    // Check for many joins
    if (joins.length > 5) {
      analysis.warnings.push('Many joins detected - consider query optimization');
      analysis.recommendations.push('Consider breaking complex joins into smaller queries or using temporary tables');
    }

    // Check for join conditions
    joins.forEach((join, index) => {
      if (!join.on) {
        analysis.warnings.push(`Join ${index + 1} missing ON condition`);
      }
    });
  }

  analyzeOrderBy(ast, analysis) {
    if (!ast || ast.type !== 'select' || !ast.orderby) return;

    const orderBy = ast.orderby;
    
    if (orderBy.length > 3) {
      analysis.recommendations.push('Multiple ORDER BY columns may impact performance - consider indexing');
    }

    // Check for ordering by expressions
    const expressionOrdering = orderBy.filter(order => 
      order.expr && order.expr.type === 'function'
    );
    
    if (expressionOrdering.length > 0) {
      analysis.warnings.push('Ordering by expressions can be slow');
      analysis.recommendations.push('Consider creating computed columns for complex ordering expressions');
    }
  }

  analyzeGroupBy(ast, analysis) {
    if (!ast || ast.type !== 'select' || !ast.groupby) return;

    const groupBy = ast.groupby;
    
    if (groupBy.length > 5) {
      analysis.warnings.push('Many GROUP BY columns may impact performance');
      analysis.recommendations.push('Consider if all grouping columns are necessary');
    }

    // Check if HAVING clause exists
    if (ast.having) {
      analysis.optimizations.push('Query uses HAVING clause for filtering aggregated results');
      
      // Check for non-aggregate conditions in HAVING
      // This is a simplified check - in practice, you'd need more sophisticated AST analysis
      const havingStr = JSON.stringify(ast.having);
      if (!havingStr.includes('function')) {
        analysis.recommendations.push('Consider moving non-aggregate conditions from HAVING to WHERE clause');
      }
    }
  }

  analyzeSubqueries(ast, analysis) {
    const subqueryCount = this.countSubqueries(ast);
    
    if (subqueryCount > 0) {
      analysis.optimizations.push(`Query contains ${subqueryCount} subquery/subqueries`);
      
      if (subqueryCount > 3) {
        analysis.warnings.push('Many subqueries detected');
        analysis.recommendations.push('Consider using JOINs instead of subqueries where possible');
      }
    }
  }

  analyzeLimits(ast, analysis) {
    if (!ast || ast.type !== 'select') return;

    if (!ast.limit && !ast.orderby) {
      analysis.recommendations.push('Consider adding LIMIT clause to prevent accidentally large result sets');
    }

    if (ast.limit) {
      const limitValue = ast.limit.value;
      if (Array.isArray(limitValue) && limitValue.length === 2) {
        const offset = limitValue[0].value;
        const limit = limitValue[1].value;
        
        if (offset > 10000) {
          analysis.warnings.push('Large OFFSET values can be inefficient');
          analysis.recommendations.push('Consider cursor-based pagination for large offsets');
        }
      }
    }
  }

  checkForNonSargableConditions(whereClause, analysis) {
    // This is a simplified check - would need more sophisticated AST traversal
    const whereStr = JSON.stringify(whereClause);
    
    if (whereStr.includes('"type":"function"')) {
      analysis.warnings.push('Functions on columns in WHERE clause may prevent index usage');
      analysis.recommendations.push('Avoid functions on columns in WHERE conditions when possible');
    }
  }

  checkForOrConditions(whereClause, analysis) {
    const whereStr = JSON.stringify(whereClause);
    
    if (whereStr.includes('"operator":"OR"')) {
      analysis.optimizations.push('Query uses OR conditions');
      analysis.recommendations.push('Consider using UNION instead of OR for better performance in some cases');
    }
  }

  checkForLikePatterns(whereClause, analysis) {
    const whereStr = JSON.stringify(whereClause);
    
    if (whereStr.includes('"operator":"LIKE"')) {
      analysis.optimizations.push('Query uses LIKE patterns');
      
      // Check for leading wildcards
      if (whereStr.includes('"%')) {
        analysis.warnings.push('LIKE patterns starting with % cannot use indexes efficiently');
        analysis.recommendations.push('Consider full-text search for leading wildcard patterns');
      }
    }
  }

  extractJoins(fromClause, joins) {
    if (Array.isArray(fromClause)) {
      fromClause.forEach(item => this.extractJoins(item, joins));
    } else if (fromClause && typeof fromClause === 'object') {
      if (fromClause.join) {
        joins.push(fromClause);
      }
      if (fromClause.table) {
        // This is a table reference, not a join
      }
      if (fromClause.expr) {
        this.extractJoins(fromClause.expr, joins);
      }
    }
  }

  countSubqueries(ast) {
    let count = 0;
    
    const traverse = (node) => {
      if (!node || typeof node !== 'object') return;
      
      if (node.type === 'select' && node !== ast) {
        count++;
      }
      
      Object.values(node).forEach(value => {
        if (Array.isArray(value)) {
          value.forEach(traverse);
        } else if (typeof value === 'object') {
          traverse(value);
        }
      });
    };
    
    traverse(ast);
    return count;
  }

  addPerformanceRecommendations(analysis) {
    switch (analysis.performance) {
      case 'very_slow':
        analysis.recommendations.push('Query is very slow - consider major optimization');
        analysis.recommendations.push('Review indexes on filtered and joined columns');
        analysis.recommendations.push('Consider query rewriting or data denormalization');
        break;
      case 'slow':
        analysis.recommendations.push('Query performance could be improved');
        analysis.recommendations.push('Check if appropriate indexes exist');
        break;
      case 'medium':
        analysis.recommendations.push('Query performance is acceptable but could be optimized');
        break;
      case 'fast':
        analysis.optimizations.push('Query performs well');
        break;
    }

    // Row count based recommendations
    if (analysis.rowCount > 100000) {
      analysis.recommendations.push('Large result set - consider pagination or filtering');
    } else if (analysis.rowCount > 10000) {
      analysis.recommendations.push('Consider if all returned rows are necessary');
    }
  }

  calculateOptimizationScore(analysis) {
    let score = 100; // Start with perfect score

    // Deduct points for warnings
    score -= analysis.warnings.length * 10;

    // Deduct points for performance
    switch (analysis.performance) {
      case 'very_slow':
        score -= 40;
        break;
      case 'slow':
        score -= 25;
        break;
      case 'medium':
        score -= 10;
        break;
    }

    // Deduct points for complexity
    switch (analysis.complexity) {
      case 'very_complex':
        score -= 20;
      case 'complex':
        score -= 10;
        break;
      case 'moderate':
        score -= 5;
        break;
    }

    // Bonus points for good practices
    if (analysis.recommendations.length === 0) {
      score += 10;
    }

    return Math.max(0, Math.min(100, score));
  }

  formatOptimizedSQL(sql) {
    try {
      return format(sql, {
        language: 'sql',
        indent: '  ',
        uppercase: true,
        linesBetweenQueries: 2
      });
    } catch (error) {
      console.warn('Failed to format SQL:', error);
      return sql;
    }
  }

  generateOptimizationReport(analyses) {
    const report = {
      totalQueries: analyses.length,
      averageScore: 0,
      performanceDistribution: {
        fast: 0,
        medium: 0,
        slow: 0,
        very_slow: 0
      },
      complexityDistribution: {
        simple: 0,
        moderate: 0,
        complex: 0,
        very_complex: 0
      },
      commonIssues: {},
      topRecommendations: {},
      improvementOpportunities: []
    };

    if (analyses.length === 0) return report;

    let totalScore = 0;

    analyses.forEach(analysis => {
      totalScore += analysis.score;
      
      // Performance distribution
      report.performanceDistribution[analysis.performance]++;
      
      // Complexity distribution
      report.complexityDistribution[analysis.complexity]++;
      
      // Common issues
      analysis.warnings.forEach(warning => {
        report.commonIssues[warning] = (report.commonIssues[warning] || 0) + 1;
      });
      
      // Top recommendations
      analysis.recommendations.forEach(recommendation => {
        report.topRecommendations[recommendation] = (report.topRecommendations[recommendation] || 0) + 1;
      });
    });

    report.averageScore = Math.round(totalScore / analyses.length);

    // Identify improvement opportunities
    if (report.performanceDistribution.slow + report.performanceDistribution.very_slow > analyses.length * 0.2) {
      report.improvementOpportunities.push('High number of slow queries - review indexing strategy');
    }

    if (report.complexityDistribution.complex + report.complexityDistribution.very_complex > analyses.length * 0.3) {
      report.improvementOpportunities.push('Many complex queries - consider query simplification');
    }

    if (report.averageScore < 70) {
      report.improvementOpportunities.push('Overall query optimization score is low - systematic review needed');
    }

    return report;
  }
}

module.exports = new QueryOptimizer();