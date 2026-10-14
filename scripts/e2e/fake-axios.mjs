// Stands in for axios in server code: serves the harness's signing key as Google's token
// certs, and answers every model call with a fixed, structurally valid CV.

const CERT_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

let calls = 0;

function cvJson() {
  calls += 1;
  const skills = (prefix) => ['Kubernetes', 'Terraform', 'AWS', 'Go'].map((skill) => ({ skill: `${prefix} ${skill}`, source: 'jd' }));
  return JSON.stringify({
    summary: 'Platform engineer.',
    coreSkills: ['Cloud', 'Infra', 'Delivery', 'Observability', 'Security', 'Languages'].map((category) => ({ category, items: skills(category) })),
    experience: [{ roleId: 'r1', title: 'Engineer', company: 'Acme', achievements: ['Shipped things.'] }],
    keywordsUsed: ['Kubernetes'],
    overlapSkills: [],
    companyName: `Company ${calls}`,
    jobTitle: `Role ${calls}`,
  });
}

const axios = {
  async get(url) {
    if (url === CERT_URL) return { data: globalThis.__E2E_CERTS, headers: { 'cache-control': 'max-age=3600' } };
    throw new Error(`fake axios: unexpected GET ${url}`);
  },
  async post(url, body) {
    if (url.endsWith('/chat/completions')) {
      globalThis.__E2E_LAST_MODEL = body?.model;
      return { data: { choices: [{ message: { content: cvJson() }, finish_reason: 'stop' }], usage: {} } };
    }
    throw new Error(`fake axios: unexpected POST ${url}`);
  },
};

export default axios;
