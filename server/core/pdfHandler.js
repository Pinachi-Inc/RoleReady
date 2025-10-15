import multer from 'multer';
import axios from 'axios';
import PDFTextExtractor from './PDFTextExtractor.js';

// Environment-aware config getter (same as optimizeHandler)
function getConfig() {
  const isFirebase = process.env.FUNCTIONS_EMULATOR || process.env.FUNCTION_NAME;

  if (isFirebase) {
    const functions = require('firebase-functions');
    return {
      OPENAI_API_KEY: process.env.OPENAI_API_KEY || functions.config().openai?.key,
      DEFAULT_MODEL: process.env.OPENAI_MODEL || functions.config().openai?.model || 'gpt-4o-mini',
      API_BASE_URL: process.env.OPENAI_BASE_URL || functions.config().openai?.base_url || 'https://api.openai.com/v1',
      OPENROUTER_SITE_URL: process.env.OPENROUTER_SITE_URL || functions.config().openrouter?.site_url || '',
      OPENROUTER_APP_TITLE: process.env.OPENROUTER_APP_TITLE || functions.config().openrouter?.app_title || ''
    };
  } else {
    return {
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      DEFAULT_MODEL: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      API_BASE_URL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
      OPENROUTER_SITE_URL: process.env.OPENROUTER_SITE_URL || '',
      OPENROUTER_APP_TITLE: process.env.OPENROUTER_APP_TITLE || ''
    };
  }
}

// Get PDF extractor configuration from environment
function getPdfConfig() {
  return {
    samplePages: parseInt(process.env.PDF_SAMPLE_PAGES) || 3,
    maxPages: parseInt(process.env.PDF_MAX_PAGES) || 5,
    characterThreshold: parseInt(process.env.PDF_CHAR_THRESHOLD) || 50,
    dpi: parseInt(process.env.PDF_OCR_DPI) || 300
  };
}

// Configure multer for memory storage (we don't need to save files to disk)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'), false);
    }
  }
});

// Extract text from PDF buffer using the new extractor
async function extractTextFromPdf(pdfBuffer) {
  try {
    const config = getPdfConfig();
    const extractor = new PDFTextExtractor(config);
    
    const [extractedText, mode] = await extractor.extract(pdfBuffer, {
      autoDetect: true,
      dpi: config.dpi
    });
    
    console.log(`📝 Extracted ${extractedText.length} characters using ${mode} mode`);
    return { text: extractedText, mode };
  } catch (error) {
    console.error('PDF parsing error:', error);
    if (error && error.message === 'IMAGE_BASED_PDF_NOT_SUPPORTED') {
      // Image-based PDFs are not supported
      throw new Error('Image-based CVs are not supported. Please upload a text-based PDF (created from Word, Google Docs, etc.) instead of a scanned document.');
    }
    throw new Error('Failed to extract text from PDF. Please ensure the PDF is not password-protected and contains readable text.');
  }
}

// Process CV text with GPT to extract structured data
async function processWithGPT(cvText) {
  const config = getConfig();
  
  if (!config.OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured');
  }

  const aiInfoSchema = `{
  "coreSkillsBase": [
    { "category": "string", "items": ["string"] }
  ],
  "experienceSource": [
    {
      "roleId": "string",
      "title": "string",
      "company": "string",
      "location": "string",
      "start": "YYYY or YYYY-MM",
      "end": "YYYY or YYYY-MM | Present",
      "baseAchievements": ["string"]
    }
  ]
}`;

  const fixedInfoSchema = `{
  "name": "string",
  "contact": { "email": "string", "phone": "string", "location": "string", "links": ["string"] },
  "certifications": ["string"],
  "education": ["string"]
}`;

  const prompt = `Analyze the following CV text and extract information in two separate JSON objects:

CV TEXT:
${cvText}

Please provide your response in this exact format:

SKILLS_AND_EXPERIENCE:
${aiInfoSchema}

PERSONAL_INFO:
${fixedInfoSchema}

Extract all skills organized by categories, work experience with achievements, personal information, contact details, certifications, and education. Return only the JSON objects with the labels above, no additional explanation.`;

  const headers = {
    'Authorization': `Bearer ${config.OPENAI_API_KEY}`,
    'Content-Type': 'application/json'
  };

  // Add OpenRouter specific headers if using OpenRouter
  if (config.API_BASE_URL.includes('openrouter.ai')) {
    if (config.OPENROUTER_SITE_URL) {
      headers['HTTP-Referer'] = config.OPENROUTER_SITE_URL;
    }
    if (config.OPENROUTER_APP_TITLE) {
      headers['X-Title'] = config.OPENROUTER_APP_TITLE;
    }
  }

  const requestBody = {
    model: config.DEFAULT_MODEL,
    messages: [
      {
        role: 'user',
        content: prompt
      }
    ],
    max_tokens: 4000,
    temperature: 0.3 // Lower temperature for more consistent JSON output
  };

  try {
    console.log('🤖 Sending CV text to AI for processing...');
    const response = await axios.post(`${config.API_BASE_URL}/chat/completions`, requestBody, { headers });
    
    const aiResponse = response.data.choices[0]?.message?.content;
    if (!aiResponse) {
      throw new Error('No response from AI service');
    }

    console.log('✅ AI response received, parsing JSON...');
    
    // Parse the structured response
    const skillsMatch = aiResponse.match(/SKILLS_AND_EXPERIENCE:\s*(\{[\s\S]*?\})\s*(?=PERSONAL_INFO:|$)/);
    const personalMatch = aiResponse.match(/PERSONAL_INFO:\s*(\{[\s\S]*?\})\s*$/);

    if (!skillsMatch || !personalMatch) {
      throw new Error('AI response format is invalid. Could not extract both JSON objects.');
    }

    let aiUserInfo, fixedUserInfo;
    
    try {
      aiUserInfo = JSON.parse(skillsMatch[1].trim());
    } catch (error) {
      throw new Error('Invalid JSON format in skills and experience data');
    }

    try {
      fixedUserInfo = JSON.parse(personalMatch[1].trim());
    } catch (error) {
      throw new Error('Invalid JSON format in personal information data');
    }

    return {
      aiUserInfo: JSON.stringify(aiUserInfo, null, 2),
      fixedUserInfo: JSON.stringify(fixedUserInfo, null, 2),
      extractedText: cvText.substring(0, 500) + '...' // First 500 chars for debugging
    };

  } catch (error) {
    console.error('AI processing error:', error);
    if (error.response?.status === 401) {
      throw new Error('Invalid API key. Please check your OpenAI configuration.');
    } else if (error.response?.status === 429) {
      throw new Error('Rate limit exceeded. Please try again in a moment.');
    } else if (error.response?.status >= 500) {
      throw new Error('AI service temporarily unavailable. Please try again later.');
    } else {
      throw new Error(`AI processing failed: ${error.message}`);
    }
  }
}

// Main handler for PDF processing
export async function handlePdfProcessing(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No PDF file uploaded' });
    }

    console.log('📄 Processing PDF file:', req.file.originalname, `(${req.file.size} bytes)`);

    // Extract text from PDF
    const { text: cvText, mode } = await extractTextFromPdf(req.file.buffer);
    
    if (!cvText || cvText.trim().length < 50) {
      return res.status(400).json({ 
        error: 'Could not extract sufficient text from PDF. Please ensure the PDF contains readable text or clear images.' 
      });
    }

    console.log(`📝 Text extracted successfully using ${mode} mode, length: ${cvText.length}`);

    // Process with GPT
    const result = await processWithGPT(cvText);

    console.log('✅ PDF processing completed successfully');

    res.json({
      success: true,
      extractionMode: mode,
      ...result
    });

  } catch (error) {
    console.error('PDF processing error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to process PDF' 
    });
  }
}

// Export the multer middleware
export const uploadMiddleware = upload.single('pdf');
