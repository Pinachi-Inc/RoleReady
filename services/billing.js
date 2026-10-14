import { getAuthHeaders } from './auth.js';

// Errors carry the server's message, plus the status so callers can branch on it.
async function postBilling(path) {
  const response = await fetch(`/api/billing/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) },
    body: '{}'
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || `Billing request failed: ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

// { plan, used, limit, remaining, window, billingAvailable, hasCustomer, subscriptionStatus, renewsAt, cancelAtPeriodEnd }
export const getBillingStatus = () => postBilling('status');

// Both redirect the whole tab to Stripe; Stripe sends the user back to /?checkout=... or /.
export const startCheckout = async () => {
  const { url } = await postBilling('checkout');
  window.location.assign(url);
};

export const openBillingPortal = async () => {
  const { url } = await postBilling('portal');
  window.location.assign(url);
};
