const natural = require('natural');
const compromise = require('compromise');

class IntentDetection {
  constructor() {
    this.classifier = new natural.BayesClassifier();
    this.initializeClassifier();
  }

  initializeClassifier() {
    // Sales and Revenue Queries
    this.classifier.addDocument('show me sales by region', 'sales_analysis');
    this.classifier.addDocument('total revenue last month', 'revenue_analysis');
    this.classifier.addDocument('sales performance by product', 'sales_analysis');
    this.classifier.addDocument('monthly sales trends', 'sales_analysis');
    this.classifier.addDocument('revenue breakdown by category', 'revenue_analysis');
    this.classifier.addDocument('top selling products', 'sales_analysis');
    this.classifier.addDocument('sales by quarter', 'sales_analysis');
    this.classifier.addDocument('revenue growth rate', 'revenue_analysis');

    // Customer Analysis
    this.classifier.addDocument('customer acquisition cost', 'customer_analysis');
    this.classifier.addDocument('customer lifetime value', 'customer_analysis');
    this.classifier.addDocument('customer retention rate', 'customer_analysis');
    this.classifier.addDocument('new customers this month', 'customer_analysis');
    this.classifier.addDocument('customer demographics', 'customer_analysis');
    this.classifier.addDocument('customer churn analysis', 'customer_analysis');
    this.classifier.addDocument('top customers by revenue', 'customer_analysis');

    // Financial Analysis
    this.classifier.addDocument('profit and loss statement', 'financial_analysis');
    this.classifier.addDocument('balance sheet summary', 'financial_analysis');
    this.classifier.addDocument('cash flow analysis', 'financial_analysis');
    this.classifier.addDocument('expense breakdown', 'financial_analysis');
    this.classifier.addDocument('gross margin analysis', 'financial_analysis');
    this.classifier.addDocument('operating expenses', 'financial_analysis');

    // Product Analysis
    this.classifier.addDocument('product performance metrics', 'product_analysis');
    this.classifier.addDocument('inventory levels', 'product_analysis');
    this.classifier.addDocument('product category analysis', 'product_analysis');
    this.classifier.addDocument('stock turnover rate', 'product_analysis');
    this.classifier.addDocument('product profitability', 'product_analysis');

    // Time-based Analysis
    this.classifier.addDocument('year over year comparison', 'trend_analysis');
    this.classifier.addDocument('seasonal trends', 'trend_analysis');
    this.classifier.addDocument('monthly growth rate', 'trend_analysis');
    this.classifier.addDocument('quarterly performance', 'trend_analysis');

    // Geographic Analysis
    this.classifier.addDocument('sales by location', 'geographic_analysis');
    this.classifier.addDocument('regional performance', 'geographic_analysis');
    this.classifier.addDocument('market penetration by state', 'geographic_analysis');

    // Operational Analysis
    this.classifier.addDocument('order fulfillment time', 'operational_analysis');
    this.classifier.addDocument('shipping performance', 'operational_analysis');
    this.classifier.addDocument('supplier analysis', 'operational_analysis');

    this.classifier.train();
  }

  detectIntent(query) {
    const normalizedQuery = this.normalizeQuery(query);
    const intent = this.classifier.classify(normalizedQuery);
    const confidence = this.classifier.getClassifications(normalizedQuery)[0].value;
    
    return {
      intent,
      confidence,
      entities: this.extractEntities(query),
      timeframe: this.extractTimeframe(query),
      metrics: this.extractMetrics(query),
      dimensions: this.extractDimensions(query)
    };
  }

  normalizeQuery(query) {
    return query.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  extractEntities(query) {
    const doc = compromise(query);
    const entities = {
      numbers: doc.numbers().out('array'),
      dates: doc.dates().out('array'),
      places: doc.places().out('array'),
      organizations: doc.organizations().out('array'),
      people: doc.people().out('array')
    };

    // Extract business-specific entities
    const businessEntities = this.extractBusinessEntities(query);
    
    return { ...entities, ...businessEntities };
  }

  extractBusinessEntities(query) {
    const lowerQuery = query.toLowerCase();
    const entities = {};

    // Product categories
    const productCategories = ['electronics', 'clothing', 'books', 'home', 'sports', 'beauty', 'automotive'];
    entities.productCategories = productCategories.filter(cat => lowerQuery.includes(cat));

    // Metrics
    const metrics = ['revenue', 'sales', 'profit', 'margin', 'cost', 'price', 'quantity', 'volume'];
    entities.metrics = metrics.filter(metric => lowerQuery.includes(metric));

    // Regions
    const regions = ['north', 'south', 'east', 'west', 'northeast', 'northwest', 'southeast', 'southwest'];
    entities.regions = regions.filter(region => lowerQuery.includes(region));

    return entities;
  }

  extractTimeframe(query) {
    const lowerQuery = query.toLowerCase();
    const timeframes = {
      'last month': { period: 'month', offset: -1 },
      'this month': { period: 'month', offset: 0 },
      'last quarter': { period: 'quarter', offset: -1 },
      'this quarter': { period: 'quarter', offset: 0 },
      'last year': { period: 'year', offset: -1 },
      'this year': { period: 'year', offset: 0 },
      'yesterday': { period: 'day', offset: -1 },
      'today': { period: 'day', offset: 0 },
      'last week': { period: 'week', offset: -1 },
      'this week': { period: 'week', offset: 0 },
      'ytd': { period: 'year_to_date', offset: 0 },
      'year to date': { period: 'year_to_date', offset: 0 },
      'mtd': { period: 'month_to_date', offset: 0 },
      'month to date': { period: 'month_to_date', offset: 0 }
    };

    for (const [phrase, timeframe] of Object.entries(timeframes)) {
      if (lowerQuery.includes(phrase)) {
        return timeframe;
      }
    }

    // Extract specific dates using compromise
    const doc = compromise(query);
    const dates = doc.dates().json();
    if (dates.length > 0) {
      return { period: 'custom', dates: dates };
    }

    return { period: 'all_time', offset: 0 };
  }

  extractMetrics(query) {
    const lowerQuery = query.toLowerCase();
    const metrics = [];

    const metricPatterns = {
      'revenue': ['revenue', 'sales amount', 'income', 'earnings'],
      'quantity': ['quantity', 'units', 'count', 'number of'],
      'profit': ['profit', 'margin', 'net income'],
      'cost': ['cost', 'expense', 'spending'],
      'growth': ['growth', 'increase', 'decrease', 'change'],
      'average': ['average', 'avg', 'mean'],
      'total': ['total', 'sum', 'aggregate'],
      'percentage': ['percentage', 'percent', '%', 'rate'],
      'ratio': ['ratio', 'proportion']
    };

    for (const [metric, patterns] of Object.entries(metricPatterns)) {
      if (patterns.some(pattern => lowerQuery.includes(pattern))) {
        metrics.push(metric);
      }
    }

    return metrics.length > 0 ? metrics : ['total'];
  }

  extractDimensions(query) {
    const lowerQuery = query.toLowerCase();
    const dimensions = [];

    const dimensionPatterns = {
      'region': ['region', 'location', 'area', 'state', 'country', 'city'],
      'product': ['product', 'item', 'category', 'brand'],
      'customer': ['customer', 'client', 'user', 'buyer'],
      'time': ['month', 'quarter', 'year', 'day', 'week', 'date'],
      'channel': ['channel', 'source', 'platform', 'store'],
      'employee': ['employee', 'staff', 'salesperson', 'rep'],
      'supplier': ['supplier', 'vendor', 'partner']
    };

    for (const [dimension, patterns] of Object.entries(dimensionPatterns)) {
      if (patterns.some(pattern => lowerQuery.includes(pattern))) {
        dimensions.push(dimension);
      }
    }

    return dimensions;
  }

  getQueryComplexity(query) {
    const entities = this.extractEntities(query);
    const metrics = this.extractMetrics(query);
    const dimensions = this.extractDimensions(query);
    
    const totalEntities = Object.values(entities).flat().length;
    const complexity = totalEntities + metrics.length + dimensions.length;
    
    if (complexity <= 2) return 'simple';
    if (complexity <= 5) return 'medium';
    return 'complex';
  }

  suggestQueryImprovements(query, intent) {
    const suggestions = [];
    const entities = this.extractEntities(query);
    const timeframe = this.extractTimeframe(query);
    
    if (timeframe.period === 'all_time') {
      suggestions.push('Consider adding a specific time period (e.g., "last month", "this quarter")');
    }
    
    if (entities.metrics.length === 0) {
      suggestions.push('Specify what metric you want to analyze (e.g., "revenue", "quantity", "profit")');
    }
    
    if (intent === 'sales_analysis' && !query.toLowerCase().includes('by')) {
      suggestions.push('Consider adding a dimension to group by (e.g., "by region", "by product")');
    }
    
    return suggestions;
  }
}

module.exports = new IntentDetection();