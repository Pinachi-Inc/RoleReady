import React, { useState } from 'react';
import { Check, Clock, ClipboardPaste, Download, UserRound } from 'lucide-react';
import { PLANS } from './PricingModal.jsx';

// The signed-out home: what Roleberry does, a before/after example and the prices. Sign-in lives on
// /login and /signup (see LoginPage).
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

// The hero visual: one person's CV, reworded for three different jobs. Pick a job to bring its card forward.
const Mark = ({ children }) => (
  <mark className="rounded bg-leaf-soft px-0.5 font-semibold text-leaf-text">{children}</mark>
);

const EXAMPLES = [
  {
    tab: 'Hospital',
    forLine: 'Clinical Operations Project Manager, Riverside Health',
    bullets: [
      <>Rolled out a new <Mark>patient scheduling</Mark> system across 4 clinics</>,
      <>Cut average <Mark>patient wait time</Mark> by 18%</>,
      <>Trained 120 <Mark>nurses and front-desk staff</Mark> on the new system</>,
    ],
    skills: 'Patient flow, Clinical operations, Vendor management, Budgeting',
  },
  {
    tab: 'Retail chain',
    forLine: 'Store Operations Project Manager, Northgate Retail',
    bullets: [
      <>Rolled out a <Mark>point-of-sale</Mark> upgrade to 140 stores in 6 weeks</>,
      <>Trained 300+ <Mark>store staff</Mark> on the new tills</>,
      <>Managed <Mark>rollout budgets</Mark> up to $1.2M</>,
    ],
    skills: 'Store rollouts, POS systems, Staff training, Budgeting',
  },
  {
    tab: 'Software company',
    forLine: 'Technical Project Manager, Lumen Software',
    bullets: [
      <>Ran <Mark>Agile</Mark> delivery for 3 teams shipping every 2 weeks</>,
      <>Led two <Mark>software rollouts</Mark>: 4 clinics and 140 stores</>,
      <>Managed <Mark>budgets</Mark> up to $1.2M and reported to leadership</>,
    ],
    skills: 'Agile, Jira, Stakeholder management, Budgeting',
  },
];

const POSITIONS = [
  { transform: 'rotate(3deg) translateX(14px)', zIndex: 3 },
  { transform: 'rotate(-3deg) translate(-14px,10px)', zIndex: 2 },
  { transform: 'rotate(-9deg) translate(-40px,20px)', zIndex: 1 },
];

const sectionLabel = 'mt-2 border-b border-line pb-1 text-[11px] font-semibold tracking-widest text-ink-faint';

const CardStack = () => {
  const [front, setFront] = useState(0);
  return (
    <div>
      <div role="group" aria-label="Pick a job" className="flex flex-wrap justify-center gap-2">
        {EXAMPLES.map((ex, i) => (
          <button
            key={ex.tab}
            type="button"
            aria-pressed={front === i}
            onClick={() => setFront(i)}
            className={`h-11 px-3.5 rounded-full text-sm font-semibold focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/30 ${
              front === i ? 'bg-white text-ink' : 'border border-white/25 text-white/85 hover:bg-white/10'
            }`}
          >
            {ex.tab}
          </button>
        ))}
      </div>
      <div className="relative mx-auto mt-4 h-[430px] w-full max-w-[280px] sm:h-[400px] sm:max-w-[340px]">
        {EXAMPLES.map((ex, i) => {
          const pos = (i - front + 3) % 3;
          return (
            <article
              key={ex.tab}
              aria-hidden={pos !== 0 ? 'true' : undefined}
              className="absolute inset-0 flex flex-col gap-2 overflow-hidden rounded-[14px] bg-white p-5 text-left text-ink shadow-2xl transition-transform duration-[450ms] ease-out motion-reduce:transition-none"
              style={POSITIONS[pos]}
            >
              <div className={`flex flex-col gap-2 ${pos !== 0 ? 'invisible' : ''}`}>
                <div className="text-[11px] font-bold uppercase tracking-wider text-berry">For {ex.forLine}</div>
                <div>
                  <div className="mt-1 text-xl font-extrabold">Jordan Avery</div>
                  <div className="text-[13px] text-ink-muted">Project Manager, 8 years</div>
                </div>
                <div className={sectionLabel}>EXPERIENCE</div>
                <ul className="list-disc space-y-1.5 pl-4 text-[13.5px] leading-snug">
                  {ex.bullets.map((b, j) => <li key={j}>{b}</li>)}
                </ul>
                <div className={sectionLabel}>SKILLS</div>
                <p className="text-[13.5px]">{ex.skills}</p>
              </div>
            </article>
          );
        })}
      </div>
      <p className="mt-12 text-center text-xs text-white/60">
        Example CV, fictional person. Same experience, reworded for each job.
      </p>
    </div>
  );
};

const STEPS = [
  { icon: UserRound, title: 'Add your profile once', text: 'Upload your CV or fill in your experience. It is kept for every application.' },
  { icon: ClipboardPaste, title: 'Paste the job posting', text: 'Drop in the posting text. Roleberry picks out the skills and keywords it asks for.' },
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
    <ul className="mt-3 space-y-2 text-sm leading-relaxed text-ink">
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
    <div className="relative mx-auto max-w-2xl select-none overflow-hidden rounded-xl border border-line shadow-sm">
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
        className={`relative rounded-xl bg-white p-5 shadow-sm ${plan.popular ? 'border-2' : 'border border-line'}`}
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
          {plan.key !== 'free' && <span className="text-sm text-ink-muted"> /month</span>}
        </div>
        <ul className="space-y-2 text-sm">
          {plan.perks.map((perk) => (
            <li key={perk.text} className={`flex items-start gap-2 ${perk.soon ? 'text-ink-faint' : 'text-ink'}`}>
              {perk.soon
                ? <Clock className="mt-0.5 h-4 w-4 shrink-0" />
                : <Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: LEAF }} />}
              <span>{perk.text}{perk.soon && ' (coming soon)'}</span>
            </li>
          ))}
        </ul>
        {plan.key === 'max' && <p className="mt-3 text-xs text-ink-faint">Unlimited within a fair-use cap.</p>}
      </div>
    ))}
  </div>
);

const Landing = () => (
  <div className="font-brand min-h-screen overflow-x-hidden" style={{ backgroundColor: '#FBF7F8' }}>
    <section className="px-4 pt-6 pb-10 sm:px-6 md:pt-12 md:pb-16" style={{ backgroundColor: INK }}>
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center justify-between gap-4">
          <Wordmark className="h-8 w-auto md:h-9" />
          <a
            href="/login"
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
            <div className="mt-8 flex flex-wrap items-center justify-center md:justify-start gap-3">
              <a
                href="/signup"
                className="inline-flex h-12 items-center rounded-xl bg-berry px-6 text-base font-semibold text-white shadow-lg shadow-black/20 hover:bg-berry-dark focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/30"
              >
                Start with 5 free
              </a>
              <span className="text-sm text-white/70">No card needed.</span>
            </div>
          </div>
          <CardStack />
        </div>
      </div>
    </section>

    <main className="px-4 sm:px-6">
      <section className="mx-auto max-w-5xl py-12">
        <h2 className="mb-6 text-center text-2xl font-bold" style={{ color: INK }}>How it works</h2>
        <ol className="grid gap-4 md:grid-cols-3">
          {STEPS.map(({ icon: Icon, title, text }, i) => (
            <li key={title} className="rounded-xl border border-line bg-white p-5 shadow-sm">
              <div className="mb-3 flex items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white" style={{ backgroundColor: BERRY }}>
                  {i + 1}
                </span>
                <Icon className="h-5 w-5" style={{ color: INK }} />
              </div>
              <div className="font-semibold" style={{ color: INK }}>{title}</div>
              <p className="mt-1 text-sm text-ink-muted">{text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto max-w-5xl pb-12">
        <h2 className="mb-2 text-center text-2xl font-bold" style={{ color: INK }}>Same experience, said the way the job asks</h2>
        <p className="mb-6 text-center text-sm text-ink-muted">
          The posting asks for a <Kw>design system</Kw>, <Kw>React</Kw>, <Kw>TypeScript</Kw> and <Kw>accessibility</Kw>. Drag to compare.
        </p>
        <BeforeAfter />
      </section>

      <section className="mx-auto max-w-5xl pb-14">
        <h2 className="mb-8 text-center text-2xl font-bold" style={{ color: INK }}>Pricing</h2>
        <Pricing />
      </section>
    </main>

    <footer className="border-t border-line px-4 py-6 text-center text-sm text-ink-muted">
      <a href="/privacy" className="underline hover:text-ink">Privacy Policy</a>
      <span className="mx-2">·</span>
      <a href="/terms" className="underline hover:text-ink">Terms of Service</a>
    </footer>
  </div>
);

export default Landing;
