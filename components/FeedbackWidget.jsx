import React, { useEffect, useRef, useState } from 'react';
import { MessageSquare, Bug, Lightbulb, HelpCircle, Camera, ImagePlus, X, Send, CheckCircle2 } from 'lucide-react';
import { onAuthStateChange } from '../services/auth.js';
import { sendFeedback, getRecentErrors } from '../services/feedback.js';
import { LEGAL } from '../src/legal/config.js';

// The Feedback button and its dialog. Mounted once in src/main.jsx, outside the app itself, so
// it is on every screen (signed in or not, legal pages included) and keeps working when the
// app has crashed into a bad state. Other components open it with openFeedback().

const TYPES = [
  {
    id: 'bug',
    label: 'Report a problem',
    Icon: Bug,
    field: 'What happened?',
    placeholder: "Tell us what you were doing and what went wrong. It doesn't need to be perfect, every detail helps.",
  },
  {
    id: 'feedback',
    label: 'Share feedback',
    Icon: Lightbulb,
    field: "What's on your mind?",
    placeholder: `What do you like, what's missing, what would make ${LEGAL.product} more useful for you?`,
  },
  {
    id: 'other',
    label: 'Something else',
    Icon: HelpCircle,
    field: 'How can we help?',
    placeholder: 'Questions about your account, billing or anything else.',
  },
];

const MAX_MESSAGE = 5000;
// The server accepts up to 1,000,000 characters; staying under this leaves room for the rest of
// the request inside the smallest body limit we deploy behind.
const MAX_IMAGE_CHARS = 900000;
const COMPRESSION_STEPS = [[1600, 0.8], [1200, 0.6], [900, 0.5]];

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));

// Screenshots go up as JPEG data URLs, stepped down until they fit. Returns null if even the
// smallest step is too big.
function compressToJpeg(source) {
  for (const [maxWidth, quality] of COMPRESSION_STEPS) {
    const scale = Math.min(1, maxWidth / source.width);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(source.width * scale));
    canvas.height = Math.max(1, Math.round(source.height * scale));
    const ctx = canvas.getContext('2d');
    // JPEG has no transparency; white reads better than the black it would otherwise become.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    if (dataUrl.length <= MAX_IMAGE_CHARS) return dataUrl;
  }
  return null;
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('unreadable image')); };
    img.src = url;
  });
}

function clientDetails() {
  return {
    userAgent: navigator.userAgent,
    language: navigator.language,
    languages: navigator.languages ? [...navigator.languages] : [],
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    screen: `${window.screen.width}x${window.screen.height}@${window.devicePixelRatio}`,
    theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
  };
}

const FeedbackWidget = () => {
  const [user, setUser] = useState(null);
  const [open, setOpen] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [type, setType] = useState('bug');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [screenshot, setScreenshot] = useState(null);
  const [imageError, setImageError] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const buttonRef = useRef(null);
  const messageRef = useRef(null);
  const fileRef = useRef(null);
  const wasOpen = useRef(false);
  // Read inside the event listener, which is registered once.
  const messageValue = useRef(message);
  messageValue.current = message;

  useEffect(() => onAuthStateChange(setUser), []);

  const verifiedEmail = user?.emailVerified ? user.email : null;
  const current = TYPES.find((t) => t.id === type) || TYPES[0];

  useEffect(() => {
    const onOpen = (event) => {
      const preset = event.detail || {};
      if (TYPES.some((t) => t.id === preset.type)) setType(preset.type);
      if (typeof preset.message === 'string' && !messageValue.current.trim()) setMessage(preset.message);
      setOpen(true);
    };
    window.addEventListener('roleberry:feedback', onOpen);
    return () => window.removeEventListener('roleberry:feedback', onOpen);
  }, []);

  // Focus the message box on open and return it to the Feedback button on close.
  useEffect(() => {
    if (open && !capturing) {
      messageRef.current?.focus();
    } else if (!open && wasOpen.current) {
      buttonRef.current?.focus();
    }
    wasOpen.current = open;
  }, [open, capturing, result]);

  const close = () => {
    setOpen(false);
    setResult(null);
    setError('');
  };

  useEffect(() => {
    if (!open || capturing) return undefined;
    const onKey = (event) => { if (event.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, capturing]);

  const attachCanvas = (source) => {
    const dataUrl = compressToJpeg(source);
    if (!dataUrl) {
      setImageError('That image is too large. Try a smaller one.');
      return;
    }
    setImageError('');
    setScreenshot(dataUrl);
  };

  const attachFile = async (file) => {
    if (!file || !file.type.startsWith('image/')) {
      setImageError('Please choose an image file.');
      return;
    }
    try {
      attachCanvas(await loadImage(file));
    } catch {
      setImageError('Please choose an image file.');
    }
  };

  const capturePage = async () => {
    setImageError('');
    setCapturing(true);
    try {
      // Let the dialog and button disappear before the page is drawn.
      await nextFrame();
      await nextFrame();
      const { default: html2canvas } = await import('html2canvas');
      const canvas = await html2canvas(document.body, {
        x: window.scrollX,
        y: window.scrollY,
        width: window.innerWidth,
        height: window.innerHeight,
        scale: 1,
        useCORS: true,
        logging: false,
      });
      attachCanvas(canvas);
    } catch {
      setImageError("We couldn't capture this page. You can upload an image instead.");
    } finally {
      setCapturing(false);
    }
  };

  const onPaste = (event) => {
    const item = [...(event.clipboardData?.items || [])].find((i) => i.kind === 'file' && i.type.startsWith('image/'));
    if (!item) return;
    event.preventDefault();
    attachFile(item.getAsFile());
  };

  const submit = async (event) => {
    event.preventDefault();
    if (message.trim().length < 3 || sending) return;
    setSending(true);
    setError('');
    const formEmail = verifiedEmail ? null : email.trim() || null;
    try {
      const { ref } = await sendFeedback({
        type,
        message: message.trim(),
        email: formEmail,
        screenshot,
        page: { url: window.location.href, path: window.location.pathname, referrer: document.referrer },
        client: clientDetails(),
        recentErrors: getRecentErrors(),
        website,
      });
      setResult({ ref, email: verifiedEmail || formEmail });
      setMessage('');
      setScreenshot(null);
    } catch (err) {
      if (err.status === 429) {
        setError(`You've sent a few reports in a short time. Please wait a few minutes and try again, or email us at ${LEGAL.email}.`);
      } else if (err.status === 400 && err.message) {
        setError(err.message);
      } else {
        setError(`We couldn't send that just now. Please try again, or email us at ${LEGAL.email}.`);
      }
    } finally {
      setSending(false);
    }
  };

  const segment = (active) => (
    active
      ? 'bg-blue-600 text-white border-blue-600 dark:bg-blue-500 dark:border-blue-500'
      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-700'
  );
  const secondaryButton = 'inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800';

  return (
    <>
      {!open && !capturing && (
        <button
          ref={buttonRef}
          type="button"
          onClick={() => setOpen(true)}
          title="Report a problem or share feedback"
          aria-label="Report a problem or share feedback"
          className="fixed bottom-4 right-4 z-40 inline-flex items-center gap-2 rounded-full shadow-lg bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 text-sm font-medium dark:bg-blue-500 dark:hover:bg-blue-600 print:hidden"
        >
          <MessageSquare className="h-4 w-4" />
          Feedback
        </button>
      )}

      {open && !capturing && (
        <div
          className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 sm:p-4 print:hidden"
          onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="feedback-title"
            className="max-w-lg w-full max-h-[90vh] overflow-y-auto bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-t-xl sm:rounded-xl shadow-xl p-5 sm:p-6"
          >
            {result ? (
              <div className="text-center py-4">
                <CheckCircle2 className="h-12 w-12 text-green-600 dark:text-green-400 mx-auto" />
                <h2 id="feedback-title" className="mt-3 text-lg font-semibold">Thanks, we've got it.</h2>
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                  {result.email
                    ? `We're on it. We'll get back to you at ${result.email}, usually within a day.`
                    : `We're on it. If you'd like a reply, email us at ${LEGAL.email} and mention your reference.`}
                </p>
                <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">
                  Reference: <span className="font-mono text-gray-900 dark:text-gray-100">{result.ref}</span>
                </p>
                <button
                  type="button"
                  onClick={close}
                  className="mt-5 rounded-lg bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white px-4 py-2 text-sm font-medium"
                >
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={submit} noValidate>
                <h2 id="feedback-title" className="text-lg font-semibold">How can we help?</h2>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                  Something not working, or an idea to make {LEGAL.product} better? Tell us. We read every
                  message personally and usually reply within a day.
                </p>

                <div className="mt-4 grid grid-cols-3 gap-2">
                  {TYPES.map(({ id, label, Icon }) => (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={type === id}
                      onClick={() => setType(id)}
                      className={`flex flex-col sm:flex-row items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs sm:text-sm font-medium ${segment(type === id)}`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {label}
                    </button>
                  ))}
                </div>

                <label htmlFor="feedback-message" className="mt-4 block text-sm font-medium">{current.field}</label>
                <textarea
                  id="feedback-message"
                  ref={messageRef}
                  rows={5}
                  maxLength={MAX_MESSAGE}
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  onPaste={onPaste}
                  placeholder={current.placeholder}
                  className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {message.length > 4500 && (
                  <p className="mt-1 text-right text-xs text-gray-500 dark:text-gray-400">{message.length} / {MAX_MESSAGE}</p>
                )}

                <div className="mt-4">
                  <p className="text-sm font-medium">Screenshot (optional)</p>
                  {screenshot ? (
                    <div className="mt-2 flex items-start gap-3">
                      <img src={screenshot} alt="Attached screenshot" className="max-h-32 rounded border border-gray-200 dark:border-gray-700" />
                      <button type="button" onClick={() => setScreenshot(null)} aria-label="Remove screenshot" className={secondaryButton}>
                        <X className="h-4 w-4" />
                        Remove
                      </button>
                    </div>
                  ) : (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button type="button" onClick={capturePage} className={secondaryButton}>
                        <Camera className="h-4 w-4" />
                        Capture this page
                      </button>
                      <button type="button" onClick={() => fileRef.current?.click()} className={secondaryButton}>
                        <ImagePlus className="h-4 w-4" />
                        Upload an image
                      </button>
                      <input
                        ref={fileRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(event) => { attachFile(event.target.files?.[0]); event.target.value = ''; }}
                      />
                    </div>
                  )}
                  {imageError && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{imageError}</p>}
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Screenshots can show your CV details. Only attach one if you're happy for us to see it.
                  </p>
                </div>

                <div className="mt-4">
                  {verifiedEmail ? (
                    <p className="text-sm text-gray-600 dark:text-gray-300">We'll reply to {verifiedEmail}.</p>
                  ) : (
                    <>
                      <label htmlFor="feedback-email" className="block text-sm font-medium">Your email (so we can reply)</label>
                      <input
                        id="feedback-email"
                        type="email"
                        autoComplete="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        placeholder="you@example.com"
                        className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </>
                  )}
                </div>

                {/* Honeypot: hidden from people, filled in by bots. */}
                <input
                  name="website"
                  className="hidden"
                  tabIndex={-1}
                  autoComplete="off"
                  aria-hidden="true"
                  value={website}
                  onChange={(event) => setWebsite(event.target.value)}
                />

                <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">
                  To help us fix things faster, we'll include the page you're on and basic browser details.
                </p>

                {error && <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

                <div className="mt-4 flex justify-end gap-2">
                  <button type="button" onClick={close} className="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800">
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={sending || message.trim().length < 3}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white px-4 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Send className="h-4 w-4" />
                    {sending ? 'Sending…' : 'Send'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default FeedbackWidget;
