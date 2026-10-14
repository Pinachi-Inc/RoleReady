// Just enough of the Admin SDK's Firestore and Auth for server/core, held in memory. The store
// is globalThis.__E2E_FS (path -> data) and the Auth users globalThis.__E2E_AUTH (email -> uid),
// so tests can seed and inspect both.

const store = new Map();
globalThis.__E2E_FS = store;

const authUsers = new Map();
globalThis.__E2E_AUTH = authUsers;

const SERVER_TIMESTAMP = Symbol('serverTimestamp');
const DELETE_FIELD = Symbol('deleteField');
let clock = Date.parse('2026-01-01T00:00:00Z');
const timestamp = () => {
  clock += 1000;
  const date = new Date(clock);
  return { toDate: () => date, toMillis: () => date.getTime() };
};

const isPlain = (v) => v && typeof v === 'object' && !Array.isArray(v) && typeof v.toDate !== 'function';

function resolveSentinels(value) {
  if (value === SERVER_TIMESTAMP) return timestamp();
  if (isPlain(value)) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolveSentinels(v)]));
  return value;
}

function deepMerge(base, patch) {
  const out = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v === DELETE_FIELD) delete out[k];
    else out[k] = isPlain(v) && isPlain(out[k]) ? deepMerge(out[k], v) : v;
  }
  return out;
}

// structuredClone would choke on timestamps, which carry methods.
function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (isPlain(value)) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clone(v)]));
  return value;
}

const snapshot = (path, id) => ({
  id,
  exists: store.has(path),
  data: () => (store.has(path) ? clone(store.get(path)) : undefined),
});

let autoId = 0;

class DocRef {
  constructor(path) { this.path = path; this.id = path.split('/').pop(); }
  collection(name) { return new Query(`${this.path}/${name}`); }
  async get() { return snapshot(this.path, this.id); }
  async set(data, { merge = false } = {}) {
    const next = resolveSentinels(data);
    store.set(this.path, merge ? deepMerge(store.get(this.path) || {}, next) : next);
  }
}

class Query {
  constructor(path, ops = {}) { this.path = path; this.ops = ops; }
  doc(id) { return new DocRef(`${this.path}/${id || `auto${String(++autoId).padStart(6, '0')}`}`); }
  where(field, op, value) { return new Query(this.path, { ...this.ops, where: [field, op, value] }); }
  orderBy(field, dir = 'asc') { return new Query(this.path, { ...this.ops, orderBy: [field, dir] }); }
  limit(n) { return new Query(this.path, { ...this.ops, limit: n }); }
  count() { return { get: async () => { const n = this.#docs().length; return { data: () => ({ count: n }) }; } }; }
  #docs() {
    const prefix = `${this.path}/`;
    let docs = [...store.keys()]
      .filter((k) => k.startsWith(prefix) && !k.slice(prefix.length).includes('/'))
      .map((k) => ({ path: k, id: k.slice(prefix.length), data: store.get(k) }));
    if (this.ops.where) {
      const [field, op, value] = this.ops.where;
      if (op !== '==') throw new Error(`fake firestore: unsupported op ${op}`);
      docs = docs.filter((d) => d.data[field] === value);
    }
    if (this.ops.orderBy) {
      const [field, dir] = this.ops.orderBy;
      const key = (d) => { const v = d.data[field]; return v?.toMillis ? v.toMillis() : v; };
      docs.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0) * (dir === 'desc' ? -1 : 1));
    }
    return this.ops.limit != null ? docs.slice(0, this.ops.limit) : docs;
  }
  async get() {
    const docs = this.#docs().map((d) => snapshot(d.path, d.id));
    return { empty: docs.length === 0, size: docs.length, docs };
  }
}

const db = {
  collection: (name) => new Query(name),
  async runTransaction(fn) {
    return fn({ get: (ref) => ref.get(), set: (ref, data, opts) => { ref.set(data, opts); } });
  },
};

const firestore = () => db;
firestore.FieldValue = { serverTimestamp: () => SERVER_TIMESTAMP, delete: () => DELETE_FIELD };

const auth = () => ({
  async getUserByEmail(email) {
    const uid = authUsers.get(String(email).toLowerCase());
    if (!uid) throw Object.assign(new Error('no user record'), { code: 'auth/user-not-found' });
    return { uid, email };
  },
});

const admin = {
  initializeApp: () => ({}),
  credential: { cert: (c) => c },
  firestore,
  auth,
};

export default admin;
