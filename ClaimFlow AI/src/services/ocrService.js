const Tesseract = require('tesseract.js');
const sharp = require('sharp');
const fs = require('fs').promises;
const path = require('path');
const { Pool } = require('pg');

class OCRService {
  constructor(pool) {
    this.pool = pool || new Pool({
      connectionString: process.env.DATABASE_URL
    });
    
    this.supportedFormats = ['.pdf', '.png', '.jpg', '.jpeg', '.tiff', '.bmp'];
    this.ocrOptions = {
      logger: m => console.log(m),
      tessedit_pageseg_mode: Tesseract.PSM.AUTO,
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,!?@#$%^&*()_+-=[]{}|;:"<>?/~`'
    };
    
    this.medicalTerms = [
      'diagnosis', 'procedure', 'medication', 'dosage', 'frequency',
      'patient', 'provider', 'insurance', 'authorization', 'claim',
      'ICD-10', 'CPT', 'HCPCS', 'NPI', 'DOB', 'SSN', 'MRN'
    ];
    
    this.confidenceThreshold = 0.7;
  }

  // Initialize OCR service
  async initialize() {
    try {
      await this.createOCRTables();
      console.log('OCR service initialized successfully');
    } catch (error) {
      console.error('Failed to initialize OCR service:', error);
      throw error;
    }
  }

  // Create necessary database tables
  async createOCRTables() {
    const queries = [
      `CREATE TABLE IF NOT EXISTS ocr_jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_path VARCHAR(500) NOT NULL,
        file_name VARCHAR(255) NOT NULL,
        file_type VARCHAR(50) NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        confidence_score DECIMAL(3,2),
        extracted_text TEXT,
        structured_data TEXT,
        processing_time INTEGER,
        error_message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP,
        created_by INTEGER
      )`,
      
      `CREATE TABLE IF NOT EXISTS ocr_extractions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id INTEGER REFERENCES ocr_jobs(id),
        field_name VARCHAR(100) NOT NULL,
        field_value TEXT,
        confidence_score DECIMAL(3,2),
        bounding_box TEXT,
        page_number INTEGER DEFAULT 1,
        extraction_method VARCHAR(50)
      )`,
      
      `CREATE TABLE IF NOT EXISTS document_templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        template_name VARCHAR(100) NOT NULL,
        document_type VARCHAR(50) NOT NULL,
        field_mappings TEXT NOT NULL,
        extraction_rules TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`
    ];

    for (const query of queries) {
      await this.pool.query(query);
    }

    // Create indexes
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_ocr_jobs_status ON ocr_jobs(status)',
      'CREATE INDEX IF NOT EXISTS idx_ocr_jobs_created_at ON ocr_jobs(created_at)',
      'CREATE INDEX IF NOT EXISTS idx_ocr_extractions_job_id ON ocr_extractions(job_id)'
    ];

    for (const index of indexes) {
      await this.pool.query(index);
    }
  }

  // Process document with OCR
  async processDocument(filePath, options = {}) {
    const startTime = Date.now();
    
    try {
      // Validate file
      await this.validateFile(filePath);
      
      // Create OCR job record
      const jobId = await this.createOCRJob(filePath, options.userId);
      
      // Preprocess image for better OCR accuracy
      const preprocessedPath = await this.preprocessImage(filePath);
      
      // Perform OCR extraction
      const ocrResult = await this.performOCR(preprocessedPath, options);
      
      // Extract structured data
      const structuredData = await this.extractStructuredData(ocrResult.text, options.documentType);
      
      // Calculate processing time
      const processingTime = Date.now() - startTime;
      
      // Update job with results
      await this.updateOCRJob(jobId, {
        status: 'completed',
        extractedText: ocrResult.text,
        structuredData,
        confidenceScore: ocrResult.confidence,
        processingTime
      });
      
      // Store individual field extractions
      await this.storeFieldExtractions(jobId, structuredData, ocrResult.words);
      
      // Clean up preprocessed file
      if (preprocessedPath !== filePath) {
        await fs.unlink(preprocessedPath).catch(() => {});
      }
      
      return {
        jobId,
        text: ocrResult.text,
        structuredData,
        confidence: ocrResult.confidence,
        processingTime
      };
    } catch (error) {
      console.error('OCR processing failed:', error);
      
      // Update job with error
      if (jobId) {
        await this.updateOCRJob(jobId, {
          status: 'failed',
          errorMessage: error.message
        });
      }
      
      throw error;
    }
  }

  // Validate file format and size
  async validateFile(filePath) {
    try {
      const stats = await fs.stat(filePath);
      const ext = path.extname(filePath).toLowerCase();
      
      if (!this.supportedFormats.includes(ext)) {
        throw new Error(`Unsupported file format: ${ext}`);
      }
      
      // Check file size (max 50MB)
      if (stats.size > 50 * 1024 * 1024) {
        throw new Error('File size exceeds 50MB limit');
      }
      
      return true;
    } catch (error) {
      throw new Error(`File validation failed: ${error.message}`);
    }
  }

  // Create OCR job record
  async createOCRJob(filePath, userId) {
    const fileName = path.basename(filePath);
    const fileType = path.extname(filePath).toLowerCase();
    
    const result = await this.pool.query(`
      INSERT INTO ocr_jobs (file_path, file_name, file_type, created_by)
      VALUES ($1, $2, $3, $4)
      RETURNING id
    `, [filePath, fileName, fileType, userId]);
    
    return result.rows[0].id;
  }

  // Preprocess image for better OCR accuracy
  async preprocessImage(filePath) {
    try {
      const ext = path.extname(filePath).toLowerCase();
      
      // Skip preprocessing for PDFs (handled by Tesseract)
      if (ext === '.pdf') {
        return filePath;
      }
      
      const outputPath = filePath.replace(ext, '_processed.png');
      
      await sharp(filePath)
        .resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true })
        .grayscale()
        .normalize()
        .sharpen()
        .png({ quality: 100 })
        .toFile(outputPath);
      
      return outputPath;
    } catch (error) {
      console.warn('Image preprocessing failed, using original:', error.message);
      return filePath;
    }
  }

  // Perform OCR using Tesseract
  async performOCR(filePath, options = {}) {
    try {
      const worker = await Tesseract.createWorker();
      
      await worker.loadLanguage('eng');
      await worker.initialize('eng');
      await worker.setParameters(this.ocrOptions);
      
      const { data } = await worker.recognize(filePath);
      
      await worker.terminate();
      
      // Calculate overall confidence
      const confidence = data.confidence / 100;
      
      return {
        text: data.text,
        confidence,
        words: data.words,
        lines: data.lines,
        paragraphs: data.paragraphs
      };
    } catch (error) {
      throw new Error(`OCR processing failed: ${error.message}`);
    }
  }

  // Extract structured data from OCR text
  async extractStructuredData(text, documentType) {
    const structuredData = {
      documentType: documentType || 'unknown',
      extractedFields: {},
      medicalCodes: [],
      dates: [],
      amounts: [],
      identifiers: []
    };
    
    // Extract common medical document fields
    structuredData.extractedFields = {
      ...this.extractPatientInfo(text),
      ...this.extractProviderInfo(text),
      ...this.extractInsuranceInfo(text),
      ...this.extractMedicalInfo(text)
    };
    
    // Extract medical codes
    structuredData.medicalCodes = this.extractMedicalCodes(text);
    
    // Extract dates
    structuredData.dates = this.extractDates(text);
    
    // Extract monetary amounts
    structuredData.amounts = this.extractAmounts(text);
    
    // Extract identifiers
    structuredData.identifiers = this.extractIdentifiers(text);
    
    return structuredData;
  }

  // Extract patient information
  extractPatientInfo(text) {
    const patientInfo = {};
    
    // Patient name patterns
    const namePatterns = [
      /patient\s*name[:\s]+([A-Za-z\s,]+)/i,
      /name[:\s]+([A-Za-z\s,]+)/i
    ];
    
    for (const pattern of namePatterns) {
      const match = text.match(pattern);
      if (match) {
        patientInfo.patientName = match[1].trim();
        break;
      }
    }
    
    // Date of birth patterns
    const dobPatterns = [
      /(?:dob|date\s*of\s*birth)[:\s]+(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i,
      /born[:\s]+(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i
    ];
    
    for (const pattern of dobPatterns) {
      const match = text.match(pattern);
      if (match) {
        patientInfo.dateOfBirth = match[1];
        break;
      }
    }
    
    // Medical record number
    const mrnPatterns = [
      /(?:mrn|medical\s*record)[:\s#]+(\w+)/i,
      /record\s*number[:\s#]+(\w+)/i
    ];
    
    for (const pattern of mrnPatterns) {
      const match = text.match(pattern);
      if (match) {
        patientInfo.medicalRecordNumber = match[1];
        break;
      }
    }
    
    return patientInfo;
  }

  // Extract provider information
  extractProviderInfo(text) {
    const providerInfo = {};
    
    // Provider name patterns
    const providerPatterns = [
      /(?:provider|physician|doctor)[:\s]+([A-Za-z\s,\.]+)/i,
      /dr\.?\s+([A-Za-z\s,\.]+)/i
    ];
    
    for (const pattern of providerPatterns) {
      const match = text.match(pattern);
      if (match) {
        providerInfo.providerName = match[1].trim();
        break;
      }
    }
    
    // NPI patterns
    const npiPatterns = [
      /npi[:\s#]+(\d{10})/i,
      /provider\s*id[:\s#]+(\d{10})/i
    ];
    
    for (const pattern of npiPatterns) {
      const match = text.match(pattern);
      if (match) {
        providerInfo.npi = match[1];
        break;
      }
    }
    
    return providerInfo;
  }

  // Extract insurance information
  extractInsuranceInfo(text) {
    const insuranceInfo = {};
    
    // Insurance company patterns
    const insurancePatterns = [
      /insurance[:\s]+([A-Za-z\s&,\.]+)/i,
      /payer[:\s]+([A-Za-z\s&,\.]+)/i
    ];
    
    for (const pattern of insurancePatterns) {
      const match = text.match(pattern);
      if (match) {
        insuranceInfo.insuranceCompany = match[1].trim();
        break;
      }
    }
    
    // Policy number patterns
    const policyPatterns = [
      /policy[:\s#]+(\w+)/i,
      /member\s*id[:\s#]+(\w+)/i
    ];
    
    for (const pattern of policyPatterns) {
      const match = text.match(pattern);
      if (match) {
        insuranceInfo.policyNumber = match[1];
        break;
      }
    }
    
    return insuranceInfo;
  }

  // Extract medical information
  extractMedicalInfo(text) {
    const medicalInfo = {};
    
    // Diagnosis patterns
    const diagnosisPatterns = [
      /diagnosis[:\s]+([A-Za-z\s,\.\-]+)/i,
      /condition[:\s]+([A-Za-z\s,\.\-]+)/i
    ];
    
    for (const pattern of diagnosisPatterns) {
      const match = text.match(pattern);
      if (match) {
        medicalInfo.diagnosis = match[1].trim();
        break;
      }
    }
    
    // Procedure patterns
    const procedurePatterns = [
      /procedure[:\s]+([A-Za-z\s,\.\-]+)/i,
      /treatment[:\s]+([A-Za-z\s,\.\-]+)/i
    ];
    
    for (const pattern of procedurePatterns) {
      const match = text.match(pattern);
      if (match) {
        medicalInfo.procedure = match[1].trim();
        break;
      }
    }
    
    return medicalInfo;
  }

  // Extract medical codes (ICD-10, CPT, HCPCS)
  extractMedicalCodes(text) {
    const codes = [];
    
    // ICD-10 codes
    const icd10Matches = text.match(/[A-Z]\d{2}(?:\.\d{1,4})?/g) || [];
    icd10Matches.forEach(code => {
      codes.push({ type: 'ICD-10', code: code.trim() });
    });
    
    // CPT codes
    const cptMatches = text.match(/\b\d{5}\b/g) || [];
    cptMatches.forEach(code => {
      codes.push({ type: 'CPT', code: code.trim() });
    });
    
    // HCPCS codes
    const hcpcsMatches = text.match(/[A-Z]\d{4}/g) || [];
    hcpcsMatches.forEach(code => {
      codes.push({ type: 'HCPCS', code: code.trim() });
    });
    
    return codes;
  }

  // Extract dates
  extractDates(text) {
    const datePatterns = [
      /\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/g,
      /\d{4}-\d{2}-\d{2}/g,
      /(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},?\s+\d{4}/gi
    ];
    
    const dates = [];
    datePatterns.forEach(pattern => {
      const matches = text.match(pattern) || [];
      dates.push(...matches);
    });
    
    return [...new Set(dates)]; // Remove duplicates
  }

  // Extract monetary amounts
  extractAmounts(text) {
    const amountPattern = /\$[\d,]+(?:\.\d{2})?/g;
    const matches = text.match(amountPattern) || [];
    return matches.map(amount => amount.replace(/[,$]/g, ''));
  }

  // Extract identifiers (SSN, phone numbers, etc.)
  extractIdentifiers(text) {
    const identifiers = [];
    
    // SSN patterns
    const ssnMatches = text.match(/\d{3}-\d{2}-\d{4}/g) || [];
    ssnMatches.forEach(ssn => {
      identifiers.push({ type: 'SSN', value: ssn });
    });
    
    // Phone number patterns
    const phoneMatches = text.match(/\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g) || [];
    phoneMatches.forEach(phone => {
      identifiers.push({ type: 'Phone', value: phone });
    });
    
    return identifiers;
  }

  // Update OCR job with results
  async updateOCRJob(jobId, updates) {
    const fields = [];
    const values = [];
    let paramIndex = 1;
    
    Object.entries(updates).forEach(([key, value]) => {
      const dbKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      fields.push(`${dbKey} = $${paramIndex}`);
      values.push(typeof value === 'object' ? JSON.stringify(value) : value);
      paramIndex++;
    });
    
    if (updates.status === 'completed' || updates.status === 'failed') {
      fields.push(`completed_at = NOW()`);
    }
    
    values.push(jobId);
    
    await this.pool.query(`
      UPDATE ocr_jobs SET ${fields.join(', ')}
      WHERE id = $${paramIndex}
    `, values);
  }

  // Store individual field extractions
  async storeFieldExtractions(jobId, structuredData, words) {
    try {
      // Store extracted fields
      for (const [fieldName, fieldValue] of Object.entries(structuredData.extractedFields)) {
        if (fieldValue) {
          await this.pool.query(`
            INSERT INTO ocr_extractions (job_id, field_name, field_value, confidence_score, extraction_method)
            VALUES ($1, $2, $3, $4, $5)
          `, [jobId, fieldName, fieldValue, 0.8, 'pattern_matching']);
        }
      }
      
      // Store medical codes
      for (const code of structuredData.medicalCodes) {
        await this.pool.query(`
          INSERT INTO ocr_extractions (job_id, field_name, field_value, extraction_method)
          VALUES ($1, $2, $3, $4)
        `, [jobId, `${code.type}_code`, code.code, 'regex_extraction']);
      }
    } catch (error) {
      console.error('Failed to store field extractions:', error);
    }
  }

  // Get OCR job status
  async getJobStatus(jobId) {
    const result = await this.pool.query(
      'SELECT * FROM ocr_jobs WHERE id = $1',
      [jobId]
    );
    
    if (result.rows.length === 0) {
      throw new Error('OCR job not found');
    }
    
    return result.rows[0];
  }

  // Get extracted data for a job
  async getExtractedData(jobId) {
    const jobResult = await this.pool.query(
      'SELECT structured_data, extracted_text, confidence_score FROM ocr_jobs WHERE id = $1',
      [jobId]
    );
    
    if (jobResult.rows.length === 0) {
      throw new Error('OCR job not found');
    }
    
    const extractionsResult = await this.pool.query(
      'SELECT field_name, field_value, confidence_score FROM ocr_extractions WHERE job_id = $1',
      [jobId]
    );
    
    return {
      ...jobResult.rows[0],
      fieldExtractions: extractionsResult.rows
    };
  }

  // Batch process multiple documents
  async batchProcess(filePaths, options = {}) {
    const results = [];
    const batchSize = options.batchSize || 5;
    
    for (let i = 0; i < filePaths.length; i += batchSize) {
      const batch = filePaths.slice(i, i + batchSize);
      const batchPromises = batch.map(filePath => 
        this.processDocument(filePath, options).catch(error => ({ error: error.message, filePath }))
      );
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }
    
    return results;
  }

  // Get processing statistics
  async getProcessingStats(startDate, endDate) {
    const result = await this.pool.query(`
      SELECT 
        COUNT(*) as total_jobs,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_jobs,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_jobs,
        AVG(confidence_score) as avg_confidence,
        AVG(processing_time) as avg_processing_time
      FROM ocr_jobs
      WHERE created_at BETWEEN $1 AND $2
    `, [startDate, endDate]);
    
    return result.rows[0];
  }
}

module.exports = OCRService;