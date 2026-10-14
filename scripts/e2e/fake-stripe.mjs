// Just enough of the Stripe SDK for server/core/billing.js. State lives on globalThis.__E2E_STRIPE
// so tests can create subscriptions, change their price (as the Customer Portal would) and read
// back what Checkout was asked for. A webhook signature is valid when it equals 'valid'.

const state = { customers: new Map(), subs: new Map(), sessions: [], nextId: 0 };
globalThis.__E2E_STRIPE = state;

const id = (prefix) => `${prefix}_${++state.nextId}`;

export default class Stripe {
  constructor(key) {
    this.key = key;
    this.customers = {
      async create(params) {
        const customer = { id: id('cus'), ...params };
        state.customers.set(customer.id, customer);
        return customer;
      },
      async retrieve(cid) { return state.customers.get(cid) || { id: cid, deleted: true }; },
    };
    this.checkout = {
      sessions: {
        async create(params) {
          const session = { id: id('cs'), url: `https://checkout.stripe.test/${state.nextId}`, ...params };
          state.sessions.push(session);
          return session;
        },
      },
    };
    this.billingPortal = {
      sessions: { async create(params) { return { url: 'https://billing.stripe.test/portal', ...params }; } },
    };
    this.subscriptions = {
      async retrieve(sid) {
        const sub = state.subs.get(sid);
        if (!sub) throw new Error(`No such subscription: ${sid}`);
        return structuredClone(sub);
      },
    };
    this.webhooks = {
      constructEvent(raw, signature, secret) {
        if (!secret || signature !== 'valid') throw new Error('No signatures found matching the expected signature');
        return JSON.parse(Buffer.from(raw).toString('utf8'));
      },
    };
  }
}
