import { getAuthHeaders } from './auth.js';

export const detectAiContent = async (text) => {
  const response = await fetch('/api/detect-ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) },
    body: JSON.stringify({ text })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`AI detect failed: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data.score; // 0.0–1.0
};

export const optimizeCv = async ({ jobDescription, aiUserInfo, fixedUserInfo, maxTokens = 4000, temperature = 0.45, includeCoverLetter = false }) => {
  const response = await fetch('/api/optimize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) },
    body: JSON.stringify({ jobDescription, aiUserInfo, fixedUserInfo, max_tokens: maxTokens, temperature, includeCoverLetter })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API request failed: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data; // includes cvContent, keywords, and cv (structured)
};


