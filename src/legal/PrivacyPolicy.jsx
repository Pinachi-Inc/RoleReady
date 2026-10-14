import React from 'react';
import { LEGAL } from './config.js';

// Written from what the code actually does. When a data flow changes (a new processor, a new
// field stored, a different retention), change this in the same commit.

const Mail = () => <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>;

const PrivacyPolicy = () => (
  <>
    <p>
      This policy explains what {LEGAL.product} collects when you use it, why, who else handles it,
      how long it is kept, and what you can do about it. {LEGAL.product} is run by {LEGAL.company},{' '}
      {LEGAL.address} ("we", "us"). We are the controller of your personal data. Questions and
      requests go to <Mail />.
    </p>

    <h2>The short version</h2>
    <ul>
      <li>We collect what you give us to build your CV, plus your Google sign-in details and, if you pay, your subscription status.</li>
      <li>Your CV content is sent to third-party AI models to produce your results. That is how the product works.</li>
      <li>We do not sell your data, show ads, or use your content to train our own models.</li>
      <li>Card details go straight to Stripe. We never see them.</li>
      <li>You can ask us for a copy of your data, or to delete it, at any time.</li>
    </ul>

    <h2>What we collect</h2>
    <h3>Your account</h3>
    <p>
      You sign in with Google. Through Google and Firebase Authentication we receive your name,
      email address, profile photo link and a Google account identifier. We do not receive your
      Google password.
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
        If you subscribe: your plan, a Stripe customer and subscription identifier, the
        subscription's status and renewal date. Payment details are collected and stored by
        Stripe, not by us.
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

    <h2>How we use it</h2>
    <ul>
      <li>To run the service: build your profile, tailor CVs and cover letters, keep your history and profiles.</li>
      <li>To estimate how AI-written a generated CV reads, when that score is shown.</li>
      <li>To take payment, manage your subscription and apply plan limits, including Max's fair-use limit.</li>
      <li>To keep the service secure, prevent abuse, and fix problems.</li>
      <li>To reply when you contact us, and to tell you about important changes to the service or these terms.</li>
      <li>To meet legal obligations, such as tax and accounting records.</li>
    </ul>
    <p>
      We do not sell or rent personal data, we do not use it for advertising, and we do not use
      your content to train our own AI models.
    </p>

    <h3>Legal bases (EEA and UK)</h3>
    <ul>
      <li><strong>Contract:</strong> providing the service you signed up for, including AI processing and billing.</li>
      <li><strong>Legitimate interests:</strong> security, abuse prevention, debugging and improving the service.</li>
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
      monitor for abuse. Generated CVs are also sent to Sapling AI when we estimate how
      AI-written they read.
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
        <tr><td>Sapling AI</td><td>AI-writing estimate</td><td>Generated CV text</td></tr>
        <tr><td>Stripe</td><td>Payments and subscriptions</td><td>Email, payment details, billing address, subscription</td></tr>
        <tr><td>jsDelivr (CDN)</td><td>Loading the in-browser text reader for scanned PDFs</td><td>IP address and browser details only; your file stays on your device</td></tr>
      </tbody>
    </table>
    <p>
      We may also disclose data if the law requires it, to protect people's safety or our rights,
      or as part of a merger or sale of the business, in which case this policy continues to apply.
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
      <li><strong>Billing records:</strong> as long as tax and accounting law requires, held by Stripe and in our records.</li>
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
      not sell personal information or share it for cross-context behavioural advertising.
    </p>

    <h2>Cookies and browser storage</h2>
    <p>
      We do not use advertising or analytics cookies. Your browser stores only what the app needs
      to work: your sign-in session (Firebase), two preferences (whether you want cover letters and
      whether folder downloads are on) and, if you choose a download folder, a reference to that
      folder in IndexedDB. None of this is used to track you, so there is no cookie banner.
    </p>

    <h2>Security</h2>
    <p>
      Data is encrypted in transit and at rest by our providers. Every request to our servers is
      checked against a signed Google sign-in token, each account can reach only its own data,
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
      {LEGAL.company}, {LEGAL.address}. Email <Mail />.
    </p>
  </>
);

export default PrivacyPolicy;
