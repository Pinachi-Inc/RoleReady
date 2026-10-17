import { getAuthHeaders } from './auth.js';

// PDF processing service
export const processPdf = async (pdfFile) => {
  const formData = new FormData();
  formData.append('pdf', pdfFile);

  try {
    // No Content-Type here on purpose — the browser sets the multipart boundary.
    const response = await fetch('/api/process-pdf', {
      method: 'POST',
      headers: { ...(await getAuthHeaders()) },
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    return result;
  } catch (error) {
    console.error('PDF processing error:', error);
    throw error;
  }
};

// Posts text the client already extracted (the browser OCR fallback) instead of a file.
// The server skips its own extraction when this field is present.
export const processPdfText = async (extractedText) => {
  const response = await fetch('/api/process-pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) },
    body: JSON.stringify({ extractedText })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `HTTP error! status: ${response.status}`);
  }
  return response.json();
};
