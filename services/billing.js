import { getAuthHeaders } from './auth.js';

// Errors carry the server's message, plus the status so callers can branch on it.
async function postBilling(path, body = {}) {
  const response = await fetch(`/api/billing/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) },
    body: JSON.stringify(body)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || `Billing request failed: ${response.status}`);
    error.status = response.status;
    error.code = data.code || null;
    throw error;
  }
  return data;
}

// { plan: 'free'|'paid'|'max', comped, billingPlan, used, limit, remaining, window, fairUse,
//   profileLimit, unlimitedProfiles, historyVisible, billingAvailable, maxAvailable, hasCustomer,
//   subscriptionStatus, renewsAt, cancelAtPeriodEnd }
// 'paid' is Pro.
export const getBillingStatus = () => postBilling('status');

// plan: 'pro' | 'max'. For a free account this redirects the tab to Lemon Squeezy's checkout,
// which sends the user back to /?checkout=success. For a subscriber switching between Pro and
// Max the server changes the subscription in place and this resolves to { switched: plan }.
export const startCheckout = async (plan) => {
  const data = await postBilling('checkout', { plan });
  if (data.url) window.location.assign(data.url);
  return data;
};

// Lemon Squeezy's customer portal: cancel, card, invoices. Redirects the tab.

export const openBillingPortal = async () => {
  const { url } = await postBilling('portal');
  window.location.assign(url);
};
