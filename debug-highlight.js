const fs = require('fs');
const path = require('path');
const ContentProcessor = require('./src/content-processor');

const testFile = 'test-highlight-closing.md';
const content = fs.readFileSync(testFile, 'utf8');

const processor = new ContentProcessor();
const result = processor.processContent(content, testFile);

console.log('Document Settings:');
console.log(JSON.stringify(result.documentSettings, null, 2));
console.log('\n' + '='.repeat(80) + '\n');
console.log('HTML Output (first 2000 chars):');
console.log(result.htmlContent.substring(0, 2000));
console.log('\n' + '='.repeat(80) + '\n');

// Save to file for inspection
fs.writeFileSync('/tmp/debug-highlight.html', result.htmlContent);
console.log('Full HTML saved to: /tmp/debug-highlight.html');

