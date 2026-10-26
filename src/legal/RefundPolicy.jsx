import React from 'react';
import { LEGAL } from './config.js';

// The refund and cancellation rules. The Terms render the same two paragraphs, so the rules live
// here once. Change them only together with the plan rules in TermsOfService.jsx.

const Mail = () => <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>;

export const Cancelling = () => (
  <p>
    <strong>Cancelling.</strong> Cancel any time from Manage subscription. You keep your plan
    until the end of the period you have paid for, then move to Free. Your saved data stays;
    history beyond the Free limit and extra saved profiles become read-only or locked until you
    subscribe again.
  </p>
);

export const Refunds = () => (
  <p>
    <strong>Refunds.</strong> If {LEGAL.product} is not for you, ask for a full refund within 7
    days of your first payment on a plan by writing to <Mail />. We do not refund renewals or
    partly used months. We do refund charges caused by a billing error on our side, and we
    refund or credit you for a long outage on our side. Switching between Pro and Max is not a
    refund: the difference is prorated instead. Approved refunds are issued
    through {LEGAL.merchant} to the payment method you used. If you are a consumer in the EU or UK, you
    also have 14 days from subscribing to withdraw. By using a paid feature during that time
    you ask us to start straight away, and any refund is reduced in proportion to the period
    you used. None of this limits other rights you have under consumer law.
  </p>
);

const RefundPolicy = () => (
  <>
    <p>
      This policy covers paid {LEGAL.product} plans (Pro at $12 per month and Max at $49 per month).
      Orders are processed by {LEGAL.merchant}, {LEGAL.merchantNames}, whichever is named at checkout
      and on your receipt. It is the merchant of record for all orders and issues any refund. The
      full rules for plans and payment are in our <a href="/terms">Terms of Service</a>.
    </p>
    <h2>Cancelling</h2>
    <Cancelling />
    <h2>Refunds</h2>
    <Refunds />
    <h2>How to ask</h2>
    <p>
      Write to <Mail /> from the email address on your account. We usually answer within a day.
    </p>
  </>
);

export default RefundPolicy;
