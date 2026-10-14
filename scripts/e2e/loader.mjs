// Module hook for the e2e harness: server code that imports firebase-admin or axios gets the
// in-memory fakes next to this file instead. Nothing outside server/ is redirected.
const FAKES = {
  'firebase-admin': new URL('./fake-firebase-admin.mjs', import.meta.url).href,
  axios: new URL('./fake-axios.mjs', import.meta.url).href,
};

export async function resolve(specifier, context, next) {
  if (FAKES[specifier] && context.parentURL && context.parentURL.includes('/server/')) {
    return { url: FAKES[specifier], shortCircuit: true };
  }
  return next(specifier, context);
}
