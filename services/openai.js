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
    const errorText = await response.text();
    throw new Error(`API request failed: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data; // includes cvContent, keywords, and cv (structured)
};


