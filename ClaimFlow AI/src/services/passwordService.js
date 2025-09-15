/**
 * Password Service
 * Comprehensive password validation, scoring, and policy enforcement
 */

const crypto = require('crypto');
const passwordPolicy = require('../config/passwordPolicy');
const { supabase } = require('../database/connection');
const { encryptionService } = require('../utils/encryption');
const { logger } = require('../utils/logger');

class PasswordService {
  constructor() {
    this.policy = passwordPolicy;
  }

  /**
   * Validate password against policy requirements
   * @param {string} password - Password to validate
   * @param {string} userRole - User role for role-specific requirements
   * @param {Object} userInfo - User information for personal info checks
   * @returns {Object} Validation result
   */
  async validatePassword(password, userRole = 'provider', userInfo = {}) {
    const issues = [];
    const warnings = [];
    const requirements = this.policy.getRoleRequirements(userRole);
    
    try {
      // Basic length validation
      if (password.length < requirements.minLength) {
        issues.push(this.formatMessage('tooShort', { minLength: requirements.minLength }));
      }
      
      if (password.length > requirements.maxLength) {
        issues.push(this.formatMessage('tooLong', { maxLength: requirements.maxLength }));
      }

      // Character type validation
      if (requirements.requireUppercase) {
        const uppercaseCount = (password.match(/[A-Z]/g) || []).length;
        if (uppercaseCount < requirements.minUppercase) {
          issues.push(this.formatMessage('missingUppercase', { minUppercase: requirements.minUppercase }));
        }
      }

      if (requirements.requireLowercase) {
        const lowercaseCount = (password.match(/[a-z]/g) || []).length;
        if (lowercaseCount < requirements.minLowercase) {
          issues.push(this.formatMessage('missingLowercase', { minLowercase: requirements.minLowercase }));
        }
      }

      if (requirements.requireNumbers) {
        const numberCount = (password.match(/[0-9]/g) || []).length;
        if (numberCount < requirements.minNumbers) {
          issues.push(this.formatMessage('missingNumbers', { minNumbers: requirements.minNumbers }));
        }
      }

      if (requirements.requireSpecialChars) {
        const specialCharRegex = new RegExp(`[${this.escapeRegex(this.policy.allowedSpecialChars)}]`, 'g');
        const specialCharCount = (password.match(specialCharRegex) || []).length;
        if (specialCharCount < requirements.minSpecialChars) {
          issues.push(this.formatMessage('missingSpecialChars', { minSpecialChars: requirements.minSpecialChars }));
        }
      }

      // Advanced security checks
      if (this.policy.security.preventRepeatedChars) {
        if (this.hasRepeatedChars(password)) {
          issues.push(this.policy.messages.repeatedChars);
        }
      }

      if (this.policy.security.preventSequentialChars) {
        if (this.hasSequentialChars(password)) {
          issues.push(this.policy.messages.sequentialChars);
        }
      }

      if (this.policy.security.preventKeyboardPatterns) {
        if (this.hasKeyboardPatterns(password)) {
          issues.push(this.policy.messages.keyboardPattern);
        }
      }

      if (this.policy.security.preventCommonPatterns) {
        const commonPatternFound = this.policy.rejectedPatterns.some(pattern => pattern.test(password));
        if (commonPatternFound) {
          issues.push(this.policy.messages.commonPattern);
        }
      }

      if (this.policy.security.preventDictionaryWords) {
        if (this.containsDictionaryWords(password)) {
          issues.push(this.policy.messages.dictionaryWord);
        }
      }

      if (this.policy.security.preventPersonalInfo && userInfo) {
        if (this.containsPersonalInfo(password, userInfo)) {
          issues.push(this.policy.messages.personalInfo);
        }
      }

      if (this.policy.security.preventCompanyInfo) {
        if (this.containsCompanyInfo(password)) {
          issues.push(this.policy.messages.companyInfo);
        }
      }

      // Password strength scoring
      const score = this.calculatePasswordScore(password);
      if (score < this.policy.scoring.minScore) {
        issues.push(this.formatMessage('weakScore', { minScore: this.policy.scoring.minScore }));
      }

      // Check password history if user ID provided
      if (userInfo.userId && this.policy.security.preventReuse) {
        const isReused = await this.checkPasswordHistory(password, userInfo.userId);
        if (isReused) {
          issues.push(this.policy.messages.previouslyUsed);
        }
      }

      return {
        isValid: issues.length === 0,
        issues,
        warnings,
        score,
        strength: this.getStrengthLabel(score),
        requirements: this.policy.getRequirementsText()
      };

    } catch (error) {
      logger.error('Password validation error:', error);
      return {
        isValid: false,
        issues: ['Password validation failed'],
        warnings: [],
        score: 0,
        strength: 'Unknown'
      };
    }
  }

  /**
   * Calculate password strength score (0-5)
   */
  calculatePasswordScore(password) {
    let score = 0;
    const factors = this.policy.scoring.factors;

    // Length factor
    const lengthScore = Math.min(password.length / 20, 1) * factors.length.maxPoints;
    score += lengthScore * factors.length.weight;

    // Complexity factor (character types)
    let complexityScore = 0;
    if (/[a-z]/.test(password)) complexityScore += 5;
    if (/[A-Z]/.test(password)) complexityScore += 5;
    if (/[0-9]/.test(password)) complexityScore += 5;
    if (new RegExp(`[${this.escapeRegex(this.policy.allowedSpecialChars)}]`).test(password)) complexityScore += 5;
    score += complexityScore * factors.complexity.weight;

    // Uniqueness factor (no repeated patterns)
    let uniquenessScore = factors.uniqueness.maxPoints;
    if (this.hasRepeatedChars(password)) uniquenessScore -= 5;
    if (this.hasSequentialChars(password)) uniquenessScore -= 5;
    if (this.hasKeyboardPatterns(password)) uniquenessScore -= 5;
    if (this.containsDictionaryWords(password)) uniquenessScore -= 5;
    score += Math.max(0, uniquenessScore) * factors.uniqueness.weight;

    // Unpredictability factor
    let unpredictabilityScore = factors.unpredictability.maxPoints;
    const commonPatternFound = this.policy.rejectedPatterns.some(pattern => pattern.test(password));
    if (commonPatternFound) unpredictabilityScore -= 10;
    score += Math.max(0, unpredictabilityScore) * factors.unpredictability.weight;

    // Entropy factor
    const entropy = this.calculateEntropy(password);
    const entropyScore = Math.min(entropy / 60, 1) * factors.entropy.maxPoints; // 60 bits is good entropy
    score += entropyScore * factors.entropy.weight;

    return Math.round(Math.min(5, Math.max(0, score / 20))); // Scale to 0-5
  }

  /**
   * Calculate password entropy
   */
  calculateEntropy(password) {
    const charSets = {
      lowercase: /[a-z]/.test(password) ? 26 : 0,
      uppercase: /[A-Z]/.test(password) ? 26 : 0,
      numbers: /[0-9]/.test(password) ? 10 : 0,
      special: new RegExp(`[${this.escapeRegex(this.policy.allowedSpecialChars)}]`).test(password) ? this.policy.allowedSpecialChars.length : 0
    };

    const charsetSize = Object.values(charSets).reduce((sum, size) => sum + size, 0);
    return password.length * Math.log2(charsetSize);
  }

  /**
   * Check for repeated characters
   */
  hasRepeatedChars(password) {
    const maxRepeated = this.policy.security.maxRepeatedChars;
    const regex = new RegExp(`(.)\\1{${maxRepeated},}`);
    return regex.test(password);
  }

  /**
   * Check for sequential characters
   */
  hasSequentialChars(password) {
    const maxSequential = this.policy.security.maxSequentialChars;
    const lowerPassword = password.toLowerCase();
    
    for (let i = 0; i <= lowerPassword.length - maxSequential; i++) {
      const substr = lowerPassword.substr(i, maxSequential);
      
      // Check for ascending sequences
      let isAscending = true;
      let isDescending = true;
      
      for (let j = 1; j < substr.length; j++) {
        const currentChar = substr.charCodeAt(j);
        const prevChar = substr.charCodeAt(j - 1);
        
        if (currentChar !== prevChar + 1) isAscending = false;
        if (currentChar !== prevChar - 1) isDescending = false;
      }
      
      if (isAscending || isDescending) return true;
    }
    
    return false;
  }

  /**
   * Check for keyboard patterns
   */
  hasKeyboardPatterns(password) {
    const keyboardRows = [
      'qwertyuiop',
      'asdfghjkl',
      'zxcvbnm',
      '1234567890'
    ];
    
    const lowerPassword = password.toLowerCase();
    
    for (const row of keyboardRows) {
      for (let i = 0; i <= row.length - 3; i++) {
        const pattern = row.substr(i, 3);
        const reversePattern = pattern.split('').reverse().join('');
        
        if (lowerPassword.includes(pattern) || lowerPassword.includes(reversePattern)) {
          return true;
        }
      }
    }
    
    return false;
  }

  /**
   * Check for dictionary words
   */
  containsDictionaryWords(password) {
    const lowerPassword = password.toLowerCase();
    return this.policy.commonWords.some(word => lowerPassword.includes(word.toLowerCase()));
  }

  /**
   * Check for personal information
   */
  containsPersonalInfo(password, userInfo) {
    const lowerPassword = password.toLowerCase();
    const personalFields = ['name', 'email', 'firstName', 'lastName', 'username'];
    
    for (const field of personalFields) {
      if (userInfo[field]) {
        const value = userInfo[field].toLowerCase();
        if (value.length >= 3 && lowerPassword.includes(value)) {
          return true;
        }
        
        // Check parts of email (before @)
        if (field === 'email') {
          const emailPart = value.split('@')[0];
          if (emailPart.length >= 3 && lowerPassword.includes(emailPart)) {
            return true;
          }
        }
      }
    }
    
    return false;
  }

  /**
   * Check for company information
   */
  containsCompanyInfo(password) {
    const lowerPassword = password.toLowerCase();
    return this.policy.companyWords.some(word => lowerPassword.includes(word.toLowerCase()));
  }

  /**
   * Check password against history
   */
  async checkPasswordHistory(password, userId) {
    try {
      const { data: passwordHistory, error } = await supabase
        .from('password_history')
        .select('password_hash')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(this.policy.security.historyCount);

      if (error) {
        logger.error('Error checking password history:', error);
        return false; // Don't block if we can't check history
      }

      if (!passwordHistory || passwordHistory.length === 0) {
        return false;
      }

      // Check if password matches any in history
      for (const historyEntry of passwordHistory) {
        if (encryptionService.verifyPassword(password, historyEntry.password_hash)) {
          return true;
        }
      }

      return false;
    } catch (error) {
      logger.error('Password history check failed:', error);
      return false;
    }
  }

  /**
   * Store password in history
   */
  async storePasswordHistory(userId, passwordHash) {
    try {
      // Add new password to history
      const { error: insertError } = await supabase
        .from('password_history')
        .insert({
          user_id: userId,
          password_hash: passwordHash,
          created_at: new Date().toISOString()
        });

      if (insertError) {
        logger.error('Error storing password history:', insertError);
        return;
      }

      // Clean up old history entries
      const { error: deleteError } = await supabase
        .from('password_history')
        .delete()
        .eq('user_id', userId)
        .not('id', 'in', 
          `(SELECT id FROM password_history WHERE user_id = '${userId}' ORDER BY created_at DESC LIMIT ${this.policy.security.historyCount})`
        );

      if (deleteError) {
        logger.error('Error cleaning password history:', deleteError);
      }
    } catch (error) {
      logger.error('Password history storage failed:', error);
    }
  }

  /**
   * Check if password is expired
   */
  async checkPasswordExpiry(userId) {
    try {
      const { data: user, error } = await supabase
        .from('providers')
        .select('password_changed_at, role')
        .eq('id', userId)
        .single();

      if (error || !user) {
        return { expired: false, daysUntilExpiry: null };
      }

      const passwordChangedAt = new Date(user.password_changed_at || user.created_at);
      const now = new Date();
      const daysSinceChange = Math.floor((now - passwordChangedAt) / (1000 * 60 * 60 * 24));
      const maxAge = this.policy.security.maxAge;
      const daysUntilExpiry = maxAge - daysSinceChange;

      return {
        expired: daysSinceChange >= maxAge,
        daysUntilExpiry,
        warningPeriod: daysUntilExpiry <= this.policy.security.warnBeforeExpiry && daysUntilExpiry > 0
      };
    } catch (error) {
      logger.error('Password expiry check failed:', error);
      return { expired: false, daysUntilExpiry: null };
    }
  }

  /**
   * Generate secure password suggestion
   */
  generateSecurePassword(length = 16, userRole = 'provider') {
    const requirements = this.policy.getRoleRequirements(userRole);
    const actualLength = Math.max(length, requirements.minLength);
    
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const numbers = '0123456789';
    const special = this.policy.allowedSpecialChars;
    
    let password = '';
    let charSets = [];
    
    // Ensure minimum requirements are met
    if (requirements.requireLowercase) {
      for (let i = 0; i < requirements.minLowercase; i++) {
        password += lowercase[crypto.randomInt(lowercase.length)];
      }
      charSets.push(lowercase);
    }
    
    if (requirements.requireUppercase) {
      for (let i = 0; i < requirements.minUppercase; i++) {
        password += uppercase[crypto.randomInt(uppercase.length)];
      }
      charSets.push(uppercase);
    }
    
    if (requirements.requireNumbers) {
      for (let i = 0; i < requirements.minNumbers; i++) {
        password += numbers[crypto.randomInt(numbers.length)];
      }
      charSets.push(numbers);
    }
    
    if (requirements.requireSpecialChars) {
      for (let i = 0; i < requirements.minSpecialChars; i++) {
        password += special[crypto.randomInt(special.length)];
      }
      charSets.push(special);
    }
    
    // Fill remaining length with random characters from all sets
    const allChars = charSets.join('');
    while (password.length < actualLength) {
      password += allChars[crypto.randomInt(allChars.length)];
    }
    
    // Shuffle the password
    return password.split('').sort(() => crypto.randomInt(3) - 1).join('');
  }

  /**
   * Get strength label from score
   */
  getStrengthLabel(score) {
    const labels = ['Very Weak', 'Weak', 'Fair', 'Good', 'Strong', 'Very Strong'];
    return labels[Math.min(score, labels.length - 1)];
  }

  /**
   * Format message with placeholders
   */
  formatMessage(messageKey, params = {}) {
    let message = this.policy.messages[messageKey] || messageKey;
    
    Object.keys(params).forEach(key => {
      message = message.replace(new RegExp(`{${key}}`, 'g'), params[key]);
    });
    
    return message;
  }

  /**
   * Escape regex special characters
   */
  escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Get policy configuration
   */
  getPolicy() {
    return this.policy;
  }

  /**
   * Update policy configuration (for testing or admin overrides)
   */
  updatePolicy(updates) {
    this.policy = { ...this.policy, ...updates };
  }
}

module.exports = new PasswordService();