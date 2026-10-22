import { getAuthHeaders } from './auth.js';

export const optimizeCv = async ({ jobDescription, aiUserInfo, fixedUserInfo, maxTokens = 4000, temperature = 0.45, includeCoverLetter = false, profileId = null, profileName = null }) => {
  const response = await fetch('/api/optimize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) },
    body: JSON.stringify({ jobDescription, aiUserInfo, fixedUserInfo, max_tokens: maxTokens, temperature, includeCoverLetter, profileId, profileName })
  });

  // Out of optimizations. Surfaced as a typed error so the UI can show the paywall
  // instead of a generic failure alert.
  if (response.status === 402) {
    const data = await response.json().catch(() => ({}));
    const error = new Error(data.error || 'Upgrade required');
    error.code = data.code || 'upgrade_required';
    error.quota = data.quota || null;
    throw error;
  }

  if (!response.ok) {
    // The server answers { error: '<sentence for the user>' }; fall back to the raw text.
    const errorText = await response.text();
    let detail = errorText;
    try {
      const parsed = JSON.parse(errorText);
      if (typeof parsed?.error === 'string') detail = parsed.error;
    } catch {}
    const error = new Error(`API request failed: ${response.status} - ${detail}`);
    error.status = response.status;
    error.detail = detail;
    throw error;
  }

  const data = await response.json();
  return data; // includes cvContent, keywords, and cv (structured)
};


