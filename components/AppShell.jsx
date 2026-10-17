import React from 'react';
import { Zap, Clock, UserRound, Lightbulb, Sparkles } from 'lucide-react';

const NAV_BASE = 'inline-flex items-center gap-[7px] h-9 px-3 rounded-[10px] text-[13.5px] font-semibold whitespace-nowrap focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/25';
const NAV_ACTIVE = 'bg-white/10 text-white';
const NAV_IDLE = 'text-white/80 hover:bg-white/10 hover:text-white';

export function TopBar({ page, onNavigate, onTips, profileSwitcher, account }) {
  const items = [
    { id: 'main', label: 'Optimize', Icon: Zap },
    { id: 'history', label: 'History', Icon: Clock },
    { id: 'setup', label: 'Your info', Icon: UserRound }
  ];
  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-2 bg-ink px-4 sm:px-6 py-2.5">
      <img src="/roleberry-logo-dark.svg" alt="Roleberry" className="h-[26px] w-auto mr-2 sm:mr-4" />
      <nav aria-label="App" className="flex flex-wrap gap-0.5">
        {items.map(({ id, label, Icon }) => {
          const active = page === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onNavigate(id)}
              aria-current={active ? 'page' : undefined}
              className={`${NAV_BASE} ${active ? NAV_ACTIVE : NAV_IDLE}`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          );
        })}
        <button type="button" onClick={() => onTips()} className={`${NAV_BASE} ${NAV_IDLE}`}>
          <Lightbulb className="h-4 w-4" />
          Tips
        </button>
      </nav>
      <div className="flex-1" />
      {profileSwitcher}
      {account}
    </header>
  );
}

export function PlanStrip({ billing, billingNotice, billingBusy, onUpgrade, onPlans, onManage }) {
  if (!billing) return null;

  const planName = billing.plan === 'paid'
    ? 'Pro'
    : billing.plan === 'max'
      ? (billing.comped ? 'Max (complimentary)' : 'Max')
      : 'Free';

  const hasLimit = billing.limit != null;
  const pct = hasLimit && billing.limit > 0
    ? Math.min(100, Math.max(0, Math.round((100 * billing.remaining) / billing.limit)))
    : 0;

  let usage = null;
  if (billing.plan === 'free' && hasLimit) {
    usage = `${billing.remaining} of ${billing.limit} free runs left`;
  } else if (billing.plan === 'paid' && hasLimit) {
    usage = `${billing.remaining} of ${billing.limit.toLocaleString()} runs left this month`;
  } else if (billing.plan === 'max') {
    usage = 'Unlimited runs';
  }
  const endNote = (billing.plan === 'paid' || billing.plan === 'max') && billing.cancelAtPeriodEnd && billing.renewsAt
    ? ` · ends ${new Date(billing.renewsAt).toLocaleDateString()}`
    : '';

  const showManage = (billing.plan === 'paid' || billing.plan === 'max') && billing.hasCustomer
    && (!billing.comped || (billing.billingPlan && billing.billingPlan !== 'free'));

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-blush px-4 sm:px-6 py-2 text-[13px] text-ink-muted dark:bg-night-surface dark:border-night-line dark:text-night-muted">
      <span className="font-bold text-ink dark:text-night-text">{planName}</span>
      {(usage || endNote) && <span>{usage}{endNote}</span>}
      {hasLimit && (
        <span className="inline-block h-1.5 w-[120px] overflow-hidden rounded-full bg-line dark:bg-night-line">
          <span className="block h-full bg-berry" style={{ width: pct + '%' }} />
        </span>
      )}
      {billingNotice && <span className="text-leaf-text dark:text-leaf-light">{billingNotice}</span>}
      <div className="flex-1" />
      {billing.plan === 'free' && billing.billingAvailable && (
        <button
          type="button"
          onClick={onUpgrade}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-berry text-white font-semibold hover:bg-berry-dark"
        >
          <Sparkles className="h-3.5 w-3.5" />
          Upgrade
        </button>
      )}
      {(billing.plan === 'paid' || billing.plan === 'max') && (
        <button type="button" onClick={onPlans} className="font-semibold text-berry hover:text-berry-dark">
          Plans
        </button>
      )}
      {showManage && (
        <button
          type="button"
          onClick={onManage}
          disabled={billingBusy}
          className="font-semibold text-ink-muted hover:text-ink disabled:opacity-50"
        >
          Manage subscription
        </button>
      )}
    </div>
  );
}
