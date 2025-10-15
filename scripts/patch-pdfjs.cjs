/**
 * Patch pdfjs-dist to work on Vercel serverless functions
 * 
 * Issue: pdfjs-dist hardcodes './pdf.worker.js' which doesn't work in serverless
 * Solution: Replace with __dirname + "/pdf.worker.js" to use absolute path
 * 
 * Reference: https://stackoverflow.com/questions/74282002/using-pdfjs-dist-on-vercel-serverless-function
 */

const fs = require('fs');
const path = require('path');

console.log('🔧 Patching pdfjs-dist for Vercel compatibility...');

// Path to the pdfjs-dist legacy build
const pdfJsPath = path.join(__dirname, '..', 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.js');

if (!fs.existsSync(pdfJsPath)) {
  console.error('❌ pdfjs-dist not found at:', pdfJsPath);
  process.exit(1);
}

try {
  // Read the file
  const content = fs.readFileSync(pdfJsPath, { encoding: 'utf-8' });
  
  // Replace the hardcoded worker path with __dirname-based path
  // This makes it work in serverless environments where relative paths don't work
  const patchedContent = content.replace(
    '"./pdf.worker.js"',
    '__dirname + "/pdf.worker.js"'
  );
  
  // Check if replacement was made
  if (content === patchedContent) {
    console.log('⚠️  Warning: No replacement made - pattern not found or already patched');
  } else {
    // Write the patched file back
    fs.writeFileSync(pdfJsPath, patchedContent, { encoding: 'utf-8' });
    console.log('✅ Successfully patched pdfjs-dist worker path');
  }
} catch (error) {
  console.error('❌ Error patching pdfjs-dist:', error.message);
  process.exit(1);
}

