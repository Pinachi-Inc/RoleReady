import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Adds Meta's domain-verification <meta> tag when VITE_META_DOMAIN_VERIFICATION
// is set, and leaves index.html untouched otherwise.
const metaDomainVerification = (content) => ({
  name: 'meta-domain-verification',
  transformIndexHtml: () =>
    content
      ? [{ tag: 'meta', attrs: { name: 'facebook-domain-verification', content }, injectTo: 'head' }]
      : [],
});

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    plugins: [react(), metaDomainVerification((env.VITE_META_DOMAIN_VERIFICATION || '').trim())],
    server: {
      port: 5173,
      host: true, // listen on all addresses
      allowedHosts: true, // allow all hosts (e.g., any *.ngrok-free.app)
      proxy: {
        '/api': 'http://localhost:8787'
      }
    }
  };
});


