/**
 * Password Policy Configuration
 * Implements HIPAA-compliant password requirements and security policies
 */

const passwordPolicy = {
  // Basic password requirements
  requirements: {
    minLength: 12,
    maxLength: 128,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSpecialChars: true,
    minSpecialChars: 1,
    minNumbers: 1,
    minUppercase: 1,
    minLowercase: 1
  },

  // Advanced security rules
  security: {
    // Prevent common patterns
    preventCommonPatterns: true,
    preventSequentialChars: true,
    preventRepeatedChars: true,
    preventKeyboardPatterns: true,
    preventDictionaryWords: true,
    
    // Character repetition limits
    maxRepeatedChars: 2,
    maxSequentialChars: 3,
    
    // Personal information restrictions
    preventPersonalInfo: true,
    preventCompanyInfo: true,
    
    // Password history
    preventReuse: true,
    historyCount: 12, // Remember last 12 passwords
    
    // Expiration settings
    maxAge: 90, // days
    warnBeforeExpiry: 14, // days
    graceLogins: 3 // logins allowed after expiry
  },

  // Account lockout policy
  lockout: {
    enabled: true,
    maxFailedAttempts: 5,
    lockoutDuration: 15, // minutes
    progressiveLockout: true,
    lockoutMultiplier: 2, // multiply duration for repeated lockouts
    maxLockoutDuration: 240, // minutes (4 hours)
    resetLockoutAfter: 24 // hours
  },

  // Session security
  session: {
    maxConcurrentSessions: 3,
    sessionTimeout: 30, // minutes of inactivity
    absoluteTimeout: 480, // minutes (8 hours)
    requireReauthForSensitive: true,
    reauthTimeout: 15 // minutes
  },

  // Two-factor authentication
  twoFactor: {
    required: true,
    requiredForRoles: ['admin', 'practice_admin'],
    optionalForRoles: ['provider', 'staff'],
    backupCodes: {
      enabled: true,
      count: 10,
      singleUse: true
    },
    methods: {
      totp: { enabled: true, window: 1 },
      sms: { enabled: false }, // Disabled for HIPAA compliance
      email: { enabled: false }, // Disabled for HIPAA compliance
      hardware: { enabled: true }
    }
  },

  // Compliance settings
  compliance: {
    hipaa: {
      enabled: true,
      auditAllAccess: true,
      encryptPasswords: true,
      requireStrongAuth: true
    },
    pci: {
      enabled: false // Not applicable for healthcare
    }
  },

  // Password strength scoring
  scoring: {
    minScore: 3, // out of 5
    factors: {
      length: { weight: 0.25, maxPoints: 20 },
      complexity: { weight: 0.25, maxPoints: 20 },
      uniqueness: { weight: 0.20, maxPoints: 20 },
      unpredictability: { weight: 0.20, maxPoints: 20 },
      entropy: { weight: 0.10, maxPoints: 20 }
    }
  },

  // Common patterns to reject
  rejectedPatterns: [
    // Sequential patterns
    /(?:abc|bcd|cde|def|efg|fgh|ghi|hij|ijk|jkl|klm|lmn|mno|nop|opq|pqr|qrs|rst|stu|tuv|uvw|vwx|wxy|xyz)/i,
    /(?:123|234|345|456|567|678|789|890)/,
    /(?:qwe|wer|ert|rty|tyu|yui|uio|iop|asd|sdf|dfg|fgh|ghj|hjk|jkl|zxc|xcv|cvb|vbn|bnm)/i,
    
    // Repeated patterns
    /(.)\1{2,}/, // 3 or more repeated characters
    /(..).*\1/, // Repeated pairs
    /(...).*\1/, // Repeated triplets
    
    // Common weak patterns
    /^password/i,
    /^admin/i,
    /^user/i,
    /^test/i,
    /^temp/i,
    /^guest/i,
    /^demo/i,
    
    // Date patterns
    /\d{4}[-\/]\d{2}[-\/]\d{2}/, // YYYY-MM-DD or YYYY/MM/DD
    /\d{2}[-\/]\d{2}[-\/]\d{4}/, // MM-DD-YYYY or MM/DD/YYYY
    
    // Phone number patterns
    /\d{3}[-.]?\d{3}[-.]?\d{4}/, // XXX-XXX-XXXX
    
    // SSN patterns
    /\d{3}[-.]?\d{2}[-.]?\d{4}/ // XXX-XX-XXXX
  ],

  // Common dictionary words to reject (subset)
  commonWords: [
    'password', 'admin', 'administrator', 'user', 'guest', 'test', 'temp',
    'welcome', 'login', 'access', 'system', 'database', 'server', 'network',
    'security', 'private', 'confidential', 'secret', 'hidden', 'protected',
    'healthcare', 'medical', 'patient', 'doctor', 'nurse', 'hospital',
    'clinic', 'practice', 'hipaa', 'phi', 'health', 'care', 'treatment',
    'diagnosis', 'prescription', 'medicine', 'therapy', 'surgery'
  ],

  // Company/domain specific words to reject
  companyWords: [
    'claimflow', 'claim', 'flow', 'ai', 'artificial', 'intelligence',
    'authorization', 'prior', 'auth', 'insurance', 'claim', 'billing'
  ],

  // Error messages
  messages: {
    tooShort: `Password must be at least {minLength} characters long`,
    tooLong: `Password must not exceed {maxLength} characters`,
    missingUppercase: 'Password must contain at least {minUppercase} uppercase letter(s)',
    missingLowercase: 'Password must contain at least {minLowercase} lowercase letter(s)',
    missingNumbers: 'Password must contain at least {minNumbers} number(s)',
    missingSpecialChars: 'Password must contain at least {minSpecialChars} special character(s)',
    repeatedChars: 'Password contains too many repeated characters',
    sequentialChars: 'Password contains sequential characters',
    commonPattern: 'Password contains a common pattern',
    dictionaryWord: 'Password contains a dictionary word',
    personalInfo: 'Password contains personal information',
    companyInfo: 'Password contains company-related information',
    previouslyUsed: 'Password has been used recently',
    weakScore: 'Password is not strong enough (minimum score: {minScore}/5)',
    keyboardPattern: 'Password contains keyboard patterns'
  }
};

/**
 * Special characters allowed in passwords
 */
passwordPolicy.allowedSpecialChars = '!@#$%^&*()_+-=[]{}|;:,.<>?';

/**
 * Get password requirements as a human-readable string
 */
passwordPolicy.getRequirementsText = function() {
  const req = this.requirements;
  return [
    `At least ${req.minLength} characters long`,
    req.requireUppercase ? `At least ${req.minUppercase} uppercase letter(s)` : null,
    req.requireLowercase ? `At least ${req.minLowercase} lowercase letter(s)` : null,
    req.requireNumbers ? `At least ${req.minNumbers} number(s)` : null,
    req.requireSpecialChars ? `At least ${req.minSpecialChars} special character(s) (${this.allowedSpecialChars})` : null,
    'No common patterns or dictionary words',
    'No personal or company information',
    'Different from your last 12 passwords'
  ].filter(Boolean);
};

/**
 * Get role-specific requirements
 */
passwordPolicy.getRoleRequirements = function(role) {
  const baseRequirements = { ...this.requirements };
  
  // Enhanced requirements for admin roles
  if (['admin', 'practice_admin'].includes(role)) {
    baseRequirements.minLength = Math.max(baseRequirements.minLength, 14);
    baseRequirements.minSpecialChars = Math.max(baseRequirements.minSpecialChars, 2);
    baseRequirements.minNumbers = Math.max(baseRequirements.minNumbers, 2);
  }
  
  return baseRequirements;
};

/**
 * Check if 2FA is required for a role
 */
passwordPolicy.is2FARequired = function(role) {
  return this.twoFactor.required || this.twoFactor.requiredForRoles.includes(role);
};

/**
 * Get lockout settings based on user history
 */
passwordPolicy.getLockoutDuration = function(previousLockouts = 0) {
  if (!this.lockout.progressiveLockout) {
    return this.lockout.lockoutDuration;
  }
  
  const baseDuration = this.lockout.lockoutDuration;
  const multiplier = Math.pow(this.lockout.lockoutMultiplier, previousLockouts);
  const calculatedDuration = baseDuration * multiplier;
  
  return Math.min(calculatedDuration, this.lockout.maxLockoutDuration);
};

module.exports = passwordPolicy;