import React from 'react';
import { Check, Clock, Sparkles } from 'lucide-react';
import { useDialog } from './Dialog.jsx';

// The paywall: Free, Pro and Max side by side, Pro in the middle as the recommended plan.
// A free account upgrades through checkout (onCheckout('pro' | 'max')). A subscriber switches
// between Pro and Max with the same call, which the server turns into a prorated change of the
// existing subscription, after a confirm. Cancelling and card changes go through Lemon
// Squeezy's customer portal (onManage).
//
// `soon: true` marks a perk that is sold but not built yet. It renders greyed with a clock and
// "coming soon", so it never reads as something already delivered.
// `experimental: true` marks a perk that works but is not fully tested. It renders an
// "Experimental" badge, and `detail` adds a short line under the perk.
//
// Max's limits are shown as "Unlimited" on purpose: the fair-use run cap (MAX_MONTHLY_RUNS)
// and the 100-profile safety cap live on the server and in firestore.rules, not here.

export const PLANS = [
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
      {
        text: 'First access to every new feature',
        detail: 'Try new tools before anyone else, while they are still experimental.',
      },
      {
        text: 'Job folders: every CV filed for you',
        experimental: true,
        detail: 'Pick a folder once. Every CV saves into its own company folder under the same file name. No renaming, no sorting by hand. Chrome and Edge on desktop.',
      },
      { text: 'Saved history of every CV and cover letter' },
      { text: 'Extra CV templates', soon: true },
      { text: 'Cancel any time' },
    ],
  },
];

// The pill for features that work but are not fully tested yet. Also used in the account menu.
export const ExperimentalBadge = ({ className = '' }) => (
  <span className={`inline-block rounded-full border border-berry-line bg-berry-soft px-1.5 py-px align-middle text-[10px] font-semibold uppercase tracking-wide text-berry-dark ${className}`}>
    Experimental
  </span>
);

// Stored plan -> pricing column. Pro is stored as 'paid'.
const COLUMN_FOR_PLAN = { free: 'free', paid: 'pro', max: 'max' };

const PricingModal = ({ billing, busy, onClose, onCheckout, onManage }) => {
  const dialog = useDialog();
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
        onClick: async () => {
          const ok = await dialog.confirm({
            title: `Switch to ${name}?`,
            message: `${name} is ${price}/month. The difference for the rest of this month is prorated.`,
            confirmLabel: `Switch to ${name}`,
          });
          if (ok) onCheckout(key);
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
      <div className="relative bg-white w-full max-w-4xl rounded-2xl shadow-xl overflow-hidden my-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-line">
          <h3 className="text-lg font-extrabold text-ink flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-berry" />
            Choose your plan
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-ink-muted hover:text-ink"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="p-6 space-y-4">
          {plan === 'free' && billing?.remaining === 0 && (
            <p className="text-sm text-ink">You have used all {billing.limit} free runs.</p>
          )}
          {comped && (
            <p className="text-sm text-ink">You have complimentary Max, so there is nothing to buy.</p>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:items-stretch">
            {PLANS.map((p) => {
              const a = action(p.key);
              const isCurrent = p.key === current;
              return (
                <div
                  key={p.key}
                  className={`relative flex flex-col rounded-2xl border p-5 ${
                    p.popular ? 'border-2 border-berry md:-my-2 md:py-7 shadow-md' : 'border-line'
                  }`}
                >
                  {p.popular && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-berry px-3 py-0.5 text-xs font-semibold text-white whitespace-nowrap">
                      Most popular
                    </span>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-semibold text-ink">{p.name}</span>
                    {isCurrent && (
                      <span className="rounded-full bg-leaf-soft px-2 py-0.5 text-xs font-medium text-leaf-text">{comped ? 'Complimentary' : 'Current plan'}</span>
                    )}
                  </div>
                  <div className="mt-2">
                    <span className="text-3xl font-bold text-ink">{p.price}</span>
                    <span className="text-ink-muted">{p.key === 'free' ? '' : ' / month'}</span>
                  </div>
                  <ul className="mt-4 text-sm text-ink space-y-2 flex-1">
                    {p.perks.map((perk) => (
                      <li key={perk.text} className={`flex items-start gap-2 ${perk.soon ? 'text-ink-muted' : ''}`}>
                        {perk.soon
                          ? <Clock className="h-4 w-4 mt-0.5 shrink-0 text-ink-faint" />
                          : <Check className="h-4 w-4 mt-0.5 shrink-0 text-leaf" />}
                        <span>
                          {perk.text}
                          {perk.soon && <span className="ml-1 text-xs font-medium text-ink-faint">coming soon</span>}
                          {perk.experimental && <ExperimentalBadge className="ml-1.5" />}
                          {perk.detail && <span className="mt-0.5 block text-xs text-ink-muted">{perk.detail}</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {a && (
                    <button
                      type="button"
                      onClick={a.onClick}
                      disabled={a.disabled || busy}
                      className={`mt-5 w-full px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 ${
                        a.primary
                          ? 'bg-berry hover:bg-berry-dark text-white'
                          : 'border border-line text-ink hover:bg-hover'
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
            <p className="text-xs text-danger-text">Upgrades are not available right now. Please try again later.</p>
          )}
          {subscriber && (
            <p className="text-xs text-ink-muted">Switching plans is prorated. Cancel or change your card from Manage subscription.</p>
          )}
          <p className="text-xs text-ink-muted">
            Subscriptions renew monthly until cancelled. Full refund within 7 days of your first
            payment on a plan; renewals are not refunded. See the{' '}
            <a href="/terms" target="_blank" rel="noopener" className="underline hover:text-ink">Terms of Service</a>
            {' '}and{' '}
            <a href="/privacy" target="_blank" rel="noopener" className="underline hover:text-ink">Privacy Policy</a>.
          </p>
        </div>
      </div>
    </div>
  );
};

export default PricingModal;
