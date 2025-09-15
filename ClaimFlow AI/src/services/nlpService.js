const natural = require('natural');
const compromise = require('compromise');
const { pool } = require('../database/connection');
const fs = require('fs').promises;

class NLPService {
  constructor(dbPool) {
    this.pool = dbPool || pool;
    
    // Initialize NLP components
    this.tokenizer = new natural.WordTokenizer();
    this.stemmer = natural.PorterStemmer;
    this.sentiment = new natural.SentimentAnalyzer('English', natural.PorterStemmer, 'afinn');
    
    // Medical terminology and patterns
    this.medicalEntities = {
      symptoms: [
        'pain', 'fever', 'nausea', 'headache', 'fatigue', 'dizziness', 'shortness of breath',
        'chest pain', 'abdominal pain', 'back pain', 'joint pain', 'muscle pain',
        'cough', 'sore throat', 'runny nose', 'congestion', 'vomiting', 'diarrhea'
      ],
      medications: [
        'aspirin', 'ibuprofen', 'acetaminophen', 'lisinopril', 'metformin', 'atorvastatin',
        'amlodipine', 'metoprolol', 'omeprazole', 'losartan', 'hydrochlorothiazide',
        'gabapentin', 'levothyroxine', 'prednisone', 'amoxicillin', 'azithromycin'
      ],
      procedures: [
        'surgery', 'biopsy', 'endoscopy', 'colonoscopy', 'mammography', 'ultrasound',
        'CT scan', 'MRI', 'X-ray', 'blood test', 'urine test', 'ECG', 'EKG',
        'physical therapy', 'chemotherapy', 'radiation therapy', 'dialysis'
      ],
      bodyParts: [
        'head', 'neck', 'chest', 'abdomen', 'back', 'arm', 'leg', 'hand', 'foot',
        'heart', 'lung', 'liver', 'kidney', 'brain', 'spine', 'knee', 'shoulder',
        'hip', 'ankle', 'wrist', 'elbow', 'eye', 'ear', 'nose', 'throat'
      ],
      conditions: [
        'diabetes', 'hypertension', 'asthma', 'copd', 'depression', 'anxiety',
        'arthritis', 'osteoporosis', 'cancer', 'heart disease', 'stroke',
        'pneumonia', 'bronchitis', 'sinusitis', 'migraine', 'epilepsy'
      ]
    };
    
    // Clinical patterns for extraction
    this.clinicalPatterns = {
      diagnosis: [
        /(?:diagnosis|diagnosed with|condition)[:\s]+([^.\n]+)/gi,
        /(?:patient has|patient presents with)[:\s]+([^.\n]+)/gi,
        /(?:impression|assessment)[:\s]+([^.\n]+)/gi
      ],
      symptoms: [
        /(?:symptoms?|complaints?|presents? with)[:\s]+([^.\n]+)/gi,
        /(?:patient reports?|patient states?)[:\s]+([^.\n]+)/gi,
        /(?:chief complaint)[:\s]+([^.\n]+)/gi
      ],
      medications: [
        /(?:medications?|drugs?|prescriptions?)[:\s]+([^.\n]+)/gi,
        /(?:taking|prescribed|on)[:\s]+([^.\n]+)(?:mg|mcg|g|ml|tablets?|capsules?)/gi,
        /(?:rx|prescription)[:\s]+([^.\n]+)/gi
      ],
      procedures: [
        /(?:procedures?|surgery|operation)[:\s]+([^.\n]+)/gi,
        /(?:performed|underwent|scheduled for)[:\s]+([^.\n]+)/gi
      ],
      vitals: [
        /(?:blood pressure|bp)[:\s]+(\d+\/\d+)/gi,
        /(?:heart rate|hr|pulse)[:\s]+(\d+)/gi,
        /(?:temperature|temp)[:\s]+(\d+\.?\d*)/gi,
        /(?:weight)[:\s]+(\d+(?:\.\d+)?\s*(?:lbs?|kg))/gi,
        /(?:height)[:\s]+(\d+(?:'\d+"|ft\s*\d+\s*in|cm))/gi
      ],
      allergies: [
        /(?:allergies?|allergic to)[:\s]+([^.\n]+)/gi,
        /(?:nkda|no known drug allergies)/gi
      ],
      timeline: [
        /(?:since|for the past|over the last)[:\s]+([^.\n]+)/gi,
        /(?:started|began|onset)[:\s]+([^.\n]+)/gi,
        /(?:duration)[:\s]+([^.\n]+)/gi
      ]
    };
    
    // Severity indicators
    this.severityKeywords = {
      mild: ['mild', 'slight', 'minor', 'minimal', 'low-grade'],
      moderate: ['moderate', 'medium', 'average', 'typical'],
      severe: ['severe', 'intense', 'extreme', 'acute', 'critical', 'emergency']
    };
    
    // Negation patterns
    this.negationPatterns = [
      /no\s+(?:evidence\s+of|signs?\s+of|history\s+of)?/gi,
      /denies?/gi,
      /negative\s+for/gi,
      /absent/gi,
      /not\s+present/gi,
      /unremarkable/gi
    ];
  }

  // Initialize NLP service
  async initialize() {
    try {
      await this.createNLPTables();
      await this.loadMedicalDictionaries();
      console.log('NLP service initialized successfully');
    } catch (error) {
      console.error('Failed to initialize NLP service:', error);
      throw error;
    }
  }

  // Create necessary database tables
  async createNLPTables() {
    const queries = [
      `CREATE TABLE IF NOT EXISTS nlp_extractions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        document_id INTEGER,
        text_input TEXT NOT NULL,
        extracted_entities TEXT,
        clinical_data TEXT,
        sentiment_analysis TEXT,
        confidence_scores TEXT,
        processing_time INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      
      `CREATE TABLE IF NOT EXISTS medical_entities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        extraction_id INTEGER REFERENCES nlp_extractions(id),
        entity_type VARCHAR(50) NOT NULL,
        entity_value TEXT NOT NULL,
        confidence_score DECIMAL(3,2),
        start_position INTEGER,
        end_position INTEGER,
        context TEXT,
        is_negated BOOLEAN DEFAULT FALSE
      )`,
      
      `CREATE TABLE IF NOT EXISTS clinical_relationships (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        extraction_id INTEGER REFERENCES nlp_extractions(id),
        subject_entity INTEGER REFERENCES medical_entities(id),
        relationship_type VARCHAR(50),
        object_entity INTEGER REFERENCES medical_entities(id),
        confidence_score DECIMAL(3,2)
      )`,
      
      `CREATE TABLE IF NOT EXISTS medical_dictionary (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        term VARCHAR(255) NOT NULL,
        category VARCHAR(50) NOT NULL,
        synonyms TEXT,
        icd_codes TEXT,
        cpt_codes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`
    ];

    for (const query of queries) {
      await this.pool.query(query);
    }

    // Create indexes
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_nlp_extractions_document_id ON nlp_extractions(document_id)',
      'CREATE INDEX IF NOT EXISTS idx_medical_entities_type ON medical_entities(entity_type)',
      'CREATE INDEX IF NOT EXISTS idx_medical_entities_extraction_id ON medical_entities(extraction_id)',
      'CREATE INDEX IF NOT EXISTS idx_medical_dictionary_term ON medical_dictionary(term)',
      'CREATE INDEX IF NOT EXISTS idx_medical_dictionary_category ON medical_dictionary(category)'
    ];

    for (const index of indexes) {
      await this.pool.query(index);
    }
  }

  // Load medical dictionaries and terminology
  async loadMedicalDictionaries() {
    try {
      // Load basic medical terms into dictionary
      for (const [category, terms] of Object.entries(this.medicalEntities)) {
        for (const term of terms) {
          await this.pool.query(`
            INSERT OR IGNORE INTO medical_dictionary (term, category)
            VALUES (?, ?)
          `, [term, category]);
        }
      }
    } catch (error) {
      console.error('Failed to load medical dictionaries:', error);
    }
  }

  // Process clinical text and extract structured data
  async processText(text, options = {}) {
    const startTime = Date.now();
    
    try {
      // Preprocess text
      const cleanedText = this.preprocessText(text);
      
      // Extract entities
      const entities = await this.extractEntities(cleanedText);
      
      // Extract clinical data using patterns
      const clinicalData = this.extractClinicalData(cleanedText);
      
      // Perform sentiment analysis
      const sentimentAnalysis = this.analyzeSentiment(cleanedText);
      
      // Extract relationships between entities
      const relationships = this.extractRelationships(entities, cleanedText);
      
      // Calculate confidence scores
      const confidenceScores = this.calculateConfidenceScores(entities, clinicalData);
      
      // Structure the results
      const results = {
        entities,
        clinicalData,
        relationships,
        sentimentAnalysis,
        confidenceScores,
        processingTime: Date.now() - startTime
      };
      
      // Store results in database
      const extractionId = await this.storeExtractionResults(text, results, options.documentId);
      
      return {
        extractionId,
        ...results
      };
    } catch (error) {
      console.error('NLP processing failed:', error);
      throw error;
    }
  }

  // Preprocess text for better NLP accuracy
  preprocessText(text) {
    // Remove extra whitespace and normalize
    let cleaned = text.replace(/\s+/g, ' ').trim();
    
    // Normalize medical abbreviations
    const abbreviations = {
      'w/': 'with',
      'w/o': 'without',
      'h/o': 'history of',
      'c/o': 'complains of',
      'r/o': 'rule out',
      'pt': 'patient',
      'pts': 'patients',
      'dx': 'diagnosis',
      'tx': 'treatment',
      'rx': 'prescription',
      'hx': 'history',
      'sx': 'symptoms',
      'fx': 'fracture'
    };
    
    for (const [abbr, full] of Object.entries(abbreviations)) {
      const regex = new RegExp(`\\b${abbr}\\b`, 'gi');
      cleaned = cleaned.replace(regex, full);
    }
    
    return cleaned;
  }

  // Extract medical entities from text
  async extractEntities(text) {
    const entities = {
      symptoms: [],
      medications: [],
      procedures: [],
      conditions: [],
      bodyParts: [],
      vitals: [],
      allergies: [],
      timeline: []
    };
    
    // Use compromise.js for basic NLP processing
    const doc = compromise(text);
    
    // Extract entities by category
    for (const [category, terms] of Object.entries(this.medicalEntities)) {
      for (const term of terms) {
        const matches = doc.match(term);
        if (matches.found) {
          matches.forEach(match => {
            const context = this.getContext(text, match.text());
            const isNegated = this.checkNegation(context);
            
            entities[category].push({
              text: match.text(),
              confidence: 0.8,
              context,
              isNegated,
              position: text.indexOf(match.text())
            });
          });
        }
      }
    }
    
    // Extract using clinical patterns
    for (const [category, patterns] of Object.entries(this.clinicalPatterns)) {
      if (!entities[category]) entities[category] = [];
      
      for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(text)) !== null) {
          const extractedText = match[1].trim();
          const context = this.getContext(text, extractedText);
          const isNegated = this.checkNegation(context);
          
          entities[category].push({
            text: extractedText,
            confidence: 0.7,
            context,
            isNegated,
            position: match.index
          });
        }
      }
    }
    
    // Remove duplicates and sort by confidence
    for (const category of Object.keys(entities)) {
      entities[category] = this.removeDuplicateEntities(entities[category]);
    }
    
    return entities;
  }

  // Extract structured clinical data
  extractClinicalData(text) {
    const clinicalData = {
      chiefComplaint: null,
      historyOfPresentIllness: null,
      pastMedicalHistory: null,
      medications: [],
      allergies: [],
      socialHistory: null,
      familyHistory: null,
      reviewOfSystems: null,
      physicalExam: null,
      assessment: null,
      plan: null,
      vitals: {}
    };
    
    // Extract chief complaint
    const ccPatterns = [
      /chief\s+complaint[:\s]+([^.\n]+)/gi,
      /cc[:\s]+([^.\n]+)/gi,
      /presenting\s+complaint[:\s]+([^.\n]+)/gi
    ];
    
    for (const pattern of ccPatterns) {
      const match = text.match(pattern);
      if (match) {
        clinicalData.chiefComplaint = match[1].trim();
        break;
      }
    }
    
    // Extract history of present illness
    const hpiPatterns = [
      /history\s+of\s+present\s+illness[:\s]+([^\n]+(?:\n[^\n]+)*?)(?=\n\s*[A-Z]|$)/gi,
      /hpi[:\s]+([^\n]+(?:\n[^\n]+)*?)(?=\n\s*[A-Z]|$)/gi
    ];
    
    for (const pattern of hpiPatterns) {
      const match = text.match(pattern);
      if (match) {
        clinicalData.historyOfPresentIllness = match[1].trim();
        break;
      }
    }
    
    // Extract vital signs
    const vitalPatterns = {
      bloodPressure: /(?:bp|blood\s+pressure)[:\s]+(\d+\/\d+)/gi,
      heartRate: /(?:hr|heart\s+rate|pulse)[:\s]+(\d+)/gi,
      temperature: /(?:temp|temperature)[:\s]+(\d+\.?\d*)/gi,
      respiratoryRate: /(?:rr|respiratory\s+rate)[:\s]+(\d+)/gi,
      oxygenSaturation: /(?:o2\s+sat|oxygen\s+saturation)[:\s]+(\d+)%?/gi,
      weight: /weight[:\s]+(\d+(?:\.\d+)?\s*(?:lbs?|kg))/gi,
      height: /height[:\s]+(\d+(?:'\d+"|ft\s*\d+\s*in|cm))/gi
    };
    
    for (const [vital, pattern] of Object.entries(vitalPatterns)) {
      const match = text.match(pattern);
      if (match) {
        clinicalData.vitals[vital] = match[1];
      }
    }
    
    // Extract medications
    const medicationPattern = /(?:medications?|drugs?)[:\s]+([^\n]+(?:\n\s*-[^\n]+)*)/gi;
    const medMatch = text.match(medicationPattern);
    if (medMatch) {
      const medText = medMatch[1];
      const medications = medText.split(/[,;\n]/).map(med => med.trim()).filter(med => med.length > 0);
      clinicalData.medications = medications;
    }
    
    // Extract allergies
    const allergyPattern = /(?:allergies?|allergic\s+to)[:\s]+([^\n]+)/gi;
    const allergyMatch = text.match(allergyPattern);
    if (allergyMatch) {
      const allergyText = allergyMatch[1];
      if (allergyText.toLowerCase().includes('nkda') || allergyText.toLowerCase().includes('no known')) {
        clinicalData.allergies = ['NKDA'];
      } else {
        clinicalData.allergies = allergyText.split(/[,;]/).map(allergy => allergy.trim()).filter(allergy => allergy.length > 0);
      }
    }
    
    // Extract assessment and plan
    const assessmentPattern = /(?:assessment|impression)[:\s]+([^\n]+(?:\n[^\n]+)*?)(?=\n\s*(?:plan|$))/gi;
    const assessmentMatch = text.match(assessmentPattern);
    if (assessmentMatch) {
      clinicalData.assessment = assessmentMatch[1].trim();
    }
    
    const planPattern = /plan[:\s]+([^\n]+(?:\n[^\n]+)*?)(?=\n\s*[A-Z]|$)/gi;
    const planMatch = text.match(planPattern);
    if (planMatch) {
      clinicalData.plan = planMatch[1].trim();
    }
    
    return clinicalData;
  }

  // Analyze sentiment of clinical text
  analyzeSentiment(text) {
    const tokens = this.tokenizer.tokenize(text.toLowerCase());
    const stemmedTokens = tokens.map(token => this.stemmer.stem(token));
    
    // Calculate sentiment score
    const sentimentScore = this.sentiment.getSentiment(stemmedTokens);
    
    // Determine overall sentiment
    let sentiment = 'neutral';
    if (sentimentScore > 0.1) sentiment = 'positive';
    else if (sentimentScore < -0.1) sentiment = 'negative';
    
    // Analyze severity indicators
    const severity = this.analyzeSeverity(text);
    
    // Analyze urgency indicators
    const urgency = this.analyzeUrgency(text);
    
    return {
      score: sentimentScore,
      sentiment,
      severity,
      urgency,
      confidence: Math.abs(sentimentScore)
    };
  }

  // Analyze severity from text
  analyzeSeverity(text) {
    const lowerText = text.toLowerCase();
    
    for (const [level, keywords] of Object.entries(this.severityKeywords)) {
      for (const keyword of keywords) {
        if (lowerText.includes(keyword)) {
          return level;
        }
      }
    }
    
    return 'unknown';
  }

  // Analyze urgency indicators
  analyzeUrgency(text) {
    const urgencyKeywords = {
      emergency: ['emergency', 'urgent', 'stat', 'immediate', 'critical', 'acute'],
      routine: ['routine', 'scheduled', 'elective', 'follow-up', 'regular']
    };
    
    const lowerText = text.toLowerCase();
    
    for (const [level, keywords] of Object.entries(urgencyKeywords)) {
      for (const keyword of keywords) {
        if (lowerText.includes(keyword)) {
          return level;
        }
      }
    }
    
    return 'normal';
  }

  // Extract relationships between entities
  extractRelationships(entities, text) {
    const relationships = [];
    
    // Find relationships between symptoms and body parts
    for (const symptom of entities.symptoms || []) {
      for (const bodyPart of entities.bodyParts || []) {
        const distance = Math.abs(symptom.position - bodyPart.position);
        if (distance < 100) { // Within 100 characters
          relationships.push({
            subject: symptom.text,
            relationship: 'affects',
            object: bodyPart.text,
            confidence: Math.max(0.3, 1 - distance / 100)
          });
        }
      }
    }
    
    // Find relationships between medications and conditions
    for (const medication of entities.medications || []) {
      for (const condition of entities.conditions || []) {
        const distance = Math.abs(medication.position - condition.position);
        if (distance < 150) {
          relationships.push({
            subject: medication.text,
            relationship: 'treats',
            object: condition.text,
            confidence: Math.max(0.3, 1 - distance / 150)
          });
        }
      }
    }
    
    return relationships;
  }

  // Calculate confidence scores for extractions
  calculateConfidenceScores(entities, clinicalData) {
    const scores = {
      overall: 0,
      entities: {},
      clinicalData: {}
    };
    
    // Calculate entity confidence scores
    let totalEntityConfidence = 0;
    let entityCount = 0;
    
    for (const [category, entityList] of Object.entries(entities)) {
      if (entityList.length > 0) {
        const avgConfidence = entityList.reduce((sum, entity) => sum + entity.confidence, 0) / entityList.length;
        scores.entities[category] = avgConfidence;
        totalEntityConfidence += avgConfidence;
        entityCount++;
      }
    }
    
    // Calculate clinical data confidence scores
    const clinicalFields = ['chiefComplaint', 'assessment', 'plan', 'medications', 'allergies'];
    let clinicalDataScore = 0;
    let clinicalFieldCount = 0;
    
    for (const field of clinicalFields) {
      if (clinicalData[field] && clinicalData[field] !== null) {
        const fieldScore = field === 'medications' || field === 'allergies' 
          ? (clinicalData[field].length > 0 ? 0.8 : 0.2)
          : 0.7;
        scores.clinicalData[field] = fieldScore;
        clinicalDataScore += fieldScore;
        clinicalFieldCount++;
      }
    }
    
    // Calculate overall confidence
    const entityAvg = entityCount > 0 ? totalEntityConfidence / entityCount : 0;
    const clinicalAvg = clinicalFieldCount > 0 ? clinicalDataScore / clinicalFieldCount : 0;
    scores.overall = (entityAvg + clinicalAvg) / 2;
    
    return scores;
  }

  // Get context around a matched entity
  getContext(text, entityText, contextSize = 50) {
    const index = text.indexOf(entityText);
    if (index === -1) return '';
    
    const start = Math.max(0, index - contextSize);
    const end = Math.min(text.length, index + entityText.length + contextSize);
    
    return text.substring(start, end);
  }

  // Check if an entity is negated
  checkNegation(context) {
    const lowerContext = context.toLowerCase();
    
    for (const pattern of this.negationPatterns) {
      if (pattern.test(lowerContext)) {
        return true;
      }
    }
    
    return false;
  }

  // Remove duplicate entities
  removeDuplicateEntities(entities) {
    const seen = new Set();
    return entities.filter(entity => {
      const key = entity.text.toLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    }).sort((a, b) => b.confidence - a.confidence);
  }

  // Store extraction results in database
  async storeExtractionResults(textInput, results, documentId) {
    try {
      // Store main extraction record
      const extractionResult = await this.pool.query(`
        INSERT INTO nlp_extractions (
          document_id, text_input, extracted_entities, clinical_data, 
          sentiment_analysis, confidence_scores, processing_time
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
        RETURNING id
      `, [
        documentId,
        textInput,
        JSON.stringify(results.entities),
        JSON.stringify(results.clinicalData),
        JSON.stringify(results.sentimentAnalysis),
        JSON.stringify(results.confidenceScores),
        results.processingTime
      ]);
      
      const extractionId = extractionResult.rows[0].id;
      
      // Store individual entities
      for (const [entityType, entityList] of Object.entries(results.entities)) {
        for (const entity of entityList) {
          await this.pool.query(`
            INSERT INTO medical_entities (
              extraction_id, entity_type, entity_value, confidence_score,
              start_position, context, is_negated
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `, [
            extractionId,
            entityType,
            entity.text,
            entity.confidence,
            entity.position,
            entity.context,
            entity.isNegated
          ]);
        }
      }
      
      // Store relationships
      for (const relationship of results.relationships) {
        // This would require more complex logic to link to entity IDs
        // For now, we'll store as JSON in the main record
      }
      
      return extractionId;
    } catch (error) {
      console.error('Failed to store extraction results:', error);
      throw error;
    }
  }

  // Get extraction results by ID
  async getExtractionResults(extractionId) {
    const result = await this.pool.query(
      'SELECT * FROM nlp_extractions WHERE id = $1',
      [extractionId]
    );
    
    if (result.rows.length === 0) {
      throw new Error('Extraction not found');
    }
    
    const extraction = result.rows[0];
    
    // Get associated entities
    const entitiesResult = await this.pool.query(
      'SELECT * FROM medical_entities WHERE extraction_id = $1',
      [extractionId]
    );
    
    return {
      ...extraction,
      entities: entitiesResult.rows
    };
  }

  // Search for similar clinical cases
  async findSimilarCases(entities, limit = 10) {
    // This would implement similarity search based on extracted entities
    // For now, return a placeholder
    return [];
  }

  // Get processing statistics
  async getProcessingStats(startDate, endDate) {
    const result = await this.pool.query(`
      SELECT 
        COUNT(*) as total_extractions,
        AVG(json_extract(confidence_scores, '$.overall')) as avg_confidence,
        AVG(processing_time) as avg_processing_time,
        COUNT(DISTINCT document_id) as unique_documents
      FROM nlp_extractions
      WHERE created_at BETWEEN ? AND ?
    `, [startDate, endDate]);
    
    return result.rows[0];
  }
}

module.exports = NLPService;