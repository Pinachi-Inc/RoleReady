import React, { useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { LEGAL, isDraft } from '../src/legal/config.js';
import { openFeedback } from '../services/feedback.js';
import PrivacyPolicy from '../src/legal/PrivacyPolicy.jsx';
import TermsOfService from '../src/legal/TermsOfService.jsx';
import RefundPolicy from '../src/legal/RefundPolicy.jsx';

// /privacy, /terms and /refunds. Rendered outside the app (no sign-in needed) because payment
// providers' reviewers, Google's OAuth consent screen and anyone deciding whether to sign up all need to read them first.

export const LEGAL_PAGES = {
  '/privacy': { title: 'Privacy Policy', Body: PrivacyPolicy },
  '/terms': { title: 'Terms of Service', Body: TermsOfService },
  '/refunds': { title: 'Refund and Cancellation Policy', Body: RefundPolicy },
};

// Prose styling scoped to this page, so the policy text stays plain JSX.
const PROSE = [
  '[&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mt-10 [&_h2]:mb-3',
  '[&_h3]:font-semibold [&_h3]:mt-6 [&_h3]:mb-2',
  '[&_p]:my-3 [&_p]:leading-relaxed',
  '[&_ul]:list-disc [&_ul]:pl-6 [&_ul]:my-3 [&_li]:my-1.5 [&_li]:leading-relaxed',
  '[&_a]:text-blue-700 [&_a]:underline dark:[&_a]:text-blue-400',
  '[&_table]:w-full [&_table]:my-4 [&_table]:text-sm [&_table]:border-collapse',
  '[&_th]:text-left [&_th]:font-semibold [&_th]:border-b [&_th]:border-gray-300 [&_th]:py-2 [&_th]:pr-3 dark:[&_th]:border-gray-600',
  '[&_td]:align-top [&_td]:border-b [&_td]:border-gray-200 [&_td]:py-2 [&_td]:pr-3 dark:[&_td]:border-gray-700',
].join(' ');

const LegalPage = ({ path }) => {
  const page = LEGAL_PAGES[path];

  useEffect(() => {
    document.title = `${page.title} · ${LEGAL.product}`;
  }, [page.title]);

  const { Body } = page;
  const others = Object.entries(LEGAL_PAGES).filter(([p]) => p !== path);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-900 dark:text-gray-100">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
        <a href="/" className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100">
          <ArrowLeft className="h-4 w-4" />
          Back to {LEGAL.product}
        </a>

        {isDraft() && (
          <div className="mt-6 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
            Draft. Details in [square brackets] are still to be filled in, and this text has not
            been reviewed by a lawyer yet.
          </div>
        )}

        <h1 className="mt-6 text-3xl font-bold">{page.title}</h1>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Effective {LEGAL.effectiveDate}</p>

        <article className={`mt-6 text-[15px] text-gray-800 dark:text-gray-200 overflow-x-auto ${PROSE}`}>
          <Body />
        </article>

        <footer className="mt-12 pt-6 border-t border-gray-200 dark:border-gray-700 text-sm text-gray-500 dark:text-gray-400 flex flex-wrap gap-4">
          {others.map(([p, { title }]) => (
            <a key={p} href={p} className="hover:text-gray-900 dark:hover:text-gray-100">{title}</a>
          ))}
          <a href={`mailto:${LEGAL.email}`} className="hover:text-gray-900 dark:hover:text-gray-100">Contact</a>
          <button type="button" onClick={() => openFeedback({ type: 'bug' })} className="hover:text-gray-900 dark:hover:text-gray-100">
            Report a problem
          </button>
        </footer>
      </div>
    </div>
  );
};

export default LegalPage;
