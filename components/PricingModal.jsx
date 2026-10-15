import React from 'react';
import { Check, Clock, Sparkles } from 'lucide-react';

// The paywall: Free, Pro and Max side by side, Pro in the middle as the recommended plan.
// A free account upgrades through checkout (onCheckout('pro' | 'max')). A subscriber switches
// between Pro and Max with the same call, which the server turns into a prorated change of the
// existing subscription, after a confirm. Cancelling and card changes go through Lemon
// Squeezy's customer portal (onManage).
//
// `soon: true` marks a perk that is sold but not built yet. It renders greyed with a clock and
// "coming soon", so it never reads as something already delivered.
//
// Max's limits are shown as "Unlimited" on purpose: the fair-use run cap (MAX_MONTHLY_RUNS)
// and the 100-profile safety cap live on the server and in firestore.rules, not here.

const PLANS = [
  {
    key: 'free',
    name: 'Free',
    price: '$0',
    perks: [
      { text: '5 optimizations in total' },
      { text: '1 saved profile' },
      { text: 'Your last 5 runs in history' },
    ],
  },
  {
    key: 'pro',
    name: 'Pro',
    price: '$12',
    popular: true,
    perks: [
      { text: '1,000 optimizations every month' },
      { text: 'Saved profiles (up to 3)' },
      { text: 'Saved history of every CV and cover letter' },
      { text: 'Cancel any time' },
    ],
  },
  {
    key: 'max',
    name: 'Max',
    price: '$49',
    perks: [
      { text: 'Unlimited optimizations' },
      { text: 'Unlimited saved profiles' },
      { text: 'Saved history of every CV and cover letter' },
      { text: 'Extra CV templates', soon: true },
      { text: 'Cancel any time' },
    ],
  },
];

// Stored plan -> pricing column. Pro is stored as 'paid'.
const COLUMN_FOR_PLAN = { free: 'free', paid: 'pro', max: 'max' };

const PricingModal = ({ billing, busy, onClose, onCheckout, onManage }) => {
  const plan = billing?.plan || 'free';
  const current = COLUMN_FOR_PLAN[plan] || null;
  // Complimentary Max: the Max column is current and nothing is for sale.
  const comped = Boolean(billing?.comped);
  const subscriber = !comped && (plan === 'paid' || plan === 'max');

  const action = (key) => {
    if (comped || key === 'free') return null;
    if (key === current) {
      return billing?.hasCustomer
        ? { label: 'Manage subscription', onClick: onManage, primary: false }
        : null;
    }
    if (subscriber) {
      const name = key === 'max' ? 'Max' : 'Pro';
      const price = key === 'max' ? '$49' : '$12';
      return {
        label: `Switch to ${name}`,
        onClick: () => {
          if (window.confirm(`Switch to ${name} for ${price}/month? The difference for the rest of this month is prorated.`)) onCheckout(key);
        },
        primary: key === 'max',
      };
    }
    const available = key === 'max' ? billing?.maxAvailable : billing?.billingAvailable;
    return {
      label: busy ? 'Opening checkout…' : `Upgrade to ${key === 'max' ? 'Max' : 'Pro'}`,
      onClick: () => onCheckout(key),
      primary: true,
      disabled: busy || (billing && !available),
    };
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="absolute inset-0 bg-black/50" onClick={onClose}></div>
      <div className="relative bg-white w-full max-w-4xl rounded-lg shadow-xl overflow-hidden my-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h3 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-amber-500" />
            Choose your plan
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="p-6 space-y-4">
          {plan === 'free' && billing?.remaining === 0 && (
            <p className="text-sm text-gray-700">You have used all {billing.limit} free optimizations.</p>
          )}
          {comped && (
            <p className="text-sm text-gray-700">You have complimentary Max, so there is nothing to buy.</p>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:items-stretch">
            {PLANS.map((p) => {
              const a = action(p.key);
              const isCurrent = p.key === current;
              return (
                <div
                  key={p.key}
                  className={`relative flex flex-col rounded-lg border p-5 ${
                    p.popular ? 'border-amber-500 ring-2 ring-amber-400 md:-my-2 md:py-7 shadow-md' : 'border-gray-200'
                  }`}
                >
                  {p.popular && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-3 py-0.5 text-xs font-semibold text-white whitespace-nowrap">
                      Most popular
                    </span>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-semibold text-gray-900">{p.name}</span>
                    {isCurrent && (
                      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">{comped ? 'Complimentary' : 'Current plan'}</span>
                    )}
                  </div>
                  <div className="mt-2">
                    <span className="text-3xl font-bold text-gray-900">{p.price}</span>
                    <span className="text-gray-600">{p.key === 'free' ? '' : ' / month'}</span>
                  </div>
                  <ul className="mt-4 text-sm text-gray-700 space-y-2 flex-1">
                    {p.perks.map((perk) => (
                      <li key={perk.text} className={`flex items-start gap-2 ${perk.soon ? 'text-gray-500' : ''}`}>
                        {perk.soon
                          ? <Clock className="h-4 w-4 mt-0.5 shrink-0 text-gray-400" />
                          : <Check className="h-4 w-4 mt-0.5 shrink-0 text-green-600" />}
                        <span>
                          {perk.text}
                          {perk.soon && <span className="ml-1 text-xs font-medium text-gray-400">coming soon</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {a && (
                    <button
                      type="button"
                      onClick={a.onClick}
                      disabled={a.disabled || busy}
                      className={`mt-5 w-full px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50 ${
                        a.primary
                          ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:from-amber-600 hover:to-orange-600'
                          : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {a.label}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {plan === 'free' && billing && !billing.billingAvailable && (
            <p className="text-xs text-red-600">Upgrades are not available right now. Please try again later.</p>
          )}
          {subscriber && (
            <p className="text-xs text-gray-500">Switching plans is prorated. Cancel or change your card from Manage subscription.</p>
          )}
          <p className="text-xs text-gray-500">
            Subscriptions renew monthly until cancelled. Full refund within 7 days of your first
            payment on a plan; renewals are not refunded. See the{' '}
            <a href="/terms" target="_blank" rel="noopener" className="underline hover:text-gray-700">Terms of Service</a>
            {' '}and{' '}
            <a href="/privacy" target="_blank" rel="noopener" className="underline hover:text-gray-700">Privacy Policy</a>.
          </p>
        </div>
      </div>
    </div>
  );
};

export default PricingModal;
