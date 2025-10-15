# PDF Extraction Configuration

## Overview

The PDF upload feature automatically detects whether a PDF is text-based or image-based, and uses the appropriate extraction method:

- **Text-based PDFs**: Fast text extraction using `pdfjs-dist`
- **Image-based PDFs**: OCR using `tesseract.js` (single-threaded)

## Environment Variables

Add these to your `.env` file to customize PDF extraction behavior:

```bash
# PDF Extraction Configuration (Optional - uses defaults if not set)
PDF_SAMPLE_PAGES=3          # Number of pages to sample for text detection (default: 3)
PDF_MAX_PAGES=5             # Maximum pages to process (default: 5)
PDF_CHAR_THRESHOLD=50       # Character threshold for text detection (default: 50)
PDF_OCR_DPI=300             # DPI for OCR image rendering (default: 300)
```

## Configuration Details

### PDF_SAMPLE_PAGES
- **Default**: 3
- **Description**: Number of initial pages to sample when determining if PDF is text-based or image-based
- **Range**: 1-10 recommended
- **Impact**: Higher values = more accurate detection but slower initial analysis

### PDF_MAX_PAGES
- **Default**: 5
- **Description**: Maximum number of pages to process from the PDF
- **Range**: 1-20 (5 recommended for performance)
- **Impact**: More pages = longer processing time, especially for OCR
- **Note**: CV information is typically in first few pages

### PDF_CHAR_THRESHOLD
- **Default**: 50
- **Description**: Minimum characters required on a page to classify as text-based
- **Range**: 20-100 recommended
- **Impact**: Lower values may classify scanned PDFs as text-based incorrectly

### PDF_OCR_DPI
- **Default**: 300
- **Description**: Resolution for rendering PDF pages before OCR
- **Range**: 150-600
- **Impact**: 
  - Higher DPI = better OCR accuracy but slower and more memory
  - 300 DPI is optimal for most CVs
  - 150 DPI for faster processing
  - 600 DPI for low-quality scans

## Performance Estimates

### Text-based PDF (5 pages)
- Processing time: 1-3 seconds
- Memory usage: Low (~50MB)

### Image-based PDF (5 pages, 300 DPI)
- Processing time: 15-25 seconds
- Memory usage: Medium (~200-300MB)

## File Limits

- **Maximum file size**: 10MB
- **Supported format**: PDF only
- **Password-protected PDFs**: Not supported

## Deployment Notes

### Vercel
- ✅ Text extraction: Fast and works well
- ✅ OCR: Works but may timeout on large files (increase timeout if needed)
- ⚠️ Memory: Watch memory usage for OCR operations

### Firebase Functions
- ✅ Text extraction: Works well
- ⚠️ OCR: May require higher memory tier for reliable operation
- 💡 Consider increasing function timeout to 60s for OCR

### Local/Docker
- ✅ Both methods work perfectly
- No special configuration needed

