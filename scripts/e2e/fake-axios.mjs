// Stands in for axios in server code: serves the harness's signing key as Google's token
// certs, answers every model call with a fixed, structurally valid CV, and plays the parts of
// the Polar API that server/core/billing.js uses. Polar state is on
// globalThis.__E2E_POLAR so tests can create subscriptions, change them as the customer portal
// would, and read back what checkout and plan switches were asked for.
// GitHub's API is played from globalThis.__E2E_GITHUB.

const CERT_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

let calls = 0;

// Every email sent through Brevo, for the feedback tests. Set __E2E_MAIL_FAIL to make Brevo answer 500.
globalThis.__E2E_MAIL = [];

// Both Polar bases are served, so POLAR_SERVER does not matter to the tests.
const POLAR_BASES = ['https://api.polar.sh/v1', 'https://sandbox-api.polar.sh/v1'];
const polar = { subs: new Map(), checkouts: [], patches: [], sessions: [] };
globalThis.__E2E_POLAR = polar;

const isPolar = (url, path) => POLAR_BASES.some((base) => url.startsWith(`${base}${path}`));
const notFound = (url) => Object.assign(new Error(`fake Polar: 404 ${url}`), { response: { status: 404 } });
const subIdFrom = (url) => decodeURIComponent(url.slice(url.indexOf('/subscriptions/') + '/subscriptions/'.length));

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
    if (isPolar(url, '/subscriptions/')) {
      const sub = polar.subs.get(subIdFrom(url));
      if (!sub) throw notFound(url);
      return { data: structuredClone(sub) };
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
  // Revoking a subscription, as server/core/accounts.js does when deleting an account.
  async delete(url) {
    if (isPolar(url, '/subscriptions/')) {
      const sub = polar.subs.get(subIdFrom(url));
      if (!sub) throw notFound(url);
      sub.status = 'canceled';
      sub.ended_at = new Date().toISOString();
      return { data: structuredClone(sub) };
    }
    throw new Error(`fake axios: unexpected DELETE ${url}`);
  },
  async patch(url, body) {
    if (isPolar(url, '/subscriptions/')) {
      const id = subIdFrom(url);
      const sub = polar.subs.get(id);
      if (!sub) throw notFound(url);
      polar.patches.push({ id, body });
      if (body.product_id) sub.product_id = body.product_id;
      return { data: structuredClone(sub) };
    }
    throw new Error(`fake axios: unexpected PATCH ${url}`);
  },
  async post(url, body, config) {
    if (isPolar(url, '/checkouts/')) {
      polar.checkouts.push({ ...body, auth: config?.headers?.Authorization, base: url });
      const n = polar.checkouts.length;
      return { data: { id: `chk_${n}`, url: `https://sandbox-api.polar.sh/checkout/${n}` } };
    }
    if (isPolar(url, '/customer-sessions/')) {
      polar.sessions.push(body);
      return { data: { customer_portal_url: `https://polar.sh/roleberry/portal?session=${polar.sessions.length}` } };
    }
    if (url.endsWith('/chat/completions')) {
      globalThis.__E2E_LAST_MODEL = body?.model;
      globalThis.__E2E_LAST_MODEL_BODY = body;
      globalThis.__E2E_LAST_MODEL_TIMEOUT = config?.timeout;
      // Set __E2E_MODEL_FAIL to { status } (a provider HTTP error) or { code } (e.g. a timeout).
      const fail = globalThis.__E2E_MODEL_FAIL;
      if (fail) {
        throw Object.assign(new Error('fake model failure'), fail.status ? { response: { status: fail.status, data: { error: { message: 'provider says no' } } } } : { code: fail.code });
      }
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
