// First-touch attribution: what a landing URL and referrer turn into, and what lands on the
// account. Pure functions, no browser needed.
import assert from 'node:assert/strict';
import { touchFromVisit, sourceLabel, signupSourceRecord, channelOf } from '../../src/attribution.js';

const now = new Date('2026-10-27T12:00:00Z');
let passed = 0;
const test = (name, fn) => {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
};

test('Reddit ad link with UTMs', () => {
  const t = touchFromVisit('https://roleberry.app/?utm_source=reddit&utm_medium=paid&utm_campaign=rtest1&utm_content=a&rdt_cid=123', 'https://www.reddit.com/r/resumes/?x=secret', now);
  assert.equal(sourceLabel(t), 'reddit');
  assert.equal(t.utm_campaign, 'rtest1');
  assert.equal(t.click_id, 'rdt_cid');
  assert.equal(t.referrer, 'https://www.reddit.com/r/resumes/');
  assert.equal(t.referrer_host, 'reddit.com');
});

test('click id alone names the network', () => {
  assert.equal(sourceLabel(touchFromVisit('https://roleberry.app/?fbclid=abc', '', now)), 'meta');
  assert.equal(sourceLabel(touchFromVisit('https://roleberry.app/?rdt_cid=abc', '', now)), 'reddit');
});

test('sources group into meta, reddit or other', () => {
  for (const s of ['meta', 'facebook', 'instagram', 'l.facebook.com']) assert.equal(channelOf(s), 'meta');
  for (const s of ['reddit', 'reddit.com', 'out.reddit.com']) assert.equal(channelOf(s), 'reddit');
  for (const s of ['google', 'google.com', 'chatgpt.com', 'direct', null]) assert.equal(channelOf(s), 'other');
});

test('utm_source is lowercased', () => {
  assert.equal(sourceLabel(touchFromVisit('https://roleberry.app/?utm_source=Meta', '', now)), 'meta');
});

test('plain referral uses the referring host', () => {
  const t = touchFromVisit('https://roleberry.app/', 'https://news.ycombinator.com/item?id=1', now);
  assert.equal(sourceLabel(t), 'news.ycombinator.com');
});

test('typed URL or own-site link is not a touch', () => {
  assert.equal(touchFromVisit('https://roleberry.app/', '', now), null);
  assert.equal(touchFromVisit('https://roleberry.app/privacy', 'https://roleberry.app/', now), null);
  assert.equal(touchFromVisit('https://www.roleberry.app/', 'https://roleberry.app/', now), null);
});

test('no touch is recorded as direct on the account', () => {
  const r = signupSourceRecord(null, 'email', now);
  assert.equal(r.source, 'direct');
  assert.equal(r.method, 'email');
  assert.equal(r.signedUpAt, now.toISOString());
  assert.equal(r.utm_source, null);
});

test('record carries the campaign fields', () => {
  const t = touchFromVisit('https://roleberry.app/?utm_source=meta&utm_campaign=msgtest1&utm_content=b', '', now);
  const r = signupSourceRecord(t, 'google', now);
  assert.equal(r.source, 'meta');
  assert.equal(r.utm_content, 'b');
  assert.equal(r.first_seen, now.toISOString());
  assert.equal(r.landing_path, '/');
});

console.log(`attribution: ${passed} passed`);
