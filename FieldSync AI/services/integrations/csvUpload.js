const csv = require('csv-parser');
const { stringify } = require('csv-stringify');
const fs = require('fs');
const path = require('path');
const { DataSource } = require('../../models');
const OAuthManager = require('./oauthManager');

class CSVUploadService {
  constructor() {
    this.uploadDir = path.join(process.cwd(), 'uploads');
    this.maxFileSize = 50 * 1024 * 1024; // 50MB
    this.previewRowLimit = 100;
    this.schemaDetectionLimit = 1000;
    this.oauthManager = new OAuthManager();
    
    // Ensure upload directory exists
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  /**
   * Get valid credentials for a data source
   */
  async getValidCredentials(dataSourceId) {
    return await this.oauthManager.getValidCredentials(dataSourceId);
  }

  /**
   * Validate CSV file
   */
  validateFile(file) {
    const errors = [];

    if (!file) {
      errors.push('No file provided');
      return errors;
    }

    // Check file size
    if (file.size > this.maxFileSize) {
      errors.push(`File size exceeds maximum limit of ${this.maxFileSize / (1024 * 1024)}MB`);
    }

    // Check file extension
    const allowedExtensions = ['.csv', '.txt'];
    const fileExtension = path.extname(file.originalname).toLowerCase();
    if (!allowedExtensions.includes(fileExtension)) {
      errors.push('Invalid file type. Only CSV and TXT files are allowed');
    }

    // Check MIME type
    const allowedMimeTypes = ['text/csv', 'text/plain', 'application/csv'];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      errors.push('Invalid MIME type. Expected CSV format');
    }

    return errors;
  }

  /**
   * Parse CSV file and detect schema
   */
  async parseAndDetectSchema(filePath, options = {}) {
    return new Promise((resolve, reject) => {
      const {
        delimiter = ',',
        quote = '"',
        escape = '"',
        encoding = 'utf8',
        skipEmptyLines = true,
        headers = true
      } = options;

      const results = [];
      const columnStats = new Map();
      let rowCount = 0;
      let headerRow = null;

      const stream = fs.createReadStream(filePath, { encoding })
        .pipe(csv({
          separator: delimiter,
          quote,
          escape,
          skipEmptyLines,
          headers: headers ? true : false,
          mapHeaders: ({ header }) => {
            // Clean and normalize header names
            return header.trim().replace(/[^\w\s]/g, '_').replace(/\s+/g, '_').toLowerCase();
          }
        }));

      stream.on('headers', (headers) => {
        headerRow = headers;
        // Initialize column statistics
        headers.forEach(header => {
          columnStats.set(header, {
            name: header,
            totalValues: 0,
            nullValues: 0,
            uniqueValues: new Set(),
            dataTypes: new Map(),
            minLength: Infinity,
            maxLength: 0,
            sampleValues: []
          });
        });
      });

      stream.on('data', (row) => {
        if (rowCount < this.schemaDetectionLimit) {
          results.push(row);
          
          // Analyze each column
          Object.entries(row).forEach(([column, value]) => {
            const stats = columnStats.get(column);
            if (!stats) return;

            stats.totalValues++;
            
            if (value === null || value === undefined || value === '') {
              stats.nullValues++;
            } else {
              const stringValue = String(value);
              stats.uniqueValues.add(stringValue);
              stats.minLength = Math.min(stats.minLength, stringValue.length);
              stats.maxLength = Math.max(stats.maxLength, stringValue.length);
              
              // Store sample values (first 10)
              if (stats.sampleValues.length < 10) {
                stats.sampleValues.push(stringValue);
              }

              // Detect data type
              const detectedType = this.detectDataType(stringValue);
              const currentCount = stats.dataTypes.get(detectedType) || 0;
              stats.dataTypes.set(detectedType, currentCount + 1);
            }
          });
        }
        rowCount++;
      });

      stream.on('end', () => {
        try {
          const schema = this.generateSchema(columnStats);
          const preview = results.slice(0, this.previewRowLimit);
          
          resolve({
            success: true,
            schema,
            preview,
            totalRows: rowCount,
            previewRows: preview.length,
            headers: headerRow,
            statistics: this.generateStatistics(columnStats, rowCount)
          });
        } catch (error) {
          reject(error);
        }
      });

      stream.on('error', (error) => {
        reject(new Error(`CSV parsing error: ${error.message}`));
      });
    });
  }

  /**
   * Detect data type of a value
   */
  detectDataType(value) {
    if (value === null || value === undefined || value === '') {
      return 'null';
    }

    const stringValue = String(value).trim();

    // Boolean
    if (['true', 'false', 'yes', 'no', '1', '0'].includes(stringValue.toLowerCase())) {
      return 'boolean';
    }

    // Integer
    if (/^-?\d+$/.test(stringValue)) {
      const num = parseInt(stringValue, 10);
      if (num >= -2147483648 && num <= 2147483647) {
        return 'integer';
      } else {
        return 'bigint';
      }
    }

    // Float/Decimal
    if (/^-?\d*\.\d+$/.test(stringValue)) {
      return 'decimal';
    }

    // Date
    if (this.isDate(stringValue)) {
      return 'date';
    }

    // Timestamp
    if (this.isTimestamp(stringValue)) {
      return 'timestamp';
    }

    // Email
    if (this.isEmail(stringValue)) {
      return 'email';
    }

    // URL
    if (this.isURL(stringValue)) {
      return 'url';
    }

    // JSON
    if (this.isJSON(stringValue)) {
      return 'json';
    }

    // Text (default)
    if (stringValue.length > 255) {
      return 'text';
    } else {
      return 'varchar';
    }
  }

  /**
   * Check if value is a date
   */
  isDate(value) {
    const datePatterns = [
      /^\d{4}-\d{2}-\d{2}$/,
      /^\d{2}\/\d{2}\/\d{4}$/,
      /^\d{2}-\d{2}-\d{4}$/,
      /^\d{4}\/\d{2}\/\d{2}$/
    ];
    
    return datePatterns.some(pattern => pattern.test(value)) && !isNaN(Date.parse(value));
  }

  /**
   * Check if value is a timestamp
   */
  isTimestamp(value) {
    const timestampPatterns = [
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/,
      /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/,
      /^\d{10}$/, // Unix timestamp
      /^\d{13}$/ // Unix timestamp in milliseconds
    ];
    
    return timestampPatterns.some(pattern => pattern.test(value)) && !isNaN(Date.parse(value));
  }

  /**
   * Check if value is an email
   */
  isEmail(value) {
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailPattern.test(value);
  }

  /**
   * Check if value is a URL
   */
  isURL(value) {
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if value is JSON
   */
  isJSON(value) {
    try {
      JSON.parse(value);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Generate schema from column statistics
   */
  generateSchema(columnStats) {
    const schema = [];

    columnStats.forEach((stats, columnName) => {
      const totalNonNull = stats.totalValues - stats.nullValues;
      const nullPercentage = stats.totalValues > 0 ? (stats.nullValues / stats.totalValues) * 100 : 0;
      
      // Determine the most common data type
      let primaryType = 'varchar';
      let maxCount = 0;
      
      stats.dataTypes.forEach((count, type) => {
        if (count > maxCount) {
          maxCount = count;
          primaryType = type;
        }
      });

      // Adjust type based on analysis
      let sqlType = this.mapToSQLType(primaryType, stats);
      
      schema.push({
        name: columnName,
        type: sqlType,
        nullable: nullPercentage > 10, // Allow nulls if more than 10% are null
        unique: stats.uniqueValues.size === totalNonNull && totalNonNull > 0,
        maxLength: stats.maxLength === Infinity ? 0 : stats.maxLength,
        minLength: stats.minLength === Infinity ? 0 : stats.minLength,
        uniqueValues: stats.uniqueValues.size,
        nullPercentage: Math.round(nullPercentage * 100) / 100,
        sampleValues: stats.sampleValues,
        description: this.generateColumnDescription(columnName, primaryType, stats)
      });
    });

    return schema;
  }

  /**
   * Map detected type to SQL type
   */
  mapToSQLType(detectedType, stats) {
    switch (detectedType) {
      case 'integer':
        return 'INTEGER';
      case 'bigint':
        return 'BIGINT';
      case 'decimal':
        return 'DECIMAL(10,2)';
      case 'boolean':
        return 'BOOLEAN';
      case 'date':
        return 'DATE';
      case 'timestamp':
        return 'TIMESTAMP';
      case 'email':
        return 'VARCHAR(255)';
      case 'url':
        return 'TEXT';
      case 'json':
        return 'JSON';
      case 'text':
        return 'TEXT';
      case 'varchar':
      default:
        const maxLength = Math.max(stats.maxLength, 50);
        if (maxLength > 255) {
          return 'TEXT';
        }
        return `VARCHAR(${Math.min(maxLength * 2, 255)})`;
    }
  }

  /**
   * Generate column description
   */
  generateColumnDescription(columnName, type, stats) {
    const descriptions = [];
    
    descriptions.push(`${type} column`);
    
    if (stats.uniqueValues.size === stats.totalValues - stats.nullValues) {
      descriptions.push('unique values');
    }
    
    if (stats.nullPercentage > 0) {
      descriptions.push(`${Math.round(stats.nullPercentage)}% null`);
    }

    return descriptions.join(', ');
  }

  /**
   * Generate statistics summary
   */
  generateStatistics(columnStats, totalRows) {
    const stats = {
      totalRows,
      totalColumns: columnStats.size,
      columns: []
    };

    columnStats.forEach((colStats, columnName) => {
      stats.columns.push({
        name: columnName,
        totalValues: colStats.totalValues,
        nullValues: colStats.nullValues,
        uniqueValues: colStats.uniqueValues.size,
        nullPercentage: Math.round((colStats.nullValues / colStats.totalValues) * 10000) / 100,
        uniquePercentage: Math.round((colStats.uniqueValues.size / (colStats.totalValues - colStats.nullValues)) * 10000) / 100,
        dataTypes: Object.fromEntries(colStats.dataTypes),
        minLength: colStats.minLength === Infinity ? 0 : colStats.minLength,
        maxLength: colStats.maxLength
      });
    });

    return stats;
  }

  /**
   * Process uploaded CSV file
   */
  async processUpload(file, options = {}) {
    try {
      // Validate file
      const validationErrors = this.validateFile(file);
      if (validationErrors.length > 0) {
        throw new Error(`File validation failed: ${validationErrors.join(', ')}`);
      }

      // Generate unique filename
      const timestamp = Date.now();
      const filename = `${timestamp}_${file.originalname}`;
      const filePath = path.join(this.uploadDir, filename);

      // Save file
      await fs.promises.writeFile(filePath, file.buffer);

      try {
        // Parse and detect schema
        const result = await this.parseAndDetectSchema(filePath, options);
        
        return {
          ...result,
          filename,
          filePath,
          originalName: file.originalname,
          fileSize: file.size,
          uploadedAt: new Date()
        };
      } catch (parseError) {
        // Clean up file on parse error
        await fs.promises.unlink(filePath).catch(() => {});
        throw parseError;
      }
    } catch (error) {
      throw new Error(`CSV upload processing failed: ${error.message}`);
    }
  }

  /**
   * Import CSV data to database
   */
  async importToDatabase(organizationId, uploadResult, importOptions = {}) {
    try {
      const {
        dataSourceName,
        tableName,
        schema = uploadResult.schema,
        skipRows = 0,
        maxRows = null,
        onConflict = 'skip' // 'skip', 'update', 'error'
      } = importOptions;

      // Create data source record
      const dataSource = await DataSource.create({
        organization_id: organizationId,
        name: dataSourceName || `CSV Import - ${uploadResult.originalName}`,
        type: 'csv',
        connection_string: JSON.stringify({
          filePath: uploadResult.filePath,
          tableName: tableName || this.generateTableName(uploadResult.originalName),
          originalFilename: uploadResult.originalName
        }),
        credentials: {
          provider: 'csv',
          createdAt: new Date(),
          filePath: uploadResult.filePath,
          originalFilename: uploadResult.originalName
        },
        status: 'active',
        metadata: {
          provider: 'csv',
          schema,
          statistics: uploadResult.statistics,
          uploadedAt: uploadResult.uploadedAt,
          totalRows: uploadResult.totalRows,
          previewRows: uploadResult.previewRows,
          importOptions: {
            skipRows,
            maxRows,
            onConflict
          },
          createdAt: new Date(),
          lastSync: new Date(),
          availableDataTypes: ['csv_data']
        }
      });

      return {
        success: true,
        dataSource,
        message: 'CSV data source created successfully',
        recordsProcessed: uploadResult.totalRows,
        schema
      };
    } catch (error) {
      throw new Error(`Failed to import CSV to database: ${error.message}`);
    }
  }

  /**
   * Generate table name from filename
   */
  generateTableName(filename) {
    return filename
      .replace(/\.[^/.]+$/, '') // Remove extension
      .replace(/[^a-zA-Z0-9]/g, '_') // Replace special chars with underscore
      .toLowerCase()
      .substring(0, 50); // Limit length
  }

  /**
   * Get CSV data with pagination
   */
  async getCSVData(filePath, options = {}) {
    return new Promise((resolve, reject) => {
      const {
        offset = 0,
        limit = 100,
        delimiter = ',',
        quote = '"',
        encoding = 'utf8'
      } = options;

      const results = [];
      let rowCount = 0;
      let skipped = 0;

      const stream = fs.createReadStream(filePath, { encoding })
        .pipe(csv({
          separator: delimiter,
          quote,
          skipEmptyLines: true,
          headers: true
        }));

      stream.on('data', (row) => {
        if (skipped < offset) {
          skipped++;
          return;
        }

        if (results.length < limit) {
          results.push(row);
        }
        rowCount++;
      });

      stream.on('end', () => {
        resolve({
          data: results,
          totalRows: rowCount + skipped,
          offset,
          limit,
          hasMore: rowCount > limit
        });
      });

      stream.on('error', (error) => {
        reject(new Error(`Failed to read CSV data: ${error.message}`));
      });
    });
  }

  /**
   * Clean up uploaded files
   */
  async cleanupFile(filePath) {
    try {
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
        return true;
      }
      return false;
    } catch (error) {
      console.error(`Failed to cleanup file ${filePath}:`, error);
      return false;
    }
  }

  /**
   * Export data to CSV
   */
  async exportToCSV(data, filename, options = {}) {
    return new Promise((resolve, reject) => {
      const {
        delimiter = ',',
        quote = '"',
        header = true,
        encoding = 'utf8'
      } = options;

      const outputPath = path.join(this.uploadDir, filename);
      const writeStream = fs.createWriteStream(outputPath, { encoding });

      stringify(data, {
        delimiter,
        quote,
        header,
        quoted: true
      })
      .pipe(writeStream)
      .on('finish', () => {
        resolve({
          success: true,
          filePath: outputPath,
          filename,
          recordCount: data.length
        });
      })
      .on('error', (error) => {
        reject(new Error(`Failed to export CSV: ${error.message}`));
      });
    });
  }

  /**
   * Validate schema against data
   */
  validateSchema(schema, sampleData) {
    const errors = [];
    const warnings = [];

    if (!Array.isArray(schema) || schema.length === 0) {
      errors.push('Schema must be a non-empty array');
      return { errors, warnings };
    }

    if (!Array.isArray(sampleData) || sampleData.length === 0) {
      warnings.push('No sample data provided for validation');
      return { errors, warnings };
    }

    const sampleRow = sampleData[0];
    const dataColumns = Object.keys(sampleRow);
    const schemaColumns = schema.map(col => col.name);

    // Check for missing columns in schema
    const missingInSchema = dataColumns.filter(col => !schemaColumns.includes(col));
    if (missingInSchema.length > 0) {
      warnings.push(`Columns in data but not in schema: ${missingInSchema.join(', ')}`);
    }

    // Check for missing columns in data
    const missingInData = schemaColumns.filter(col => !dataColumns.includes(col));
    if (missingInData.length > 0) {
      warnings.push(`Columns in schema but not in data: ${missingInData.join(', ')}`);
    }

    // Validate each schema column
    schema.forEach(column => {
      if (!column.name || typeof column.name !== 'string') {
        errors.push(`Invalid column name: ${column.name}`);
      }

      if (!column.type || typeof column.type !== 'string') {
        errors.push(`Invalid column type for ${column.name}: ${column.type}`);
      }

      // Check if column exists in data
      if (dataColumns.includes(column.name)) {
        const sampleValues = sampleData.map(row => row[column.name]).filter(val => val !== null && val !== undefined && val !== '');
        
        if (sampleValues.length === 0 && !column.nullable) {
          warnings.push(`Column ${column.name} is marked as non-nullable but has no values in sample data`);
        }
      }
    });

    return { errors, warnings };
  }
}

module.exports = CSVUploadService;