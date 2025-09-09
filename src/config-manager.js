/**
 * Configuration Manager
 * 
 * Handles loading and parsing of md2pdf.config files
 * Supports the same format as the original shell script
 */

const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');

class ConfigManager {
  constructor(scriptDir, currentDir) {
    this.scriptDir = scriptDir;
    this.currentDir = currentDir;
  }
  
  async loadConfig(configPath = null) {
    let configFile = null;
    
    if (configPath) {
      // Use explicitly provided config path
      configFile = path.resolve(configPath);
      if (!await fs.pathExists(configFile)) {
        throw new Error(`Config file not found: ${configFile}`);
      }
    } else {
      // Look for config file in script directory first, then current directory
      const scriptConfig = path.join(this.scriptDir, 'md2pdf.config');
      const currentConfig = path.join(this.currentDir, 'md2pdf.config');
      
      if (await fs.pathExists(scriptConfig)) {
        configFile = scriptConfig;
      } else if (await fs.pathExists(currentConfig)) {
        configFile = currentConfig;
      }
    }
    
    if (configFile) {
      console.log(chalk.blue('📋 Using config file:'), configFile);
      return await this.parseConfigFile(configFile);
    } else {
      console.log(chalk.gray('ℹ️ No config file found (looked for md2pdf.config in script and current directories)'));
      console.log(chalk.gray('💡 Create md2pdf.config to use token replacement features'));
      return {};
    }
  }
  
  async parseConfigFile(configPath) {
    try {
      const content = await fs.readFile(configPath, 'utf8');
      const config = {};
      
      const lines = content.split('\n');
      
      for (const line of lines) {
        const trimmedLine = line.trim();
        
        // Skip empty lines and comments
        if (!trimmedLine || trimmedLine.startsWith('#')) {
          continue;
        }
        
        // Parse key=value pairs
        const equalIndex = trimmedLine.indexOf('=');
        if (equalIndex === -1) {
          continue; // Skip lines without =
        }
        
        const key = trimmedLine.substring(0, equalIndex).trim();
        const value = trimmedLine.substring(equalIndex + 1).trim();
        
        if (key) {
          config[key] = value;
        }
      }
      
      // Handle PROJECT_NAME special case - use auto-generated if empty
      if (!config.PROJECT_NAME || config.PROJECT_NAME === '') {
        config.PROJECT_NAME = path.basename(this.currentDir);
      }
      
      return config;
      
    } catch (error) {
      throw new Error(`Failed to parse config file ${configPath}: ${error.message}`);
    }
  }
  
  getAutomaticTokens() {
    const now = new Date();
    
    // Format date components
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    
    // Format date strings
    const dateToday = `${year}-${month}-${day}`;
    const dateTodayLong = now.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    const timeNow = `${hours}:${minutes}`;
    const datetimeNow = `${dateToday} ${timeNow}`;
    const timestamp = Math.floor(now.getTime() / 1000).toString();
    
    // Get system information
    const os = require('os');
    const hostname = os.hostname();
    const username = os.userInfo().username;
    
    return {
      DATE_TODAY: dateToday,
      DATE_TODAY_LONG: dateTodayLong,
      TIME_NOW: timeNow,
      DATETIME_NOW: datetimeNow,
      TIMESTAMP: timestamp,
      YEAR: year.toString(),
      MONTH: month,
      DAY: day,
      HOSTNAME: hostname,
      USERNAME: username,
      PWD: this.currentDir,
      SCRIPT_DIR: this.scriptDir
    };
  }
}

module.exports = ConfigManager;
