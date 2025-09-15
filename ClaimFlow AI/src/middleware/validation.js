const { body, validationResult } = require('express-validator');

/**
 * Middleware to validate input and return errors if validation fails
 * Can be used as middleware directly or as a function that returns middleware
 */
const validateInput = (validationRules) => {
  // If called with validation rules, return middleware function
  if (validationRules && typeof validationRules === 'object') {
    return (req, res, next) => {
      // Simple validation logic for the provided rules
      const errors = [];
      
      for (const [field, rules] of Object.entries(validationRules)) {
        const value = req.body[field];
        
        if (rules.required && (!value || value === '')) {
          errors.push({ field, message: `${field} is required` });
          continue;
        }
        
        if (value && rules.type) {
          if (rules.type === 'string' && typeof value !== 'string') {
            errors.push({ field, message: `${field} must be a string` });
          }
          if (rules.type === 'array' && !Array.isArray(value)) {
            errors.push({ field, message: `${field} must be an array` });
          }
          if (rules.type === 'date' && isNaN(Date.parse(value))) {
            errors.push({ field, message: `${field} must be a valid date` });
          }
        }
        
        if (value && rules.minLength && value.length < rules.minLength) {
          errors.push({ field, message: `${field} must be at least ${rules.minLength} characters` });
        }
        
        if (value && rules.pattern && !rules.pattern.test(value)) {
          errors.push({ field, message: `${field} format is invalid` });
        }
      }
      
      if (errors.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors
        });
      }
      
      next();
    };
  }
  
  // If called as middleware directly (for express-validator)
  return (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }
    next();
  };
};

/**
 * Common validation rules
 */
const validationRules = {
  // User validation
  email: () => body('email').isEmail().normalizeEmail(),
  password: () => body('password').isLength({ min: 8 }).matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/),
  
  // Claim validation
  claimId: () => body('claimId').isUUID(),
  patientId: () => body('patientId').isUUID(),
  providerId: () => body('providerId').isUUID(),
  payerId: () => body('payerId').isUUID(),
  
  // Amount validation
  amount: () => body('amount').isFloat({ min: 0 }),
  
  // Date validation
  date: () => body('date').isISO8601(),
  
  // String validation
  requiredString: (field) => body(field).notEmpty().trim().escape(),
  optionalString: (field) => body(field).optional().trim().escape(),
  
  // Phone validation
  phone: () => body('phone').isMobilePhone(),
  
  // Address validation
  zipCode: () => body('zipCode').isPostalCode('US'),
  state: () => body('state').isLength({ min: 2, max: 2 }).isAlpha(),
  
  // Medical codes
  icd10: () => body('icd10').matches(/^[A-Z]\d{2}(\.\d{1,4})?$/),
  cpt: () => body('cpt').matches(/^\d{5}$/),
  hcpcs: () => body('hcpcs').matches(/^[A-Z]\d{4}$/)
};

/**
 * Predefined validation chains for common operations
 */
const validationChains = {
  // Authentication
  login: [
    validationRules.email(),
    validationRules.requiredString('password')
  ],
  
  register: [
    validationRules.email(),
    validationRules.password(),
    validationRules.requiredString('firstName'),
    validationRules.requiredString('lastName'),
    validationRules.requiredString('role')
  ],
  
  // Claim submission
  submitClaim: [
    validationRules.patientId(),
    validationRules.providerId(),
    validationRules.payerId(),
    validationRules.amount(),
    validationRules.date(),
    validationRules.requiredString('serviceDescription'),
    validationRules.cpt()
  ],
  
  // Patient data
  createPatient: [
    validationRules.requiredString('firstName'),
    validationRules.requiredString('lastName'),
    validationRules.date(),
    validationRules.phone(),
    validationRules.email(),
    validationRules.requiredString('address'),
    validationRules.requiredString('city'),
    validationRules.state(),
    validationRules.zipCode()
  ]
};

module.exports = {
  validateInput,
  validationRules,
  validationChains
};