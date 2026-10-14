import { getAuthHeaders } from './auth.js';

async function postHistory(body) {
  const response = await fetch('/api/history', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) },
    body: JSON.stringify(body)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || `History request failed: ${response.status}`);
    error.status = response.status;
    error.code = data.code || null;
    throw error;
  }
  return data;
}

// Paid: { locked: false, runs: [{ id, createdAt, companyName, jobTitle, profileName, hasCoverLetter }] }
// Free: { locked: true, lockedCount, runs: [] }
export const listHistory = () => postHistory({});

// { id, createdAt, companyName, jobTitle, profileName, cv, cvContent, coverLetter }
export const getHistoryRun = async (id) => (await postHistory({ id })).run;
