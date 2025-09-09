/**
 * Dependency Manager
 * 
 * Handles checking and installation of dependencies
 * Manages Chrome detection and other system requirements
 */

const { execSync, spawn } = require('child_process');
const which = require('which');
const chalk = require('chalk');
const os = require('os');

class DependencyManager {
  constructor() {
    this.platform = os.platform();
  }
  
  async checkDependencies() {
    console.log(chalk.blue('🔍 Checking dependencies...'));
    
    const results = {
      chrome: await this.checkChrome(),
      pandoc: await this.checkPandoc(),
      node: await this.checkNode()
    };
    
    return results;
  }
  
  async checkChrome() {
    // Puppeteer handles Chrome automatically, but we can still check for system Chrome
    try {
      let chromePath = null;
      
      if (this.platform === 'darwin') {
        // macOS
        const macPaths = [
          '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
          '/Applications/Chromium.app/Contents/MacOS/Chromium'
        ];
        
        for (const path of macPaths) {
          try {
            execSync(`test -f "${path}"`, { stdio: 'ignore' });
            chromePath = path;
            break;
          } catch (e) {
            // Continue checking
          }
        }
      } else if (this.platform === 'linux') {
        // Linux
        const linuxCommands = ['google-chrome', 'chromium-browser', 'chromium'];
        
        for (const cmd of linuxCommands) {
          try {
            chromePath = await which(cmd);
            break;
          } catch (e) {
            // Continue checking
          }
        }
      } else if (this.platform === 'win32') {
        // Windows
        const winPaths = [
          'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
          'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
        ];
        
        for (const path of winPaths) {
          try {
            execSync(`if exist "${path}" echo found`, { stdio: 'ignore' });
            chromePath = path;
            break;
          } catch (e) {
            // Continue checking
          }
        }
      }
      
      if (chromePath) {
        console.log(chalk.green('✅ Chrome found:'), chromePath);
        return { available: true, path: chromePath, source: 'system' };
      } else {
        console.log(chalk.yellow('⚠️ System Chrome not found, will use Puppeteer Chrome'));
        return { available: true, path: 'puppeteer', source: 'puppeteer' };
      }
      
    } catch (error) {
      console.log(chalk.yellow('⚠️ Chrome check failed, will use Puppeteer Chrome'));
      return { available: true, path: 'puppeteer', source: 'puppeteer' };
    }
  }
  
  async checkPandoc() {
    try {
      const pandocPath = await which('pandoc');
      console.log(chalk.green('✅ Pandoc found:'), pandocPath);
      return { available: true, path: pandocPath };
    } catch (error) {
      console.log(chalk.yellow('⚠️ Pandoc not found'));
      return { available: false, path: null };
    }
  }
  
  async checkNode() {
    try {
      const version = process.version;
      const majorVersion = parseInt(version.slice(1).split('.')[0]);
      
      if (majorVersion >= 14) {
        console.log(chalk.green('✅ Node.js version:'), version);
        return { available: true, version, compatible: true };
      } else {
        console.log(chalk.red('❌ Node.js version too old:'), version);
        console.log(chalk.red('   Requires Node.js 14 or higher'));
        return { available: true, version, compatible: false };
      }
    } catch (error) {
      return { available: false, version: null, compatible: false };
    }
  }
  
  async installPandoc() {
    console.log(chalk.blue('📦 Installing Pandoc...'));
    
    try {
      if (this.platform === 'darwin') {
        // macOS - try homebrew
        try {
          await which('brew');
          execSync('brew install pandoc', { stdio: 'inherit' });
          console.log(chalk.green('✅ Pandoc installed via Homebrew'));
          return true;
        } catch (e) {
          console.log(chalk.red('❌ Homebrew not found. Please install Pandoc manually:'));
          console.log(chalk.blue('   https://pandoc.org/installing.html'));
          return false;
        }
      } else if (this.platform === 'linux') {
        // Linux - try apt or yum
        try {
          execSync('which apt-get', { stdio: 'ignore' });
          execSync('sudo apt-get update && sudo apt-get install -y pandoc', { stdio: 'inherit' });
          console.log(chalk.green('✅ Pandoc installed via apt'));
          return true;
        } catch (e) {
          try {
            execSync('which yum', { stdio: 'ignore' });
            execSync('sudo yum install -y pandoc', { stdio: 'inherit' });
            console.log(chalk.green('✅ Pandoc installed via yum'));
            return true;
          } catch (e2) {
            console.log(chalk.red('❌ Could not install Pandoc automatically. Please install manually:'));
            console.log(chalk.blue('   https://pandoc.org/installing.html'));
            return false;
          }
        }
      } else {
        console.log(chalk.yellow('⚠️ Automatic Pandoc installation not supported on this platform'));
        console.log(chalk.blue('   Please install Pandoc manually: https://pandoc.org/installing.html'));
        return false;
      }
    } catch (error) {
      console.log(chalk.red('❌ Failed to install Pandoc:'), error.message);
      return false;
    }
  }
}

module.exports = DependencyManager;
