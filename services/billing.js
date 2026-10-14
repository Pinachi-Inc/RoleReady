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

// { plan: 'free'|'paid'|'max'|'unlimited', used, limit, remaining, window, fairUse, profileLimit,
//   historyVisible, billingAvailable, maxAvailable, hasCustomer, subscriptionStatus, renewsAt, cancelAtPeriodEnd }
// 'paid' is Pro.
export const getBillingStatus = () => postBilling('status');

// Both redirect the whole tab to Stripe; Stripe sends the user back to /?checkout=... or /.
// plan: 'pro' | 'max'. Only for free accounts; subscribers switch in the portal.
export const startCheckout = async (plan) => {
  const { url } = await postBilling('checkout', { plan });
  window.location.assign(url);
};

export const openBillingPortal = async () => {
  const { url } = await postBilling('portal');
  window.location.assign(url);
};
