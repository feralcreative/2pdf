/**
 * Config Manager Tests
 */

const ConfigManager = require('../src/config-manager');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');

describe('ConfigManager', () => {
  let configManager;
  let tempDir;
  
  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'md2pdf-test-'));
    configManager = new ConfigManager(tempDir, tempDir);
  });
  
  afterEach(async () => {
    await fs.remove(tempDir);
  });
  
  describe('parseConfigFile', () => {
    test('should parse valid config file', async () => {
      const configContent = `# Test config
DEVELOPER_NAME=John Doe
COMPANY_NAME=Acme Corp
PROJECT_VERSION=1.0.0

# Empty value
PROJECT_NAME=

# Comment line should be ignored
# IGNORED_TOKEN=ignored value
`;
      
      const configPath = path.join(tempDir, 'test.config');
      await fs.writeFile(configPath, configContent);
      
      const config = await configManager.parseConfigFile(configPath);
      
      expect(config.DEVELOPER_NAME).toBe('John Doe');
      expect(config.COMPANY_NAME).toBe('Acme Corp');
      expect(config.PROJECT_VERSION).toBe('1.0.0');
      expect(config.PROJECT_NAME).toBe(path.basename(tempDir)); // Should use auto-generated
      expect(config.IGNORED_TOKEN).toBeUndefined();
    });
    
    test('should handle malformed lines gracefully', async () => {
      const configContent = `VALID_TOKEN=valid value
invalid line without equals
ANOTHER_VALID=another value
=empty key
EMPTY_VALUE=
`;
      
      const configPath = path.join(tempDir, 'test.config');
      await fs.writeFile(configPath, configContent);
      
      const config = await configManager.parseConfigFile(configPath);
      
      expect(config.VALID_TOKEN).toBe('valid value');
      expect(config.ANOTHER_VALID).toBe('another value');
      expect(config.EMPTY_VALUE).toBe('');
    });
  });
  
  describe('getAutomaticTokens', () => {
    test('should generate automatic tokens', () => {
      const tokens = configManager.getAutomaticTokens();
      
      // Check that all expected tokens are present
      expect(tokens.DATE_TODAY).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(tokens.DATE_TODAY_LONG).toMatch(/^[A-Za-z]+ \d{1,2}, \d{4}$/);
      expect(tokens.TIME_NOW).toMatch(/^\d{2}:\d{2}$/);
      expect(tokens.DATETIME_NOW).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
      expect(tokens.TIMESTAMP).toMatch(/^\d+$/);
      expect(tokens.YEAR).toMatch(/^\d{4}$/);
      expect(tokens.MONTH).toMatch(/^\d{2}$/);
      expect(tokens.DAY).toMatch(/^\d{2}$/);
      expect(tokens.HOSTNAME).toBeTruthy();
      expect(tokens.USERNAME).toBeTruthy();
      expect(tokens.PWD).toBe(tempDir);
      expect(tokens.SCRIPT_DIR).toBe(tempDir);
    });
    
    test('should generate consistent date tokens', () => {
      const tokens1 = configManager.getAutomaticTokens();
      const tokens2 = configManager.getAutomaticTokens();
      
      // Tokens generated within the same second should be the same
      expect(tokens1.DATE_TODAY).toBe(tokens2.DATE_TODAY);
      expect(tokens1.YEAR).toBe(tokens2.YEAR);
      expect(tokens1.MONTH).toBe(tokens2.MONTH);
      expect(tokens1.DAY).toBe(tokens2.DAY);
    });
  });
  
  describe('loadConfig', () => {
    test('should load config from script directory', async () => {
      const configContent = 'DEVELOPER_NAME=Script Dir User';
      const configPath = path.join(tempDir, 'md2pdf.config');
      await fs.writeFile(configPath, configContent);
      
      const config = await configManager.loadConfig();
      
      expect(config.DEVELOPER_NAME).toBe('Script Dir User');
    });
    
    test('should return empty config when no file found', async () => {
      const config = await configManager.loadConfig();
      
      expect(config).toEqual({});
    });
    
    test('should use explicit config path when provided', async () => {
      const configContent = 'DEVELOPER_NAME=Explicit Path User';
      const configPath = path.join(tempDir, 'custom.config');
      await fs.writeFile(configPath, configContent);
      
      const config = await configManager.loadConfig(configPath);
      
      expect(config.DEVELOPER_NAME).toBe('Explicit Path User');
    });
    
    test('should throw error for non-existent explicit config', async () => {
      const nonExistentPath = path.join(tempDir, 'nonexistent.config');
      
      await expect(configManager.loadConfig(nonExistentPath))
        .rejects.toThrow('Config file not found');
    });
  });
});
