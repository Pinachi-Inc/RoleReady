// Stands in for axios in server code: serves the harness's signing key as Google's token
// certs, answers every model call with a fixed, structurally valid CV, and plays the parts of
// the Lemon Squeezy API that server/core/billing.js uses. Lemon Squeezy state is on
// globalThis.__E2E_LS so tests can create subscriptions, change them as the customer portal
// would, and read back what checkout and plan switches were asked for.
// GitHub's API is played from globalThis.__E2E_GITHUB.

const CERT_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

let calls = 0;

// Every email sent through Brevo, for the feedback tests. Set __E2E_MAIL_FAIL to make Brevo answer 500.
globalThis.__E2E_MAIL = [];

const LS_API = 'https://api.lemonsqueezy.com/v1';
const ls = { subs: new Map(), checkouts: [], patches: [] };
globalThis.__E2E_LS = ls;

const notFound = (url) => Object.assign(new Error(`fake Lemon Squeezy: 404 ${url}`), { response: { status: 404 } });
const subIdFrom = (url) => decodeURIComponent(url.slice(`${LS_API}/subscriptions/`.length));

function cvJson() {
  calls += 1;
  const skills = (prefix) => ['Kubernetes', 'Terraform', 'AWS', 'Go'].map((skill) => `${prefix} ${skill}`);
  return JSON.stringify({
    summary: 'Platform engineer.',
    coreSkills: ['Cloud', 'Infra', 'Delivery', 'Observability', 'Security', 'Languages'].map((category) => ({ category, items: skills(category) })),
    experience: [{ roleId: 'r1', title: 'Engineer', company: 'Acme', achievements: ['Shipped things.'] }],
    jdKeywords: ['Kubernetes', 'Terraform', 'Rust'],
    companyName: `Company ${calls}`,
    jobTitle: `Role ${calls}`,
  });
}

const axios = {
  async get(url, { headers = {} } = {}) {
    if (url === CERT_URL) return { data: globalThis.__E2E_CERTS, headers: { 'cache-control': 'max-age=3600' } };
    if (url.startsWith(`${LS_API}/subscriptions/`)) {
      const sub = ls.subs.get(subIdFrom(url));
      if (!sub) throw notFound(url);
      return { data: { data: structuredClone(sub) } };
    }
    if (url.startsWith('https://api.github.com/')) {
      // globalThis.__E2E_GITHUB: access token -> { id, emails: [{ email, verified }] }
      const token = String(headers.Authorization || '').replace(/^Bearer\s+/, '');
      const account = globalThis.__E2E_GITHUB?.[token];
      if (!account) throw Object.assign(new Error('Bad credentials'), { response: { status: 401 } });
      if (url.endsWith('/user')) return { data: { id: account.id } };
      if (url.endsWith('/user/emails')) return { data: account.emails };
    }
    throw new Error(`fake axios: unexpected GET ${url}`);
  },
  async patch(url, body) {
    if (url.startsWith(`${LS_API}/subscriptions/`)) {
      const id = subIdFrom(url);
      const sub = ls.subs.get(id);
      if (!sub) throw notFound(url);
      ls.patches.push({ id, body });
      Object.assign(sub.attributes, body.data.attributes);
      return { data: { data: structuredClone(sub) } };
    }
    throw new Error(`fake axios: unexpected PATCH ${url}`);
  },
  async post(url, body, config) {
    if (url === `${LS_API}/checkouts`) {
      ls.checkouts.push({ data: body.data, auth: config?.headers?.Authorization });
      const n = ls.checkouts.length;
      return { data: { data: { type: 'checkouts', id: `chk_${n}`, attributes: { url: `https://roleberry.lemonsqueezy.com/checkout/custom/${n}` } } } };
    }
    if (url.endsWith('/chat/completions')) {
      globalThis.__E2E_LAST_MODEL = body?.model;
      return { data: { choices: [{ message: { content: cvJson() }, finish_reason: 'stop' }], usage: {} } };
    }
    if (url === 'https://api.brevo.com/v3/smtp/email') {
      if (globalThis.__E2E_MAIL_FAIL) throw Object.assign(new Error('fake Brevo: 500'), { response: { status: 500 } });
      globalThis.__E2E_MAIL.push({ body, headers: config?.headers });
      return { data: { messageId: 'fake@brevo' } };
    }
    throw new Error(`fake axios: unexpected POST ${url}`);
  },
};

export default axios;
