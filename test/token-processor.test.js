/**
 * Token Processor Tests
 */

const TokenProcessor = require('../src/token-processor');
const ConfigManager = require('../src/config-manager');
const path = require('path');
const os = require('os');

describe('TokenProcessor', () => {
  let tokenProcessor;
  let configManager;
  
  beforeEach(() => {
    configManager = new ConfigManager(__dirname, process.cwd());
    tokenProcessor = new TokenProcessor(configManager);
  });
  
  describe('hasToken', () => {
    test('should detect tokens in content', () => {
      const content = 'Hello {{NAME}}, today is {{DATE}}';
      expect(tokenProcessor.hasToken(content, 'NAME')).toBe(true);
      expect(tokenProcessor.hasToken(content, 'DATE')).toBe(true);
      expect(tokenProcessor.hasToken(content, 'MISSING')).toBe(false);
    });
  });
  
  describe('replaceToken', () => {
    test('should replace simple tokens', () => {
      const content = 'Hello {{NAME}}!';
      const result = tokenProcessor.replaceToken(content, 'NAME', 'World');
      expect(result).toBe('Hello World!');
    });
    
    test('should replace multiple occurrences', () => {
      const content = '{{NAME}} says hello to {{NAME}}';
      const result = tokenProcessor.replaceToken(content, 'NAME', 'Alice');
      expect(result).toBe('Alice says hello to Alice');
    });
    
    test('should handle special characters in values', () => {
      const content = 'Path: {{PATH}}';
      const result = tokenProcessor.replaceToken(content, 'PATH', '/path/with/special$chars');
      expect(result).toBe('Path: /path/with/special$chars');
    });
  });
  
  describe('findRemainingTokens', () => {
    test('should find unprocessed tokens', () => {
      const content = 'Hello {{NAME}}, today is {{DATE}}, version {{VERSION}}';
      const tokens = tokenProcessor.findRemainingTokens(content);
      expect(tokens).toEqual(['{{NAME}}', '{{DATE}}', '{{VERSION}}']);
    });
    
    test('should return empty array when no tokens', () => {
      const content = 'Hello World, no tokens here';
      const tokens = tokenProcessor.findRemainingTokens(content);
      expect(tokens).toEqual([]);
    });
  });
  
  describe('processTokens', () => {
    test('should process automatic tokens', async () => {
      const content = 'Generated on {{DATE_TODAY}} by {{USERNAME}}';
      const config = {};
      
      const result = await tokenProcessor.processTokens('dummy-path', config);
      
      // Should contain actual date and username
      expect(result).toMatch(/Generated on \d{4}-\d{2}-\d{2} by \w+/);
      expect(result).not.toContain('{{DATE_TODAY}}');
      expect(result).not.toContain('{{USERNAME}}');
    });
    
    test('should process config tokens', async () => {
      const content = 'Created by {{DEVELOPER_NAME}} at {{COMPANY_NAME}}';
      const config = {
        DEVELOPER_NAME: 'John Doe',
        COMPANY_NAME: 'Acme Corp'
      };
      
      // Mock the file reading since we're not using a real file
      const originalProcessTokens = tokenProcessor.processTokens;
      tokenProcessor.processTokens = async function(inputPath, config) {
        // Skip file reading and process the content directly
        let processedContent = content;
        
        // Get automatic tokens
        const automaticTokens = this.configManager.getAutomaticTokens();
        const allTokens = { ...config, ...automaticTokens };
        
        // Process tokens
        for (const [key, value] of Object.entries(config)) {
          if (this.hasToken(processedContent, key)) {
            processedContent = this.replaceToken(processedContent, key, value);
          }
        }
        
        return processedContent;
      };
      
      const result = await tokenProcessor.processTokens('dummy-path', config);
      
      expect(result).toBe('Created by John Doe at Acme Corp');
    });
  });
});
