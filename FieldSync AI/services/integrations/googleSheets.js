const { google } = require('googleapis');
const { DataSource } = require('../../models');
const OAuthManager = require('./oauthManager');

class GoogleSheetsService {
  constructor() {
    this.sheets = google.sheets('v4');
    this.oauthManager = new OAuthManager();
  }

  /**
   * Create OAuth2 client with stored credentials
   */
  createOAuth2Client(credentials) {
    return this.oauthManager.createGoogleOAuth2Client(credentials);
  }

  /**
   * Get valid credentials with automatic token refresh
   */
  async getValidCredentials(dataSourceId) {
    try {
      const dataSource = await DataSource.findByPk(dataSourceId);
      if (!dataSource || !dataSource.credentials) {
        throw new Error('Data source not found or missing credentials');
      }

      const credentials = JSON.parse(dataSource.credentials);
      
      // Get valid access token (will refresh if needed)
      const validAccessToken = await this.oauthManager.getValidAccessToken(dataSourceId);
      
      return {
        ...credentials,
        accessToken: validAccessToken,
        dataSourceId: dataSourceId
      };
    } catch (error) {
      throw new Error(`Failed to get valid credentials: ${error.message}`);
    }
  }

  /**
   * Get list of spreadsheets accessible to the user
   */
  async getSpreadsheets(dataSourceId) {
    try {
      const credentials = await this.getValidCredentials(dataSourceId);
      const auth = this.createOAuth2Client(credentials);
      const drive = google.drive({ version: 'v3', auth });

      const response = await drive.files.list({
        q: "mimeType='application/vnd.google-apps.spreadsheet'",
        fields: 'files(id, name, modifiedTime, webViewLink)',
        pageSize: 100
      });

      return response.data.files;
    } catch (error) {
      throw new Error(`Failed to fetch spreadsheets: ${error.message}`);
    }
  }

  /**
   * Get worksheets from a specific spreadsheet
   */
  async getWorksheets(dataSourceId, spreadsheetId) {
    try {
      const credentials = await this.getValidCredentials(dataSourceId);
      const auth = this.createOAuth2Client(credentials);
      
      const response = await this.sheets.spreadsheets.get({
        auth,
        spreadsheetId,
        fields: 'sheets(properties(sheetId,title,gridProperties))'
      });

      return response.data.sheets.map(sheet => ({
        id: sheet.properties.sheetId,
        title: sheet.properties.title,
        rowCount: sheet.properties.gridProperties?.rowCount || 0,
        columnCount: sheet.properties.gridProperties?.columnCount || 0
      }));
    } catch (error) {
      throw new Error(`Failed to fetch worksheets: ${error.message}`);
    }
  }

  /**
   * Detect schema from spreadsheet data
   */
  async detectSchema(dataSourceId, spreadsheetId, sheetName, sampleRows = 100) {
    try {
      const credentials = await this.getValidCredentials(dataSourceId);
      const auth = this.createOAuth2Client(credentials);
      
      // Get header row and sample data
      const range = `${sheetName}!A1:ZZ${sampleRows + 1}`;
      const response = await this.sheets.spreadsheets.values.get({
        auth,
        spreadsheetId,
        range,
        valueRenderOption: 'UNFORMATTED_VALUE'
      });

      const rows = response.data.values || [];
      if (rows.length === 0) {
        throw new Error('No data found in spreadsheet');
      }

      const headers = rows[0] || [];
      const dataRows = rows.slice(1);

      // Analyze data types for each column
      const schema = headers.map((header, index) => {
        const columnData = dataRows.map(row => row[index]).filter(val => val !== undefined && val !== '');
        const dataType = this.inferDataType(columnData);
        
        return {
          name: header || `Column_${index + 1}`,
          type: dataType,
          nullable: columnData.length < dataRows.length,
          sampleValues: columnData.slice(0, 5)
        };
      });

      return {
        totalRows: rows.length - 1,
        totalColumns: headers.length,
        schema,
        preview: rows.slice(0, 6) // Header + 5 data rows
      };
    } catch (error) {
      throw new Error(`Failed to detect schema: ${error.message}`);
    }
  }

  /**
   * Extract data from spreadsheet
   */
  async extractData(dataSourceId, spreadsheetId, sheetName, options = {}) {
    try {
      const credentials = await this.getValidCredentials(dataSourceId);
      const auth = this.createOAuth2Client(credentials);
      
      const {
        startRow = 1,
        endRow = null,
        startColumn = 'A',
        endColumn = 'ZZ',
        includeHeaders = true
      } = options;

      const range = `${sheetName}!${startColumn}${startRow}:${endColumn}${endRow || ''}`;
      
      const response = await this.sheets.spreadsheets.values.get({
        auth,
        spreadsheetId,
        range,
        valueRenderOption: 'UNFORMATTED_VALUE',
        dateTimeRenderOption: 'FORMATTED_STRING'
      });

      const rows = response.data.values || [];
      
      if (!includeHeaders && rows.length > 0) {
        rows.shift(); // Remove header row
      }

      return {
        data: rows,
        totalRows: rows.length,
        range: response.data.range
      };
    } catch (error) {
      throw new Error(`Failed to extract data: ${error.message}`);
    }
  }

  /**
   * Infer data type from column values
   */
  inferDataType(values) {
    if (values.length === 0) return 'TEXT';

    const sampleSize = Math.min(values.length, 50);
    const sample = values.slice(0, sampleSize);

    let numberCount = 0;
    let dateCount = 0;
    let booleanCount = 0;

    for (const value of sample) {
      if (value === null || value === undefined || value === '') continue;

      // Check if it's a number
      if (!isNaN(value) && !isNaN(parseFloat(value))) {
        numberCount++;
        continue;
      }

      // Check if it's a date
      const dateValue = new Date(value);
      if (!isNaN(dateValue.getTime()) && typeof value === 'string' && value.match(/\d{1,4}[-\/]\d{1,2}[-\/]\d{1,4}/)) {
        dateCount++;
        continue;
      }

      // Check if it's a boolean
      if (typeof value === 'boolean' || 
          (typeof value === 'string' && ['true', 'false', 'yes', 'no', '1', '0'].includes(value.toLowerCase()))) {
        booleanCount++;
        continue;
      }
    }

    const threshold = sampleSize * 0.8; // 80% threshold

    if (numberCount >= threshold) {
      // Check if it's integer or decimal
      const hasDecimals = sample.some(val => !isNaN(val) && val.toString().includes('.'));
      return hasDecimals ? 'DECIMAL' : 'INTEGER';
    }

    if (dateCount >= threshold) return 'DATE';
    if (booleanCount >= threshold) return 'BOOLEAN';

    return 'TEXT';
  }

  /**
   * Test connection to Google Sheets
   */
  async testConnection(dataSourceId) {
    try {
      const credentials = await this.getValidCredentials(dataSourceId);
      const auth = this.createOAuth2Client(credentials);
      const drive = google.drive({ version: 'v3', auth });

      // Try to list files to test connection
      await drive.files.list({
        q: "mimeType='application/vnd.google-apps.spreadsheet'",
        fields: 'files(id)',
        pageSize: 1
      });

      return { success: true, message: 'Connection successful' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  /**
   * Save Google Sheets connection to database
   */
  async saveConnection(organizationId, connectionData) {
    try {
      const dataSource = await DataSource.create({
        organization_id: organizationId,
        name: connectionData.name || 'Google Sheets Connection',
        type: 'google_sheets',
        connection_string: JSON.stringify({
          spreadsheetId: connectionData.spreadsheetId,
          sheetName: connectionData.sheetName
        }),
        credentials: JSON.stringify({
          accessToken: connectionData.accessToken,
          refreshToken: connectionData.refreshToken,
          expiresAt: connectionData.expiresAt,
          provider: 'google',
          email: connectionData.email,
          scope: connectionData.scope,
          tokenType: connectionData.tokenType || 'Bearer',
          lastRefreshed: new Date().toISOString()
        }),
        status: 'active',
        metadata: JSON.stringify({
          provider: 'google',
          lastSync: new Date(),
          totalRows: connectionData.totalRows || 0,
          schema: connectionData.schema || []
        })
      });

      return dataSource;
    } catch (error) {
      throw new Error(`Failed to save connection: ${error.message}`);
    }
  }
}

module.exports = GoogleSheetsService;