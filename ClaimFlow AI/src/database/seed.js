const { supabase } = require('./connection');
const { encryptionService } = require('../utils/encryption');
const { logger } = require('../utils/logger');
const bcrypt = require('bcrypt');

class DatabaseSeeder {
  constructor() {
    this.seedData = {
      practices: [],
      providers: [],
      patients: [],
      authorizations: [],
      systemConfig: []
    };
  }

  /**
   * Main seeding function
   */
  async seed() {
    try {
      logger.info('Starting database seeding process');

      // Check if database is already seeded
      const isSeeded = await this.checkIfSeeded();
      if (isSeeded) {
        logger.info('Database already contains data. Skipping seed.');
        return;
      }

      // Seed in order due to foreign key dependencies
      await this.seedSystemConfig();
      await this.seedPractices();
      await this.seedProviders();
      await this.seedPatients();
      await this.seedAuthorizations();

      logger.info('Database seeding completed successfully');
      
      // Print summary
      this.printSeedSummary();

    } catch (error) {
      logger.error('Database seeding failed', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Check if database already contains seed data
   */
  async checkIfSeeded() {
    try {
      const { data: practices, error } = await supabase
        .from('practices')
        .select('id')
        .limit(1);

      if (error) {
        throw new Error(`Failed to check seed status: ${error.message}`);
      }

      return practices && practices.length > 0;
    } catch (error) {
      logger.error('Failed to check seed status', { error: error.message });
      return false;
    }
  }

  /**
   * Seed system configuration
   */
  async seedSystemConfig() {
    logger.info('Seeding system configuration...');

    const configs = [
      {
        config_key: 'hipaa_compliance_version',
        config_value: '2023.1',
        description: 'Current HIPAA compliance framework version',
        is_encrypted: false
      },
      {
        config_key: 'audit_retention_days',
        config_value: '2555', // 7 years
        description: 'Number of days to retain audit logs',
        is_encrypted: false
      },
      {
        config_key: 'max_login_attempts',
        config_value: '5',
        description: 'Maximum failed login attempts before account lockout',
        is_encrypted: false
      },
      {
        config_key: 'session_timeout_minutes',
        config_value: '30',
        description: 'Session timeout in minutes',
        is_encrypted: false
      },
      {
        config_key: 'password_min_length',
        config_value: '12',
        description: 'Minimum password length requirement',
        is_encrypted: false
      },
      {
        config_key: 'backup_encryption_enabled',
        config_value: 'true',
        description: 'Enable encryption for database backups',
        is_encrypted: false
      }
    ];

    for (const config of configs) {
      const { error } = await supabase
        .from('system_config')
        .insert(config);

      if (error) {
        throw new Error(`Failed to seed system config: ${error.message}`);
      }
    }

    this.seedData.systemConfig = configs;
    logger.info(`Seeded ${configs.length} system configuration entries`);
  }

  /**
   * Seed practices
   */
  async seedPractices() {
    logger.info('Seeding practices...');

    const practices = [
      {
        name: 'Metropolitan Medical Center',
        npi: '1234567890',
        address_line1: '123 Healthcare Blvd',
        address_line2: 'Suite 100',
        city: 'New York',
        state: 'NY',
        zip_code: '10001',
        phone: '(555) 123-4567',
        email: 'admin@metromedical.com',
        subscription_tier: 'enterprise',
        is_active: true
      },
      {
        name: 'Family Care Clinic',
        npi: '0987654321',
        address_line1: '456 Community St',
        city: 'Los Angeles',
        state: 'CA',
        zip_code: '90210',
        phone: '(555) 987-6543',
        email: 'contact@familycare.com',
        subscription_tier: 'professional',
        is_active: true
      },
      {
        name: 'Specialty Orthopedics',
        npi: '1122334455',
        address_line1: '789 Bone & Joint Ave',
        city: 'Chicago',
        state: 'IL',
        zip_code: '60601',
        phone: '(555) 111-2233',
        email: 'info@specialtyortho.com',
        subscription_tier: 'basic',
        is_active: true
      }
    ];

    for (const practice of practices) {
      const { data, error } = await supabase
        .from('practices')
        .insert(practice)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to seed practice: ${error.message}`);
      }

      this.seedData.practices.push(data);
    }

    logger.info(`Seeded ${practices.length} practices`);
  }

  /**
   * Seed providers
   */
  async seedProviders() {
    logger.info('Seeding providers...');

    const providers = [
      // Metropolitan Medical Center providers
      {
        practice_id: this.seedData.practices[0].id,
        name: 'Dr. Sarah Johnson',
        npi: '1111111111',
        specialty: 'Internal Medicine',
        email: 'sarah.johnson@metromedical.com',
        phone: '(555) 123-4501',
        role: 'admin',
        is_active: true
      },
      {
        practice_id: this.seedData.practices[0].id,
        name: 'Dr. Michael Chen',
        npi: '2222222222',
        specialty: 'Cardiology',
        email: 'michael.chen@metromedical.com',
        phone: '(555) 123-4502',
        role: 'provider',
        is_active: true
      },
      {
        practice_id: this.seedData.practices[0].id,
        name: 'Lisa Rodriguez, RN',
        npi: '3333333333',
        specialty: 'Nursing',
        email: 'lisa.rodriguez@metromedical.com',
        phone: '(555) 123-4503',
        role: 'staff',
        is_active: true
      },
      // Family Care Clinic providers
      {
        practice_id: this.seedData.practices[1].id,
        name: 'Dr. Robert Williams',
        npi: '4444444444',
        specialty: 'Family Medicine',
        email: 'robert.williams@familycare.com',
        phone: '(555) 987-6501',
        role: 'admin',
        is_active: true
      },
      {
        practice_id: this.seedData.practices[1].id,
        name: 'Dr. Emily Davis',
        npi: '5555555555',
        specialty: 'Pediatrics',
        email: 'emily.davis@familycare.com',
        phone: '(555) 987-6502',
        role: 'provider',
        is_active: true
      },
      // Specialty Orthopedics providers
      {
        practice_id: this.seedData.practices[2].id,
        name: 'Dr. James Thompson',
        npi: '6666666666',
        specialty: 'Orthopedic Surgery',
        email: 'james.thompson@specialtyortho.com',
        phone: '(555) 111-2201',
        role: 'admin',
        is_active: true
      }
    ];

    for (const provider of providers) {
      // Hash a default password for each provider
      const defaultPassword = 'TempPass123!';
      const hashedPassword = await bcrypt.hash(defaultPassword, 12);
      
      const providerData = {
        ...provider,
        password_hash: hashedPassword,
        password_changed_at: new Date().toISOString(),
        must_change_password: true
      };

      const { data, error } = await supabase
        .from('providers')
        .insert(providerData)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to seed provider: ${error.message}`);
      }

      this.seedData.providers.push(data);
    }

    logger.info(`Seeded ${providers.length} providers`);
  }

  /**
   * Seed patients
   */
  async seedPatients() {
    logger.info('Seeding patients...');

    const patients = [
      // Metropolitan Medical Center patients
      {
        practice_id: this.seedData.practices[0].id,
        patient_id: 'MMC001',
        first_name: 'John',
        last_name: 'Smith',
        date_of_birth: '1985-03-15',
        gender: 'male',
        phone: '(555) 201-3001',
        email: 'john.smith@email.com',
        address_line1: '123 Patient St',
        city: 'New York',
        state: 'NY',
        zip_code: '10002',
        insurance_provider: 'Blue Cross Blue Shield',
        insurance_member_id: 'BCBS123456789',
        insurance_group_number: 'GRP001'
      },
      {
        practice_id: this.seedData.practices[0].id,
        patient_id: 'MMC002',
        first_name: 'Maria',
        last_name: 'Garcia',
        date_of_birth: '1978-07-22',
        gender: 'female',
        phone: '(555) 201-3002',
        email: 'maria.garcia@email.com',
        address_line1: '456 Health Ave',
        city: 'New York',
        state: 'NY',
        zip_code: '10003',
        insurance_provider: 'Aetna',
        insurance_member_id: 'AET987654321',
        insurance_group_number: 'GRP002'
      },
      // Family Care Clinic patients
      {
        practice_id: this.seedData.practices[1].id,
        patient_id: 'FCC001',
        first_name: 'David',
        last_name: 'Johnson',
        date_of_birth: '1992-11-08',
        gender: 'male',
        phone: '(555) 301-4001',
        email: 'david.johnson@email.com',
        address_line1: '789 Wellness Blvd',
        city: 'Los Angeles',
        state: 'CA',
        zip_code: '90211',
        insurance_provider: 'Kaiser Permanente',
        insurance_member_id: 'KP555666777',
        insurance_group_number: 'GRP003'
      },
      {
        practice_id: this.seedData.practices[1].id,
        patient_id: 'FCC002',
        first_name: 'Sarah',
        last_name: 'Wilson',
        date_of_birth: '2010-05-12',
        gender: 'female',
        phone: '(555) 301-4002',
        email: 'parent@email.com',
        address_line1: '321 Family Way',
        city: 'Los Angeles',
        state: 'CA',
        zip_code: '90212',
        insurance_provider: 'Cigna',
        insurance_member_id: 'CIG111222333',
        insurance_group_number: 'GRP004'
      },
      // Specialty Orthopedics patients
      {
        practice_id: this.seedData.practices[2].id,
        patient_id: 'SO001',
        first_name: 'Robert',
        last_name: 'Brown',
        date_of_birth: '1965-09-30',
        gender: 'male',
        phone: '(555) 401-5001',
        email: 'robert.brown@email.com',
        address_line1: '654 Recovery Rd',
        city: 'Chicago',
        state: 'IL',
        zip_code: '60602',
        insurance_provider: 'United Healthcare',
        insurance_member_id: 'UHC444555666',
        insurance_group_number: 'GRP005'
      }
    ];

    for (const patient of patients) {
      // Encrypt PHI data
      const encryptedPatient = {
        practice_id: patient.practice_id,
        patient_id: patient.patient_id,
        first_name_encrypted: encryptionService.encryptPHI(patient.first_name),
        last_name_encrypted: encryptionService.encryptPHI(patient.last_name),
        date_of_birth_encrypted: encryptionService.encryptPHI(patient.date_of_birth),
        gender: patient.gender,
        phone_encrypted: encryptionService.encryptPHI(patient.phone),
        email_encrypted: patient.email ? encryptionService.encryptPHI(patient.email) : null,
        address_line1_encrypted: encryptionService.encryptPHI(patient.address_line1),
        address_line2_encrypted: patient.address_line2 ? encryptionService.encryptPHI(patient.address_line2) : null,
        city_encrypted: encryptionService.encryptPHI(patient.city),
        state: patient.state,
        zip_code_encrypted: encryptionService.encryptPHI(patient.zip_code),
        insurance_provider_encrypted: encryptionService.encryptPHI(patient.insurance_provider),
        insurance_member_id_encrypted: encryptionService.encryptPHI(patient.insurance_member_id),
        insurance_group_number_encrypted: patient.insurance_group_number ? encryptionService.encryptPHI(patient.insurance_group_number) : null,
        is_active: true
      };

      const { data, error } = await supabase
        .from('patients')
        .insert(encryptedPatient)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to seed patient: ${error.message}`);
      }

      this.seedData.patients.push(data);
    }

    logger.info(`Seeded ${patients.length} patients`);
  }

  /**
   * Seed authorizations
   */
  async seedAuthorizations() {
    logger.info('Seeding authorizations...');

    const authorizations = [
      {
        practice_id: this.seedData.practices[0].id,
        patient_id: this.seedData.patients[0].id,
        provider_id: this.seedData.providers[1].id, // Dr. Michael Chen
        authorization_number: 'AUTH-MMC-001-2024',
        payer: 'Blue Cross Blue Shield',
        service_type: 'Cardiology Consultation',
        diagnosis_code: 'I25.10',
        procedure_code: '99213',
        units_requested: 1,
        units_approved: 1,
        status: 'approved',
        priority: 'routine',
        requested_date: new Date('2024-01-15').toISOString(),
        approval_date: new Date('2024-01-16').toISOString(),
        effective_date: new Date('2024-01-20').toISOString(),
        expiration_date: new Date('2024-07-20').toISOString(),
        notes: 'Routine cardiology follow-up for hypertension management'
      },
      {
        practice_id: this.seedData.practices[0].id,
        patient_id: this.seedData.patients[1].id,
        provider_id: this.seedData.providers[0].id, // Dr. Sarah Johnson
        authorization_number: 'AUTH-MMC-002-2024',
        payer: 'Aetna',
        service_type: 'Internal Medicine Consultation',
        diagnosis_code: 'E11.9',
        procedure_code: '99214',
        units_requested: 2,
        units_approved: 2,
        status: 'approved',
        priority: 'routine',
        requested_date: new Date('2024-01-18').toISOString(),
        approval_date: new Date('2024-01-19').toISOString(),
        effective_date: new Date('2024-01-25').toISOString(),
        expiration_date: new Date('2024-07-25').toISOString(),
        notes: 'Diabetes management and monitoring'
      },
      {
        practice_id: this.seedData.practices[1].id,
        patient_id: this.seedData.patients[2].id,
        provider_id: this.seedData.providers[3].id, // Dr. Robert Williams
        authorization_number: 'AUTH-FCC-001-2024',
        payer: 'Kaiser Permanente',
        service_type: 'Family Medicine Consultation',
        diagnosis_code: 'Z00.00',
        procedure_code: '99395',
        units_requested: 1,
        units_approved: 1,
        status: 'approved',
        priority: 'routine',
        requested_date: new Date('2024-01-20').toISOString(),
        approval_date: new Date('2024-01-21').toISOString(),
        effective_date: new Date('2024-01-28').toISOString(),
        expiration_date: new Date('2024-07-28').toISOString(),
        notes: 'Annual physical examination'
      },
      {
        practice_id: this.seedData.practices[1].id,
        patient_id: this.seedData.patients[3].id,
        provider_id: this.seedData.providers[4].id, // Dr. Emily Davis
        authorization_number: 'AUTH-FCC-002-2024',
        payer: 'Cigna',
        service_type: 'Pediatric Consultation',
        diagnosis_code: 'Z00.121',
        procedure_code: '99384',
        units_requested: 1,
        units_approved: 0,
        status: 'pending',
        priority: 'routine',
        requested_date: new Date('2024-01-22').toISOString(),
        effective_date: new Date('2024-02-01').toISOString(),
        expiration_date: new Date('2024-08-01').toISOString(),
        notes: 'Well-child visit for 13-year-old'
      },
      {
        practice_id: this.seedData.practices[2].id,
        patient_id: this.seedData.patients[4].id,
        provider_id: this.seedData.providers[5].id, // Dr. James Thompson
        authorization_number: 'AUTH-SO-001-2024',
        payer: 'United Healthcare',
        service_type: 'Orthopedic Surgery',
        diagnosis_code: 'M17.11',
        procedure_code: '27447',
        units_requested: 1,
        units_approved: 1,
        status: 'approved',
        priority: 'urgent',
        requested_date: new Date('2024-01-25').toISOString(),
        approval_date: new Date('2024-01-26').toISOString(),
        effective_date: new Date('2024-02-05').toISOString(),
        expiration_date: new Date('2024-08-05').toISOString(),
        notes: 'Total knee arthroplasty for severe osteoarthritis'
      }
    ];

    for (const authorization of authorizations) {
      const { data, error } = await supabase
        .from('authorizations')
        .insert(authorization)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to seed authorization: ${error.message}`);
      }

      this.seedData.authorizations.push(data);
    }

    logger.info(`Seeded ${authorizations.length} authorizations`);
  }

  /**
   * Print summary of seeded data
   */
  printSeedSummary() {
    console.log('\n=== DATABASE SEED SUMMARY ===');
    console.log(`✓ System Config: ${this.seedData.systemConfig.length} entries`);
    console.log(`✓ Practices: ${this.seedData.practices.length} practices`);
    console.log(`✓ Providers: ${this.seedData.providers.length} providers`);
    console.log(`✓ Patients: ${this.seedData.patients.length} patients`);
    console.log(`✓ Authorizations: ${this.seedData.authorizations.length} authorizations`);
    console.log('\n=== TEST CREDENTIALS ===');
    console.log('All providers have been created with:');
    console.log('Password: TempPass123!');
    console.log('(Users must change password on first login)');
    console.log('\n=== PRACTICE DETAILS ===');
    this.seedData.practices.forEach((practice, index) => {
      console.log(`${index + 1}. ${practice.name} (${practice.subscription_tier})`);
      console.log(`   NPI: ${practice.npi}`);
      console.log(`   ID: ${practice.id}`);
    });
    console.log('\n=============================\n');
  }

  /**
   * Clear all seeded data (for testing)
   */
  async clearSeedData() {
    try {
      logger.info('Clearing seed data...');

      // Delete in reverse order due to foreign key constraints
      await supabase.from('authorizations').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('patients').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('providers').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('practices').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('system_config').delete().neq('id', '00000000-0000-0000-0000-000000000000');

      logger.info('Seed data cleared successfully');
    } catch (error) {
      logger.error('Failed to clear seed data', { error: error.message });
      throw error;
    }
  }
}

// CLI execution
if (require.main === module) {
  const seeder = new DatabaseSeeder();
  
  const command = process.argv[2];
  
  if (command === 'clear') {
    seeder.clearSeedData()
      .then(() => {
        console.log('✓ Seed data cleared successfully');
        process.exit(0);
      })
      .catch((error) => {
        console.error('✗ Failed to clear seed data:', error.message);
        process.exit(1);
      });
  } else {
    seeder.seed()
      .then(() => {
        console.log('✓ Database seeding completed successfully');
        process.exit(0);
      })
      .catch((error) => {
        console.error('✗ Database seeding failed:', error.message);
        process.exit(1);
      });
  }
}

module.exports = { DatabaseSeeder };