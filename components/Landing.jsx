import React, { useState } from 'react';
import { Check, Clock, ClipboardPaste, Download, UserRound } from 'lucide-react';
import { PLANS } from './PricingModal.jsx';

// The signed-out home: what RoleBerry does, a before/after example and the prices, with the
// sign-in block (passed in as `signIn`, the same <Auth> the app always used) above the fold.
// Everything here is static: no model calls happen before sign-in.
// Plans come from PricingModal's PLANS so the landing page and the paywall never disagree.

const INK = '#24131C';
const BERRY = '#B8174F';
const LEAF = '#2F8F5B';

// The F1 wordmark. The -dark file has a light fill for the ink hero; roleberry-logo.svg is the
// ink-coloured version for light backgrounds.
const Wordmark = ({ className = '' }) => (
  <img src="/roleberry-logo-dark.svg" alt="Roleberry" className={className} />
);

// The hero visual: the same person's CV, fanned out, one per job.
const STACK = [
  { role: 'Frontend Engineer', company: 'Fintech', tags: ['React', 'TypeScript'] },
  { role: 'Product Engineer', company: 'SaaS', tags: ['A/B tests', 'Node'] },
  { role: 'UI Developer', company: 'Agency', tags: ['Design systems', 'a11y'] },
];

const CardStack = () => (
  <div className="relative mx-auto h-56 w-64 sm:h-64 sm:w-72" aria-hidden="true">
    {STACK.map((cv, i) => {
      const angle = (i - 1) * 9;
      return (
        <div
          key={cv.role}
          className="absolute inset-x-6 top-2 rounded-lg bg-white p-4 shadow-xl"
          style={{ transform: `rotate(${angle}deg) translateX(${(i - 1) * 18}px)`, transformOrigin: 'bottom center', zIndex: i === 1 ? 3 : 1 }}
        >
          <div className="h-2 w-16 rounded" style={{ backgroundColor: INK }} />
          <div className="mt-2 text-sm font-bold" style={{ color: INK }}>{cv.role}</div>
          <div className="text-xs text-gray-500">{cv.company}</div>
          <div className="mt-3 space-y-1.5">
            <div className="h-1.5 w-full rounded bg-gray-200" />
            <div className="h-1.5 w-5/6 rounded bg-gray-200" />
            <div className="h-1.5 w-4/6 rounded bg-gray-200" />
          </div>
          <div className="mt-3 flex flex-wrap gap-1">
            {cv.tags.map((t) => (
              <span key={t} className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-white" style={{ backgroundColor: LEAF }}>{t}</span>
            ))}
          </div>
        </div>
      );
    })}
  </div>
);

const STEPS = [
  { icon: UserRound, title: 'Add your profile once', text: 'Upload your CV or fill in your experience. It is kept for every application.' },
  { icon: ClipboardPaste, title: 'Paste the job posting', text: 'Drop in the posting text. RoleBerry picks out the skills and keywords it asks for.' },
  { icon: Download, title: 'Download CV and cover letter', text: 'Get a CV rewritten around that role, plus a matching cover letter, as PDFs.' },
];

// Words the example posting asks for, highlighted where the tailored CV uses them.
const Kw = ({ children }) => (
  <mark className="rounded px-0.5 font-semibold" style={{ backgroundColor: 'rgba(47, 143, 91, 0.14)', color: LEAF }}>
    {children}
  </mark>
);

const CvPanel = ({ label, title, bullets, accent }) => (
  <div className="h-full bg-white p-5 sm:p-6">
    <div className="mb-3 text-xs font-semibold uppercase tracking-wide" style={{ color: accent }}>{label}</div>
    <div className="text-lg font-bold" style={{ color: INK }}>{title}</div>
    <ul className="mt-3 space-y-2 text-sm leading-relaxed text-gray-700">
      {bullets.map((b, i) => <li key={i}>• {b}</li>)}
    </ul>
  </div>
);

const BEFORE = {
  label: 'Before: generic CV',
  title: 'Software Developer',
  bullets: [
    'Worked on various frontend projects.',
    'Helped the team with UI components.',
    'Fixed bugs and improved performance.',
  ],
};

const AFTER = {
  label: 'After: tailored to the posting',
  title: 'Senior Frontend Engineer',
  bullets: [
    <>Led the <Kw>design system</Kw> used by 40 product teams.</>,
    <>Rebuilt checkout in <Kw>React</Kw> and <Kw>TypeScript</Kw>, cutting load time by 35%.</>,
    <>Brought core flows to <Kw>WCAG 2.1 AA</Kw> <Kw>accessibility</Kw>.</>,
  ],
};

// Drag the handle (or use the arrow keys) to wipe from the generic CV to the tailored one.
const BeforeAfter = () => {
  // Opens mostly on the tailored CV, with a strip of the generic one hinting at the handle.
  const [pos, setPos] = useState(15);
  return (
    <div className="relative mx-auto max-w-2xl select-none overflow-hidden rounded-xl border border-gray-200 shadow-sm">
      <CvPanel {...AFTER} accent={LEAF} />
      <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
        <CvPanel {...BEFORE} accent="#6B7280" />
      </div>
      <div className="pointer-events-none absolute inset-y-0" style={{ left: `${pos}%` }}>
        <div className="absolute inset-y-0 -ml-px w-0.5" style={{ backgroundColor: BERRY }} />
        <div
          className="absolute top-1/2 -ml-4 -mt-4 flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white shadow-lg"
          style={{ backgroundColor: BERRY }}
        >
          ⇆
        </div>
      </div>
      <input
        type="range"
        min="0"
        max="100"
        value={pos}
        onChange={(e) => setPos(Number(e.target.value))}
        aria-label="Compare the generic CV with the tailored CV"
        className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
      />
    </div>
  );
};

const Pricing = () => (
  <div className="grid gap-5 md:grid-cols-3">
    {PLANS.map((plan) => (
      <div
        key={plan.key}
        className={`relative rounded-xl bg-white p-5 shadow-sm ${plan.popular ? 'border-2' : 'border border-gray-200'}`}
        style={plan.popular ? { borderColor: BERRY } : undefined}
      >
        {plan.popular && (
          <span className="absolute -top-3 left-5 rounded-full px-3 py-0.5 text-xs font-semibold text-white" style={{ backgroundColor: BERRY }}>
            Most popular
          </span>
        )}
        <div className="text-lg font-semibold" style={{ color: INK }}>{plan.name}</div>
        <div className="mt-1 mb-4">
          <span className="text-3xl font-bold" style={{ color: INK }}>{plan.price}</span>
          {plan.key !== 'free' && <span className="text-sm text-gray-500"> /month</span>}
        </div>
        <ul className="space-y-2 text-sm">
          {plan.perks.map((perk) => (
            <li key={perk.text} className={`flex items-start gap-2 ${perk.soon ? 'text-gray-400' : 'text-gray-700'}`}>
              {perk.soon
                ? <Clock className="mt-0.5 h-4 w-4 shrink-0" />
                : <Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: LEAF }} />}
              <span>{perk.text}{perk.soon && ' (coming soon)'}</span>
            </li>
          ))}
        </ul>
        {plan.key === 'max' && <p className="mt-3 text-xs text-gray-400">Unlimited within a fair-use cap.</p>}
      </div>
    ))}
  </div>
);

const Landing = ({ signIn }) => (
  <div className="font-brand min-h-screen overflow-x-hidden" style={{ backgroundColor: '#FBF7F8' }}>
    <section className="px-4 pt-6 pb-10 sm:px-6 md:pt-12 md:pb-16" style={{ backgroundColor: INK }}>
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center justify-between gap-4">
          <Wordmark className="h-8 w-auto md:h-9" />
          <a
            href="#signin"
            className="rounded-lg px-3 py-2 text-sm font-semibold text-white/90 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/30"
          >
            Sign in
          </a>
        </div>
        <div className="mt-6 grid items-center gap-8 md:mt-10 md:grid-cols-2 md:gap-12">
          <div className="text-center md:text-left">
            <h1 className="text-4xl font-bold leading-tight text-white md:text-5xl">20 jobs. 20 CVs. Same&nbsp;you.</h1>
            <p className="mt-3 text-base text-gray-300 md:text-lg">
              Paste a job posting and get a CV and cover letter rewritten around it, from your real experience.
            </p>
            <p className="mt-2 text-sm text-gray-400">Free for your first 5 runs. No card needed.</p>
            <div className="mt-8 hidden md:block"><CardStack /></div>
          </div>
          <div id="signin" className="mx-auto w-full max-w-md scroll-mt-6 rounded-2xl bg-white p-6 shadow-2xl shadow-black/30 ring-1 ring-black/5 sm:p-8">
            {signIn}
          </div>
          <div className="md:hidden"><CardStack /></div>
        </div>
      </div>
    </section>

    <main className="px-4 sm:px-6">
      <section className="mx-auto max-w-5xl py-12">
        <h2 className="mb-6 text-center text-2xl font-bold" style={{ color: INK }}>How it works</h2>
        <ol className="grid gap-4 md:grid-cols-3">
          {STEPS.map(({ icon: Icon, title, text }, i) => (
            <li key={title} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="mb-3 flex items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white" style={{ backgroundColor: BERRY }}>
                  {i + 1}
                </span>
                <Icon className="h-5 w-5" style={{ color: INK }} />
              </div>
              <div className="font-semibold" style={{ color: INK }}>{title}</div>
              <p className="mt-1 text-sm text-gray-600">{text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto max-w-5xl pb-12">
        <h2 className="mb-2 text-center text-2xl font-bold" style={{ color: INK }}>Same experience, said the way the job asks</h2>
        <p className="mb-6 text-center text-sm text-gray-600">
          The posting asks for a <Kw>design system</Kw>, <Kw>React</Kw>, <Kw>TypeScript</Kw> and <Kw>accessibility</Kw>. Drag to compare.
        </p>
        <BeforeAfter />
      </section>

      <section className="mx-auto max-w-5xl pb-14">
        <h2 className="mb-8 text-center text-2xl font-bold" style={{ color: INK }}>Pricing</h2>
        <Pricing />
      </section>
    </main>

    <footer className="border-t border-gray-200 px-4 py-6 text-center text-sm text-gray-500">
      <a href="/privacy" className="underline hover:text-gray-800">Privacy Policy</a>
      <span className="mx-2">·</span>
      <a href="/terms" className="underline hover:text-gray-800">Terms of Service</a>
    </footer>
  </div>
);

export default Landing;
