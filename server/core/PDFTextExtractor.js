import pdfjs from 'pdfjs-dist/legacy/build/pdf.js';

// Configuration with defaults
const DEFAULT_CONFIG = {
  samplePages: 3,
  maxPages: 5,
  characterThreshold: 50,
  dpi: 300,
  imageFormat: 'png'
};

export class PDFTextExtractor {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Check if PDF is text-based by sampling first N pages
   * @param {Buffer} pdfBuffer - PDF file buffer
   * @param {number} samplePages - Number of pages to sample (default: 3)
   * @returns {Promise<boolean>} - true if text-based, false if image-based
   */
  async isTextBased(pdfBuffer, samplePages = this.config.samplePages) {
    try {
      // Convert Buffer to Uint8Array for pdfjs-dist
      const uint8Array = new Uint8Array(pdfBuffer);
      const loadingTask = pdfjs.getDocument({ data: uint8Array, useWorkerFetch: false, isEvalSupported: false, workerPort: null, disableWorker: true });
      const pdfDoc = await loadingTask.promise;
      
      const numPages = Math.min(samplePages, pdfDoc.numPages);
      
      for (let i = 1; i <= numPages; i++) {
        const page = await pdfDoc.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ');
        
        if (pageText.length > this.config.characterThreshold) {
          console.log(`✅ Page ${i} has ${pageText.length} chars - classified as text-based`);
          return true;
        }
      }
      
      console.log(`❌ No page had more than ${this.config.characterThreshold} chars - classified as image-based`);
      return false;
    } catch (error) {
      console.error('Error detecting PDF type:', error);
      throw new Error('Failed to analyze PDF type');
    }
  }

  /**
   * Extract text from text-based PDF
   * @param {Buffer} pdfBuffer - PDF file buffer
   * @returns {Promise<string>} - Extracted text
   */
  async extractTextBased(pdfBuffer) {
    try {
      // Convert Buffer to Uint8Array for pdfjs-dist
      const uint8Array = new Uint8Array(pdfBuffer);
      const loadingTask = pdfjs.getDocument({ data: uint8Array, useWorkerFetch: false, isEvalSupported: false, workerPort: null, disableWorker: true });
      const pdfDoc = await loadingTask.promise;
      
      const numPages = Math.min(this.config.maxPages, pdfDoc.numPages);
      const textParts = [];
      
      console.log(`📄 Extracting text from ${numPages} pages...`);
      
      for (let i = 1; i <= numPages; i++) {
        const page = await pdfDoc.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ');
        textParts.push(pageText);
        console.log(`  Page ${i}: ${pageText.length} characters extracted`);
      }
      
      return textParts.join('\n\n');
    } catch (error) {
      console.error('Error extracting text:', error);
      throw new Error('Failed to extract text from PDF');
    }
  }

  /**
   * Extract text from image-based PDF using OCR
   * @param {Buffer} pdfBuffer - PDF file buffer
   * @param {number} dpi - DPI for image rendering (default: 300)
   * @returns {Promise<string>} - Extracted text via OCR
   */
  async extractImageBased(pdfBuffer, dpi = this.config.dpi) {
    // OCR is disabled - image-based PDFs are not supported
    console.log('❌ Image-based PDF detected - OCR is disabled');
    throw new Error('IMAGE_BASED_PDF_NOT_SUPPORTED');
  }

  /**
   * Main extraction method with auto-detection
   * @param {Buffer} pdfBuffer - PDF file buffer
   * @param {Object} options - Extraction options
   * @param {boolean} options.autoDetect - Auto-detect text vs image (default: true)
   * @param {string} options.forceMode - Force mode: 'text' or 'ocr' (default: null)
   * @param {number} options.dpi - DPI for OCR (default: 300)
   * @returns {Promise<[string, string]>} - [extractedText, modeUsed]
   */
  async extract(pdfBuffer, options = {}) {
    const {
      autoDetect = true,
      forceMode = null,
      dpi = this.config.dpi
    } = options;
    
    let mode;
    let extractedText;
    
    try {
      // Determine extraction mode
      if (forceMode) {
        mode = forceMode === 'text' ? 'text' : 'ocr';
        console.log(`🔧 Force mode: ${mode}`);
      } else if (autoDetect) {
        const isText = await this.isTextBased(pdfBuffer);
        mode = isText ? 'text' : 'ocr';
        console.log(`🔍 Auto-detected mode: ${mode}`);
      } else {
        mode = 'text'; // Default to text extraction
      }
      
      // Extract text using the determined mode
      if (mode === 'text') {
        extractedText = await this.extractTextBased(pdfBuffer);
      } else {
        extractedText = await this.extractImageBased(pdfBuffer, dpi);
      }
      
      // Validate we got some text
      if (!extractedText || extractedText.trim().length === 0) {
        throw new Error('No text could be extracted from the PDF');
      }
      
      console.log(`✅ Extraction complete: ${extractedText.length} total characters`);
      return [extractedText, mode];
      
    } catch (error) {
      console.error('PDF extraction failed:', error);
      throw error;
    }
  }
}

export default PDFTextExtractor;

