export const optimizeCv = async ({ jobDescription, aiUserInfo, fixedUserInfo, maxTokens = 4000, temperature = 0.7 }) => {
  const response = await fetch('/api/optimize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobDescription, aiUserInfo, fixedUserInfo, max_tokens: maxTokens, temperature })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API request failed: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data; // includes cvContent, keywords, and cv (structured)
};


