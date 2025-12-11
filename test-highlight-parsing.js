const { marked } = require("marked");

marked.setOptions({
  breaks: true,
  gfm: true,
  headerIds: false,
  mangle: false,
});

const testMarkdown = `# Test

<highlight>

This should be highlighted.

</highlight>

This should NOT be highlighted.

<highlight>

Another block.

</highlight>

Regular text.`;

console.log("Input Markdown:");
console.log(testMarkdown);
console.log("\n" + "=".repeat(80) + "\n");
console.log("Output HTML:");
console.log(marked(testMarkdown));

