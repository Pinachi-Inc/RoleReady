import React from 'react';
import { LEGAL } from './config.js';

// Plan facts here must match PLAN_LIMITS in server/core/firestore.js and
// components/PricingModal.jsx. Change all three together.

const Mail = () => <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>;

const TermsOfService = () => (
  <>
    <p>
      These terms are the agreement between you and {LEGAL.company} ("we", "us") for your use of{' '}
      {LEGAL.product} at {LEGAL.site}. By signing in you accept them. If you do not agree, do not
      use {LEGAL.product}. How we handle personal data is described in our{' '}
      <a href="/privacy">Privacy Policy</a>.
    </p>

    <h2>1. Who can use {LEGAL.product}</h2>
    <p>
      You must be at least {LEGAL.minimumAge}, and old enough to enter a binding contract where
      you live to buy a subscription. You sign in with a Google account and are responsible for
      what happens under it. Tell us at <Mail /> if you think someone else has used it.
    </p>

    <h2>2. What {LEGAL.product} does</h2>
    <p>
      {LEGAL.product} uses AI to rewrite your CV against a job posting and, if you ask, to draft a
      cover letter. It also keeps your profile, saved profiles and a history of what it generated.
      We may change, add or remove features over time. If we remove something central to a paid
      plan, we will tell you in advance.
    </p>

    <h2>3. Plans and payment</h2>
    <ul>
      <li><strong>Free:</strong> $0. 5 optimizations in total, 1 saved profile, and your newest 5 runs visible in history.</li>
      <li><strong>Pro:</strong> $12 per month. 1,000 optimizations per calendar month, up to 3 saved profiles, full history.</li>
      <li><strong>Max:</strong> $49 per month. Unlimited optimizations and unlimited saved profiles, subject to fair use (section 4), and full history.</li>
    </ul>
    <p>
      Prices are in US dollars and exclude any taxes that apply where you live. Payments are
      handled by Stripe. Subscriptions renew automatically each month on the date you subscribed
      and are charged to your payment method until you cancel. Unused optimizations do not
      carry over to the next month.
    </p>
    <p>
      <strong>Cancelling.</strong> Cancel any time from Manage subscription. You keep your plan
      until the end of the period you have paid for, then move to Free. Your saved data stays;
      history beyond the Free limit and extra saved profiles become read-only or locked until you
      subscribe again.
    </p>
    <p>
      <strong>Switching plans.</strong> You can move between Pro and Max from Manage subscription.
      Stripe adjusts the charge for the rest of the current period.
    </p>
    <p>
      <strong>Failed payments.</strong> If a renewal fails, Stripe retries for a short period and
      you keep access meanwhile. If payment still fails, the subscription ends and the account
      moves to Free.
    </p>
    <p>
      <strong>Refunds.</strong> Payments are non-refundable except where the law requires
      otherwise or we decide to make an exception. If something went wrong, write to <Mail />.
      If you are a consumer in the EU or UK, you have 14 days from subscribing to withdraw. By
      using a paid feature during that time you ask us to start straight away, and any refund is
      reduced in proportion to the period you used.
    </p>
    <p>
      <strong>Price changes.</strong> We will give at least 30 days' notice of a price change,
      and it applies from your next renewal after that. You can cancel before it takes effect.
    </p>

    <h2>4. Fair use</h2>
    <p>
      Max's unlimited optimizations and saved profiles are for one person's own job search. To
      keep the service working for everyone, we apply a monthly ceiling well above any normal
      job search, and a ceiling on saved profiles. If you reach either, further use pauses until
      the next month or until you remove something. We may also contact you or limit an account
      whose use looks automated, shared between people, or resold.
    </p>

    <h2>5. Your content</h2>
    <p>
      You own what you put in (your profile, CVs, job postings) and what {LEGAL.product}{' '}
      generates for you. You give us permission to store, process and send that content to our
      service providers, including AI model providers, only as needed to run {LEGAL.product} for
      you. That permission ends when your content is deleted.
    </p>
    <p>
      You are responsible for what you submit. Only upload material you have the right to use,
      and keep your profile truthful.
    </p>

    <h2>6. AI-generated output</h2>
    <p>
      Output is produced by AI and can contain mistakes, omissions or wording that overstates
      your experience. Read and correct everything before you send it. You are responsible for
      the accuracy of any CV or letter you submit to an employer. We do not promise interviews,
      job offers or any result from an applicant tracking system. The AI-writing estimate is an
      estimate from a third-party tool, not a guarantee of how any reader or system will judge
      your text.
    </p>

    <h2>7. Acceptable use</h2>
    <p>Do not:</p>
    <ul>
      <li>use {LEGAL.product} to misrepresent your identity, qualifications or employment history;</li>
      <li>upload content that is unlawful, infringes someone else's rights, or contains other people's personal data without a right to share it;</li>
      <li>scrape, overload or probe the service, get around plan limits, or access it by automated means except through features we provide;</li>
      <li>share one account between several people or resell access;</li>
      <li>try to extract our prompts, reverse-engineer the service, or use its output to build a competing product.</li>
    </ul>

    <h2>8. Our service</h2>
    <p>
      {LEGAL.product}, its software, design and prompts belong to us or our licensors. These terms
      give you a personal, non-transferable right to use the service while your account is in good
      standing. They do not transfer any of our intellectual property to you.
    </p>
    <p>
      {LEGAL.product} relies on third parties, including Google, Vercel, Stripe and AI model
      providers. Their outages or changes can affect the service, and we are not responsible for
      their services.
    </p>

    <h2>9. Suspension and termination</h2>
    <p>
      You can stop using {LEGAL.product} at any time and ask us to delete your account. We may
      suspend or close an account that breaks these terms, puts the service or other users at
      risk, or where the law requires it. Where reasonable we will warn you first. If we close a
      paid account without a breach on your part, we refund the unused part of the current period.
    </p>

    <h2>10. Disclaimers</h2>
    <p>
      {LEGAL.product} is provided "as is" and "as available". To the extent the law allows, we
      make no warranties about it beyond those stated in these terms, including fitness for a
      particular purpose and uninterrupted or error-free operation.
    </p>

    <h2>11. Limitation of liability</h2>
    <p>
      To the extent the law allows, we are not liable for indirect or consequential losses, lost
      opportunities, or lost data, and our total liability for any claim relating to{' '}
      {LEGAL.product} is limited to the greater of the amount you paid us in the 12 months before
      the claim and US$50. Nothing in these terms limits liability that cannot be limited by law,
      or your rights as a consumer under the law where you live.
    </p>

    <h2>12. Indemnity</h2>
    <p>
      If you use {LEGAL.product} for business purposes, you agree to cover our reasonable costs
      from claims by third parties caused by content you submitted or by your breach of these
      terms.
    </p>

    <h2>13. Changes to these terms</h2>
    <p>
      We may update these terms. If a change matters, we will tell you in the app or by email at
      least 30 days before it applies to you. Continuing to use {LEGAL.product} after that means
      you accept the new terms. If you do not, cancel before the change takes effect.
    </p>

    <h2>14. Governing law</h2>
    <p>
      These terms are governed by the law of {LEGAL.governingLaw}, whose courts have
      jurisdiction, except where consumer law gives you the right to bring a claim in the courts
      of the place you live.
    </p>

    <h2>15. Contact</h2>
    <p>
      {LEGAL.company}, {LEGAL.address}. Email <Mail />.
    </p>
  </>
);

export default TermsOfService;
