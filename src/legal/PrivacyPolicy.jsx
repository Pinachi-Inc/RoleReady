import React from 'react';
import { LEGAL } from './config.js';

// Written from what the code actually does. When a data flow changes (a new processor, a new
// field stored, a different retention), change this in the same commit.

const Mail = () => <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>;

const PrivacyPolicy = () => (
  <>
    <p>
      This policy explains what {LEGAL.product} collects when you use it, why, who else handles it,
      how long it is kept, and what you can do about it. {LEGAL.product} ("we", "us") is the
      controller of your personal data. Questions and requests go to <Mail />.
    </p>

    <h2>The short version</h2>
    <ul>
      <li>We collect what you give us to build your CV, plus your sign-in details and, if you pay, your subscription status.</li>
      <li>Your CV content is sent to third-party AI models to produce your results. That is how the product works.</li>
      <li>We do not sell your data, show ads in the app, or use your content to train our own models.</li>
      <li>We advertise on Meta (Facebook, Instagram) and Reddit, and their pixels tell them when someone they sent us visits, signs up or subscribes. They never get your CV content. Details under Cookies below.</li>
      <li>Payments are handled by Lemon Squeezy, our merchant of record. We never see your card details.</li>
      <li>You can ask us for a copy of your data, or to delete it, at any time.</li>
    </ul>

    <h2>What we collect</h2>
    <h3>Your account</h3>
    <p>
      You sign in with Google, GitHub, or an email address and password. Through Firebase
      Authentication we receive your email address and, for Google or GitHub, your name, profile
      photo link and an account identifier from that service. We never receive your Google or
      GitHub password, and an email password is stored by Firebase only in hashed form.
    </p>
    <h3>How you found us</h3>
    <p>
      When you first arrive, the app notes where you came from: the campaign tags on the link you
      followed (such as <code>utm_source=reddit</code>), which kind of ad click it was, the
      website that linked to us and the page you landed on. This stays in your browser until you
      sign up, when it is saved on your account with the sign-up date and method, so we can count
      sign-ups per channel. It is never sent to Meta or Reddit, and it is dropped after 90 days if
      you do not sign up.
    </p>

    <h3>What you put into {LEGAL.product}</h3>
    <ul>
      <li>
        <strong>Your profile:</strong> career history, achievements, skills, contact details,
        education and certifications, as you enter or import them, and any saved profiles you
        create.
      </li>
      <li>
        <strong>CVs you upload:</strong> a PDF you import is read on our server, its text is
        extracted and sent to an AI model to fill in your profile, and the file itself is
        discarded once the request finishes. A scanned (image) PDF is read in your browser
        instead, and the image does not leave your device.
      </li>
      <li>
        <strong>Job postings</strong> you paste in to tailor a CV against.
      </li>
    </ul>
    <p>
      Please do not include information you would not want processed for this purpose, such as
      health details, government ID numbers or anything about other people beyond what a CV
      normally contains.
    </p>

    <h3>What we produce for you</h3>
    <p>
      Each CV and cover letter you generate is saved to your history, together with the company
      name, job title, the profile it was made from and the date. History is how you get back to
      earlier results. On the Free plan the newest five are visible and the rest stay saved for if
      you upgrade.
    </p>

    <h3>Usage and billing</h3>
    <ul>
      <li>How many optimizations and imports you have used, to apply your plan's limits.</li>
      <li>
        If you subscribe: your plan, a Lemon Squeezy customer and subscription identifier, the
        subscription's status and renewal date. Payment details, billing address and tax details
        are collected by Lemon Squeezy, not by us.
      </li>
    </ul>

    <h3>Technical data</h3>
    <ul>
      <li>
        <strong>Server logs.</strong> Our servers log requests, including your account identifier,
        timings, errors, and short excerpts of the text sent to and returned by the AI model, so
        we can diagnose failures. Logs are kept by our hosting provider for a limited period.
      </li>
      <li>
        <strong>Network data.</strong> Like any website, our hosting and infrastructure providers
        process your IP address and browser details to deliver the site and protect it from abuse.
      </li>
    </ul>

    <h3>When you contact us</h3>
    <p>
      If you send feedback or report a problem, we receive your message, the email address you
      give us or your account email, any screenshot you attach, the page you were on, basic
      browser details (browser, language, time zone and screen size) and recent error messages
      from the app. We use it only to answer you and fix problems.
    </p>

    <h2>How we use it</h2>
    <ul>
      <li>To run the service: build your profile, tailor CVs and cover letters, keep your history and profiles.</li>
      <li>To estimate how AI-written a generated CV reads, when that score is shown.</li>
      <li>To take payment, manage your subscription and apply plan limits, including Max's fair-use limit.</li>
      <li>To keep the service secure, prevent abuse, and fix problems.</li>
      <li>To reply when you contact us, to tell you about important changes to the service or these terms, and to send a few emails about your account: a welcome, one reminder if you haven't tried it yet, a notice when your free runs are used up, and a short question if you cancel. Each has an unsubscribe link.</li>
      <li>To meet legal obligations, such as tax and accounting records.</li>
    </ul>
    <p>
      We do not sell or rent personal data, and we do not use your content to train our own AI
      models. The only advertising use is measuring our own ads, as described under Cookies
      below; your profile, CVs and job postings are never part of it.
    </p>

    <h3>Legal bases (EEA and UK)</h3>
    <ul>
      <li><strong>Contract:</strong> providing the service you signed up for, including AI processing and billing.</li>
      <li><strong>Legitimate interests:</strong> security, abuse prevention, debugging, improving the service, and counting which channels bring sign-ups.</li>
      <li><strong>Legal obligation:</strong> keeping financial records and responding to lawful requests.</li>
      <li><strong>Consent:</strong> anything optional we ask you to agree to. You can withdraw it at any time.</li>
    </ul>

    <h2>AI processing</h2>
    <p>
      To produce your results, your profile, the job posting and, for imports, the text of your
      CV are sent to large language models run by third parties. We reach those models through
      OpenRouter, which passes each request to a model provider. The provider generates the
      response and returns it to us. Providers may process requests outside your country and,
      under their own terms, some may keep request data for a limited time, for example to
      monitor for abuse.
    </p>
    <p>
      AI output can be wrong. Always check a generated CV or letter before you send it to anyone.
    </p>

    <h2>Who else handles your data</h2>
    <p>We use these service providers (processors) to run {LEGAL.product}. Each only gets what it needs for its job.</p>
    <table>
      <thead>
        <tr><th>Provider</th><th>What for</th><th>Data involved</th></tr>
      </thead>
      <tbody>
        <tr><td>Google (Firebase)</td><td>Sign-in and database</td><td>Account details, profiles, history, usage, subscription status</td></tr>
        <tr><td>Vercel</td><td>Hosting and servers</td><td>All requests passing through the app, server logs, IP address</td></tr>
        <tr><td>OpenRouter and the AI model providers it routes to</td><td>Generating CVs, cover letters and profile imports</td><td>Profile content, job postings, imported CV text</td></tr>
        <tr><td>Lemon Squeezy (merchant of record) and its payment processors</td><td>Selling the subscription: payment, sales tax / VAT, receipts, refunds</td><td>Email, name, payment details, billing address, subscription</td></tr>
        <tr><td>Brevo</td><td>Delivering feedback reports to our inbox, and sending account emails</td><td>Your email address; for feedback, also your message, screenshot and the browser details above</td></tr>
        <tr><td>Meta Platforms (Meta Pixel)</td><td>Measuring our Facebook and Instagram ads</td><td>Pages visited on our site, that a sign-up happened and how (Google, GitHub or email), that a subscription was bought and its price, IP address, browser details and Meta's cookies</td></tr>
        <tr><td>Reddit (Reddit Pixel)</td><td>Measuring our Reddit ads</td><td>Pages visited on our site, that a sign-up happened, that a subscription was bought and its price, IP address, browser details and Reddit's cookies</td></tr>
        <tr><td>jsDelivr (CDN)</td><td>Loading the in-browser text reader for scanned PDFs</td><td>IP address and browser details only; your file stays on your device</td></tr>
      </tbody>
    </table>
    <p>
      Lemon Squeezy sells the subscription to you as merchant of record, so for payment, tax and
      receipt data it acts as an independent controller under its own privacy policy, not only on
      our behalf.
    </p>
    <p>
      We may also disclose data if the law requires it, to protect people's safety or our rights,
      or if {LEGAL.product} is transferred to a new owner, in which case this policy continues to apply.
    </p>

    <h2>International transfers</h2>
    <p>
      Our providers are mostly based in the United States and may process data in other
      countries. Where data leaves the EEA or UK, we rely on safeguards the law recognises, such
      as the European Commission's Standard Contractual Clauses or the provider's certification
      under the EU-US Data Privacy Framework.
    </p>

    <h2>How long we keep it</h2>
    <ul>
      <li><strong>Account, profiles and history:</strong> for as long as you have an account. Saved profiles you delete in the app are removed straight away.</li>
      <li><strong>After you ask us to delete your account:</strong> removed within {LEGAL.deletionDays} days, including from backups.</li>
      <li><strong>Uploaded PDF files:</strong> not stored. They are discarded as soon as the import finishes.</li>
      <li><strong>Server logs:</strong> a limited period set by our hosting provider.</li>
      <li><strong>Feedback and problem reports:</strong> up to 2 years, or sooner if you ask us to delete them.</li>
      <li><strong>Billing records:</strong> as long as tax and accounting law requires, held by Lemon Squeezy and in our records.</li>
    </ul>

    <h2>Your rights</h2>
    <p>Depending on where you live, you can ask us to:</p>
    <ul>
      <li>give you a copy of your personal data, in a portable format;</li>
      <li>correct it;</li>
      <li>delete it, or delete your whole account;</li>
      <li>restrict or object to how we use it;</li>
      <li>withdraw consent you have given.</li>
    </ul>
    <p>
      You can edit your profile and delete saved profiles in the app yourself. For anything else,
      including deleting your account, email <Mail /> from the address you sign in with. We
      reply within 30 days. If you are in the EEA or UK you can also complain to your data
      protection authority.
    </p>
    <p>
      <strong>California residents:</strong> you have the right to know, delete and correct
      personal information, and not to be discriminated against for using these rights. We do
      not sell personal information. The Meta and Reddit pixels described below may count as
      "sharing" for cross-context behavioural advertising under California law. To opt out,
      turn on Global Privacy Control in your browser: the app then does not load either pixel.
    </p>

    <h2>Cookies and browser storage</h2>
    <p>
      Your browser stores what the app needs to work: your sign-in session (Firebase), two
      preferences (whether you want cover letters and whether folder downloads are on) and, if
      you choose a download folder, a reference to that folder in IndexedDB. It also keeps a note
      of how you first found us (see "How you found us" above) until you sign up, for up to 90
      days.
    </p>
    <p>
      To measure our ads, the site loads the <strong>Meta Pixel</strong> and the{' '}
      <strong>Reddit Pixel</strong>. They set those companies' cookies and tell them which pages
      you open, that you created an account, and that you bought a subscription and at what price. Meta and Reddit use this to report how our
      ads performed and to show them to people likely to find them useful, under their own privacy
      policies (<a href="https://www.facebook.com/privacy/policy/">Meta</a>,{' '}
      <a href="https://www.reddit.com/policies/privacy-policy">Reddit</a>). They do not receive
      your email address, profile, CVs or job postings.
    </p>
    <p>
      The pixels are not loaded at all if your browser sends Global Privacy Control, or if your
      browser is set to a European time zone, since we do not advertise in Europe and would need
      your consent there first. You can also block them with any content blocker, and the app
      works the same without them. Meta and Reddit let you limit ad personalisation in your
      account settings with them.
    </p>

    <h2>Security</h2>
    <p>
      Data is encrypted in transit and at rest by our providers. Every request to our servers is
      checked against a signed sign-in token, each account can reach only its own data,
      and payment details never touch our servers. No system is perfectly secure, so if you think
      your account has been misused, tell us at <Mail />.
    </p>

    <h2>Children</h2>
    <p>
      {LEGAL.product} is not for anyone under {LEGAL.minimumAge}. If we learn that we hold data
      about someone younger, we delete it.
    </p>

    <h2>Changes to this policy</h2>
    <p>
      If we change this policy in a way that matters, we will update the date at the top and tell
      you in the app or by email before the change takes effect.
    </p>

    <h2>Contact</h2>
    <p>
      {LEGAL.seller}. Email <Mail />.
    </p>
  </>
);

export default PrivacyPolicy;
