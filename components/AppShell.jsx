import React from 'react';
import { Zap, Clock, UserRound, Sparkles } from 'lucide-react';
import { prefetchHistory } from '../services/history.js';

const NAV_BASE = 'flex flex-col justify-center sm:flex-row sm:inline-flex items-center gap-1 sm:gap-[7px] h-14 sm:h-9 px-1 sm:px-3 rounded-[10px] text-[12px] sm:text-[13.5px] font-semibold whitespace-nowrap focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/25';
const NAV_ACTIVE = 'bg-white/10 text-white';
const NAV_IDLE = 'text-white/80 hover:bg-white/10 hover:text-white';

export function TopBar({ page, onNavigate, profileSwitcher, account }) {
  // The logo and Optimize both open the main page, so they are one button: a single hover and
  // active state covers both, with a thin divider between the logo and the label.
  const items = [
    { id: 'history', label: 'History', Icon: Clock },
    { id: 'setup', label: 'Your info', Icon: UserRound }
  ];
  const homeActive = page === 'main';
  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-2 bg-ink px-4 sm:px-6 py-2.5">
      <button
        type="button"
        onClick={() => onNavigate('main')}
        aria-label="Optimize"
        aria-current={homeActive ? 'page' : undefined}
        className={`group inline-flex items-center h-11 sm:h-10 pl-2.5 pr-2.5 sm:pr-3 rounded-xl ring-1 ring-inset transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/25 ${homeActive ? 'bg-white/10 ring-white/15 text-white' : 'ring-white/10 text-white/80 hover:bg-white/10 hover:ring-white/15 hover:text-white'}`}
      >
        <img src="/roleberry-logo-dark.svg" alt="" className="h-[24px] sm:h-[26px] w-auto" />
        <span aria-hidden="true" className={`mx-2.5 sm:mx-3 h-5 w-px transition-colors ${homeActive ? 'bg-white/30' : 'bg-white/20 group-hover:bg-white/30'}`} />
        <span className="inline-flex items-center gap-[7px] text-[13.5px] font-semibold whitespace-nowrap">
          <Zap className="h-4 w-4" />
          {/* Phones show the bolt only, so the profile switcher and avatar still fit on the row. */}
          <span className="hidden sm:inline">Optimize</span>
        </span>
      </button>
      <nav aria-label="App" className="order-last w-full grid grid-cols-2 gap-1 sm:order-none sm:w-auto sm:flex sm:flex-row sm:flex-wrap sm:gap-0.5">
        {items.map(({ id, label, Icon }) => {
          const active = page === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onNavigate(id)}
              // Starts loading History while the pointer is on its way to the click.
              onPointerEnter={id === 'history' ? () => prefetchHistory() : undefined}
              onFocus={id === 'history' ? () => prefetchHistory() : undefined}
              aria-current={active ? 'page' : undefined}
              className={`${NAV_BASE} ${active ? NAV_ACTIVE : NAV_IDLE}`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          );
        })}
      </nav>
      <div className="flex-1" />
      {profileSwitcher}
      {account}
    </header>
  );
}

export function PlanStrip({ billing, billingNotice, onUpgrade, onPlans }) {
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
    </div>
  );
}
