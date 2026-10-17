import crypto from 'node:crypto';
import axios from 'axios';

// Google's public X.509 certs for Firebase ID tokens. Rotated periodically;
// the response carries a Cache-Control max-age we honour.
const CERT_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

let certCache = { certs: null, expiresAt: 0 };

async function getSigningCerts() {
  const now = Date.now();
  if (certCache.certs && now < certCache.expiresAt) return certCache.certs;

  const res = await axios.get(CERT_URL);
  const cacheControl = res.headers?.['cache-control'] || '';
  const maxAge = /max-age=(\d+)/.exec(cacheControl);
  const ttlMs = maxAge ? Number(maxAge[1]) * 1000 : 60 * 60 * 1000;

  certCache = { certs: res.data, expiresAt: now + ttlMs };
  return res.data;
}

function decodeSegment(segment) {
  return Buffer.from(String(segment).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

// Verifies a Firebase ID token against Google's published certs.
// Returns the decoded claims, or throws with a short reason.
export async function verifyFirebaseIdToken(token, projectId) {
  if (!token || typeof token !== 'string') throw new Error('missing token');

  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('malformed token');
  const [rawHeader, rawPayload, rawSignature] = parts;

  let header;
  let payload;
  try {
    header = JSON.parse(decodeSegment(rawHeader).toString('utf8'));
    payload = JSON.parse(decodeSegment(rawPayload).toString('utf8'));
  } catch {
    throw new Error('malformed token');
  }

  if (header.alg !== 'RS256') throw new Error('unexpected signing algorithm');
  if (!header.kid) throw new Error('missing key id');

  const certs = await getSigningCerts();
  const cert = certs?.[header.kid];
  if (!cert) throw new Error('unknown key id');

  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${rawHeader}.${rawPayload}`);
  verifier.end();
  if (!verifier.verify(cert, decodeSegment(rawSignature))) {
    throw new Error('invalid signature');
  }

  const now = Math.floor(Date.now() / 1000);
  if (!payload.exp || payload.exp <= now) throw new Error('token expired');
  if (payload.iat && payload.iat > now + 300) throw new Error('token issued in the future');
  if (payload.aud !== projectId) throw new Error('audience mismatch');
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) throw new Error('issuer mismatch');
  if (!payload.sub) throw new Error('missing subject');

  return payload;
}

function getProjectId() {
  const raw = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || '';
  return String(raw).trim().replace(/^['"]|['"]$/g, '');
}

// Gate for every API route. Returns the caller ({ uid, email }) on success.
// On failure it has already written the response — the caller must return.
export async function requireAuth(req, res) {
  const projectId = getProjectId();
  if (!projectId) {
    console.error('[auth] FIREBASE_PROJECT_ID (or VITE_FIREBASE_PROJECT_ID) not set; refusing request');
    res.status(500).json({ error: 'Server authentication is not configured' });
    return null;
  }

  const headerValue = req.headers?.authorization || req.headers?.Authorization || '';
  const bearer = /^Bearer\s+(.+)$/i.exec(String(headerValue).trim());
  if (!bearer) {
    res.status(401).json({ error: 'Authentication required' });
    return null;
  }

  try {
    const claims = await verifyFirebaseIdToken(bearer[1], projectId);
    // Comped Max is granted by email, so only an address the provider has verified counts.
    // Otherwise anyone could sign up with someone else's address and inherit their access.
    const emailVerified = claims.email_verified === true;
    if (!emailVerified && claims.firebase?.sign_in_provider === 'password') {
      res.status(403).json({ error: 'Please verify your email address first.', code: 'email_unverified' });
      return null;
    }
    req.user = { uid: claims.sub, email: emailVerified ? (claims.email || null) : null };
    console.log('[auth] request authorised for uid=%s', req.user.uid);
    return req.user;
  } catch (err) {
    console.warn('[auth] rejected: %s', err.message);
    res.status(401).json({ error: 'Invalid or expired session. Please sign in again.' });
    return null;
  }
}

// For routes that also serve signed-out visitors (feedback). A missing, expired or invalid token
// means anonymous rather than a 401, so a report is never lost to a stale session. Unlike
// requireAuth it also lets unverified password accounts through, since "my verification email
// never arrived" is exactly the kind of report we want.
export async function optionalAuth(req) {
  const projectId = getProjectId();
  if (!projectId) return null;

  const headerValue = req.headers?.authorization || req.headers?.Authorization || '';
  const bearer = /^Bearer\s+(.+)$/i.exec(String(headerValue).trim());
  if (!bearer) return null;

  try {
    const claims = await verifyFirebaseIdToken(bearer[1], projectId);
    const emailVerified = claims.email_verified === true;
    return {
      uid: claims.sub,
      email: emailVerified ? claims.email || null : null,
      emailVerified,
      provider: claims.firebase?.sign_in_provider || null,
    };
  } catch (err) {
    console.warn('[auth] optional token ignored: %s', err.message);
    return null;
  }
}
