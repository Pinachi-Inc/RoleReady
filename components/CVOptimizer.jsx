import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Download, FileText, Zap, AlertCircle, Save, Info, Copy, Check, Upload, User, ChevronRight, FolderOpen, Plus, Trash2, X, Link2, Award, GraduationCap, Briefcase, BarChart3 } from 'lucide-react';
import { convertMarkdownToHtml } from '../utils/markdown.js';
import { generateDownloadHtml, downloadHtml } from '../utils/download.js';
import html2pdf from 'html2pdf.js';

function extractBody(htmlString) {
  try {
    const match = String(htmlString || '').match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    return match ? match[1] : htmlString;
  } catch {
    return htmlString;
  }
}
import { renderCvHtml, renderCoverLetterHtml } from '../src/templateRenderer.js';
import { buildCvPdf, buildCoverLetterPdf } from '../src/cvPdf.js';
import { prefetchOcrAssets, ocrPdfInBrowser, isOcrSupported } from '../services/browserOcr.js';
import { optimizeCv as optimizeCvService } from '../services/openai.js';
import { getBillingStatus, startCheckout, openBillingPortal } from '../services/billing.js';
import { newProfileId, saveProfile, renameProfile, deleteProfile, activateProfile } from '../services/profiles.js';
import ProfileSwitcher from './ProfileSwitcher.jsx';
import HistoryPage from './HistoryPage.jsx';
import PricingModal from './PricingModal.jsx';
import Landing from './Landing.jsx';
import LoginPage from './LoginPage.jsx';
import { TopBar, PlanStrip } from './AppShell.jsx';
import { processPdf, processPdfText } from '../services/pdf.js';
import { onAuthStateChange, onIdTokenChange, saveUserData, getUserData, needsEmailVerification } from '../services/auth.js';
import { writePdfWithHandle, getFolderHandle, isFolderApiSupported } from '../services/folderManager.js';
import Auth from './Auth.jsx';
import { recordAppError, openFeedback } from '../services/feedback.js';
import VerifyEmail from './VerifyEmail.jsx';

// Repairs role ids on a raw aiUserInfo JSON string. The dedupe inside formDataToJson
// only runs on Save, but aiUserInfo also arrives straight from PDF extraction and from
// Firestore — and handleOptimize sends that state as-is. Without this, importing a CV
// and optimising without saving ships the extraction model's duplicate/placeholder ids,
// and every job in the result inherits the last role's title, company and dates.
const withUniqueRoleIds = (aiJson) => {
  try {
    const parsed = JSON.parse(aiJson || '{}');
    if (!Array.isArray(parsed?.experienceSource)) return aiJson;
    const used = new Set();
    parsed.experienceSource = parsed.experienceSource.map((role) => {
      let id = role?.roleId || makeRoleId();
      while (used.has(id)) id = makeRoleId();
      used.add(id);
      return { ...role, roleId: id };
    });
    return JSON.stringify(parsed, null, 2);
  } catch {
    return aiJson;
  }
};

// Sign-in and sign-up live at their own paths. There is no router: Vercel rewrites every
// path to index.html and the signed-out branch picks the page from the pathname.
const AUTH_PATHS = { '/login': 'signin', '/signup': 'signup' };
const currentPath = () => window.location.pathname.replace(/\/+$/, '') || '/';

// Setup page sections, ordered low-effort first so the heavy ones come after the
// user has already invested something. Drives the rail, the counts and the progress meter.
const SETUP_SECTIONS = [
  { id: 'import', label: 'Import' },
  { id: 'personal', label: 'Personal' },
  { id: 'links', label: 'Links' },
  { id: 'skills', label: 'Skills' },
  { id: 'experience', label: 'Experience' },
  { id: 'education', label: 'Education' },
  { id: 'certifications', label: 'Certifications' }
];

// Role ids key the server-side merge that re-attaches title/company/dates to each
// job. They must be unique: Date.now() alone is not, because the roles are built
// in one synchronous map and all land in the same millisecond.
const makeRoleId = () => (
  typeof globalThis.crypto?.randomUUID === 'function'
    ? `role_${globalThis.crypto.randomUUID()}`
    : `role_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
);

// Factory, not a shared constant — the form handlers mutate nested arrays in place,
// so every reset needs its own copy.
const emptyFormData = () => ({
  // Personal Info
  name: '',
  email: '',
  phone: '',
  location: '',
  yearsOfExperience: '', // Total years of professional experience
  links: [''],
  certifications: [''],
  education: [''],

  // Skills & Experience
  skills: [
    { category: '', items: [''] }
  ],
  experience: [
    {
      roleId: '',
      title: '',
      company: '',
      location: '',
      start: '',
      end: '',
      achievements: ['']
    }
  ]
});

// Shared style tokens and presentational pieces for the setup page. These MUST live
// at module scope: defined inside the component they would be a new component type on
// every render, remounting their inputs and dropping focus after each keystroke.
  const inputCls = 'w-full min-w-0 h-11 px-3.5 text-sm rounded-[10px] border border-line bg-white text-ink placeholder:text-ink-faint focus:outline-none focus:border-berry focus:ring-4 focus:ring-berry/15 dark:bg-night-raised dark:border-night-line dark:text-night-text';
  const labelCls = 'block text-[13px] font-semibold text-ink mb-1.5 dark:text-night-text';
  const cardCls = 'bg-white border border-line rounded-2xl overflow-hidden dark:bg-night-raised dark:border-night-line';
  const addBtnCls = 'inline-flex items-center gap-1.5 h-[34px] px-3 rounded-[9px] border border-line bg-white text-[13px] font-semibold text-ink hover:bg-blush dark:bg-night-raised dark:border-night-line dark:text-night-text';

  const SectionHead = ({ icon: Icon, title, hint, actions }) => (
    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-3">
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 text-lg font-extrabold tracking-tight text-ink dark:text-night-text">
          <Icon className="h-4 w-4 text-berry shrink-0" />
          {title}
        </h2>
        {hint && <p className="mt-1 text-[13.5px] text-ink-muted dark:text-night-muted">{hint}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );

  const SimpleList = ({ values, onChange, onAdd, onRemove, placeholder, addLabel, type = 'text' }) => (
    <div className={cardCls}>
      <ul className="divide-y divide-line dark:divide-night-line">
        {values.map((value, index) => (
          <li key={index} className="flex items-center gap-2 p-3">
            <span className="w-6 shrink-0 text-xs tabular-nums text-ink-faint dark:text-night-muted text-center">{index + 1}</span>
            <input
              type={type}
              value={value}
              onChange={(e) => onChange(index, e.target.value)}
              className={inputCls}
              placeholder={placeholder}
            />
            {values.length > 1 && (
              <button
                type="button"
                onClick={() => onRemove(index)}
                className="shrink-0 p-2 rounded-lg text-ink-faint hover:text-danger-text hover:bg-danger-bg transition-colors"
                aria-label="Remove"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </li>
        ))}
      </ul>
      <div className="border-t border-line bg-blush p-2 dark:bg-night-surface dark:border-night-line">
        <button
          type="button"
          onClick={onAdd}
          className={addBtnCls}
        >
          <Plus className="h-4 w-4" />
          {addLabel}
        </button>
      </div>
    </div>
  );


const CVOptimizer = () => {
  const [jobDescription, setJobDescription] = useState('');
  const [aiUserInfo, setAiUserInfo] = useState('');
  const [fixedUserInfo, setFixedUserInfo] = useState('');
  const [optimizedCv, setOptimizedCv] = useState('');
  const [structuredCv, setStructuredCv] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const hasUnsupported = (analysis?.unsupported?.length ?? 0) > 0;
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentPage, setCurrentPage] = useState('main'); // 'main' | 'setup'
  const [user, setUser] = useState(null);
  // user.reload() updates the same object in place, so bump this to re-render after verifying.
  const [, setAuthTick] = useState(0);
  const awaitingVerification = needsEmailVerification(user);
  const [isSaving, setIsSaving] = useState(false);
  const [showUserInfoModal, setShowUserInfoModal] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [showTips, setShowTips] = useState(false);
  const [isProcessingPdf, setIsProcessingPdf] = useState(false);
  const [pdfError, setPdfError] = useState('');
  const [ocrStatus, setOcrStatus] = useState('');
  const [setupTab, setSetupTab] = useState('personal');
  const [jdCollapsed, setJdCollapsed] = useState(false); // Desktop-only JD sidebar collapse
  // True while the result shown is a past run opened from History, so it can offer the way back.
  const [openedFromHistory, setOpenedFromHistory] = useState(false);
  const [folderMgmtEnabled, setFolderMgmtEnabled] = useState(() => localStorage.getItem('folderMgmtEnabled') === 'true');
  const [companyName, setCompanyName] = useState('');
  const [wantsCoverLetter, setWantsCoverLetter] = useState(() => localStorage.getItem('wantsCoverLetter') === 'true');
  const [coverLetter, setCoverLetter] = useState('');
  const [activeDoc, setActiveDoc] = useState('cv'); // 'cv' | 'letter'
  const [letterCopied, setLetterCopied] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadNotice, setDownloadNotice] = useState('');
  const [downloadNoticeTone, setDownloadNoticeTone] = useState('warn'); // 'warn' | 'ok'
  const [billing, setBilling] = useState(null); // server's view of plan and allowance, see services/billing.js
  const [showPaywall, setShowPaywall] = useState(false);
  const [billingBusy, setBillingBusy] = useState(false);
  const [billingNotice, setBillingNotice] = useState('');
  const [profiles, setProfiles] = useState({}); // saved profiles (free 1, paid 3), see services/profiles.js
  const [activeProfileId, setActiveProfileId] = useState(null);
  const [profileBusy, setProfileBusy] = useState(false);
  // Read once: Lemon Squeezy's checkout sends people back to /?checkout=success.
  const checkoutReturnRef = useRef(new URLSearchParams(window.location.search).get('checkout'));
  const downloadingRef = useRef(false);

  const handleToggleFolderMgmt = (val) => {
    setFolderMgmtEnabled(val);
    localStorage.setItem('folderMgmtEnabled', val ? 'true' : 'false');
  };
  
  // Structured form data
  const [formData, setFormData] = useState(emptyFormData);

  // Helper functions to convert between form data and JSON
  const formDataToJson = () => {
    const fixedUserInfo = {
      name: formData.name,
      yearsOfExperience: formData.yearsOfExperience ? parseFloat(formData.yearsOfExperience) : null,
      contact: {
        email: formData.email,
        phone: formData.phone,
        location: formData.location,
        links: formData.links.filter(link => link.trim())
      },
      certifications: formData.certifications.filter(cert => cert.trim()),
      education: formData.education.filter(edu => edu.trim())
    };

    // Also repairs profiles saved before role ids were unique: any duplicate that
    // comes back from storage is reissued rather than silently shadowing a sibling.
    const usedRoleIds = new Set();
    const aiUserInfo = {
      coreSkillsBase: formData.skills
        .filter(skill => skill.category.trim())
        .map(skill => ({
          category: skill.category,
          items: skill.items.filter(item => item.trim())
        })),
      experienceSource: formData.experience
        .filter(exp => exp.title.trim())
        .map(exp => {
          let roleId = exp.roleId || makeRoleId();
          while (usedRoleIds.has(roleId)) roleId = makeRoleId();
          usedRoleIds.add(roleId);

          return {
            roleId,
            title: exp.title,
            company: exp.company,
            location: exp.location,
            start: exp.start,
            end: exp.end,
            baseAchievements: exp.achievements.filter(ach => ach.trim())
          };
        })
    };

    return { fixedUserInfo, aiUserInfo };
  };

  const jsonToFormData = (fixedJson, aiJson) => {
    try {
      const fixed = fixedJson ? JSON.parse(fixedJson) : {};
      const ai = aiJson ? JSON.parse(aiJson) : {};
      
      // Everything here is coerced. The source is model-generated JSON with no shape
      // validation on the server, so a missing key must not reach a controlled input or
      // a .trim() call during render — either one takes the page down.
      const strList = (value, fallback = ['']) => {
        const clean = Array.isArray(value) ? value.filter(v => typeof v === 'string') : [];
        return clean.length ? clean : fallback;
      };

      setFormData({
        name: fixed.name || '',
        email: fixed.contact?.email || '',
        phone: fixed.contact?.phone || '',
        location: fixed.contact?.location || '',
        yearsOfExperience: fixed.yearsOfExperience ? String(fixed.yearsOfExperience) : '',
        links: strList(fixed.contact?.links),
        certifications: strList(fixed.certifications),
        education: strList(fixed.education),

        skills: Array.isArray(ai.coreSkillsBase) && ai.coreSkillsBase.length
          ? ai.coreSkillsBase.map(skill => ({
              category: skill?.category || '',
              items: strList(skill?.items)
            }))
          : [{ category: '', items: [''] }],

        experience: Array.isArray(ai.experienceSource) && ai.experienceSource.length
          ? ai.experienceSource.map(exp => ({
              roleId: exp?.roleId || '',
              title: exp?.title || '',
              company: exp?.company || '',
              location: exp?.location || '',
              start: exp?.start || '',
              end: exp?.end || '',
              achievements: strList(exp?.baseAchievements)
            }))
          : [{
              roleId: '',
              title: '',
              company: '',
              location: '',
              start: '',
              end: '',
              achievements: ['']
            }]
      });
    } catch (error) {
      console.error('Error parsing JSON:', error);
    }
  };

  const isValidFormData = () => {
    return formData.name.trim() && 
           formData.skills.some(skill => skill.category.trim() && skill.items.some(item => item.trim())) &&
           formData.experience.some(exp => exp.title.trim());
  };

  const needsSetup = !isValidFormData();

  // Theme state must be declared before any conditional returns to keep hook order stable
  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    const root = document.documentElement;
    if (isDark) root.classList.add('dark'); else root.classList.remove('dark');
  }, [isDark]);

  // After signing in on /login or /signup (or opening them while signed in), land on the app at /.
  useEffect(() => {
    if (user && AUTH_PATHS[currentPath()]) window.history.replaceState(null, '', '/');
  }, [user]);

  // Setup page: section rail state. Declared here, above the early returns, so hook
  // order stays stable regardless of which page is rendering.
  const [activeSection, setActiveSection] = useState(SETUP_SECTIONS[0].id);
  const [collapsedSkills, setCollapsedSkills] = useState(() => new Set());
  const [collapsedRoles, setCollapsedRoles] = useState(() => new Set());
  const [skillDrafts, setSkillDrafts] = useState({});
  const sectionRefs = useRef({});

  // A signed-in user with no profile can only go to the setup page and its CV upload,
  // so start warming the OCR assets now rather than making them wait for a ~7MB
  // download at the moment they pick a scanned file. Never blocks and never throws.
  useEffect(() => {
    if (!user || !needsSetup || !isOcrSupported()) return;
    prefetchOcrAssets();
  }, [user, needsSetup]);

  // Scroll-spy for the rail. Re-armed whenever the setup page mounts its sections.
  useEffect(() => {
    if (currentPage !== 'setup') return undefined;
    const nodes = SETUP_SECTIONS.map(s => sectionRefs.current[s.id]).filter(Boolean);
    if (nodes.length === 0) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]?.target?.id) setActiveSection(visible[0].target.id);
      },
      { rootMargin: '-10% 0px -70% 0px', threshold: 0 }
    );
    nodes.forEach(n => observer.observe(n));
    return () => observer.disconnect();
  }, [currentPage]);

  const fixedInfoSchema = `{
  "name": "string",
  "contact": { "email": "string", "phone": "string", "location": "string", "links": ["string"] },
  "certifications": ["string"],
  "education": ["string"]
}`;

  const aiInfoSchema = `{
  "coreSkillsBase": [
    { "category": "string", "items": ["string"] }
  ],
  "experienceSource": [
    {
      "roleId": "string",
      "title": "string",
      "company": "string",
      "location": "string",
      "start": "YYYY or YYYY-MM",
      "end": "YYYY or YYYY-MM | Present",
      "baseAchievements": ["string"]
    }
  ]
}`;

  // Wipe everything derived from the signed-in account. Called on sign-out and
  // whenever a signed-in account turns out to have no stored profile, so one
  // user's data can never be shown to (or saved under) the next.
  const clearSessionData = () => {
    setFormData(emptyFormData());
    setAiUserInfo('');
    setFixedUserInfo('');
    setJobDescription('');
    setOptimizedCv('');
    setStructuredCv(null);
    setAnalysis(null);
    setCompanyName('');
    setCoverLetter('');
    setActiveDoc('cv');
    setJdCollapsed(false);
    setPdfError('');
    setDownloadNotice('');
    setProfiles({});
    setActiveProfileId(null);
    setCurrentPage('main');
  };

  // A refreshed token can carry a newly verified email (GitHub check, inbox link). The user
  // object changes in place, so re-render to pick it up.
  useEffect(() => onIdTokenChange(() => setAuthTick((n) => n + 1)), []);

  // Auth state management
  useEffect(() => {
    const unsubscribe = onAuthStateChange(async (user) => {
      setUser(user);
      if (user) {
        // Load user data when signed in
        try {
          const userData = await getUserData(user.uid);
          if (userData) {
            // Repair role ids on the way in: profiles saved before ids were unique
            // would otherwise optimise into a CV where every job shares one header.
            const storedAi = withUniqueRoleIds(userData.aiUserInfo || '');
            setAiUserInfo(storedAi);
            setFixedUserInfo(userData.fixedUserInfo || '');

            // Populate form data from existing JSON
            jsonToFormData(userData.fixedUserInfo || '', storedAi);
            setProfiles(userData.profiles && typeof userData.profiles === 'object' ? userData.profiles : {});
            setActiveProfileId(userData.activeProfileId || null);
          } else {
            // Fresh account with nothing stored — start from a blank profile
            // rather than inheriting whoever was signed in before.
            clearSessionData();
          }
        } catch (error) {
          console.error('Error loading user data:', error);
        }
      } else {
        clearSessionData();
      }
    });

    return () => unsubscribe();
  }, []);

  const refreshBilling = async () => {
    try {
      const status = await getBillingStatus();
      setBilling(status);
      return status;
    } catch (err) {
      console.warn('[billing] could not load plan: %s', err?.message || err);
      return null;
    }
  };

  // Load the plan whenever the signed-in account changes. After a checkout return the
  // webhook can land a few seconds after the redirect, so poll briefly until it does. The
  // redirect itself grants nothing; only the webhook does.
  useEffect(() => {
    if (!user || awaitingVerification) {
      setBilling(null);
      return;
    }
    let cancelled = false;
    const run = async () => {
      const returned = checkoutReturnRef.current;
      if (returned) {
        checkoutReturnRef.current = null;
        window.history.replaceState(null, '', window.location.pathname);
      }
      let status = await refreshBilling();
      if (returned === 'success') {
        setBillingNotice('Payment received. Activating your subscription…');
        for (let i = 0; i < 8 && !cancelled && status?.plan === 'free'; i++) {
          await new Promise((r) => setTimeout(r, 2000));
          status = await refreshBilling();
        }
        if (cancelled) return;
        setBillingNotice(status && status.plan !== 'free'
          ? `You are on Roleberry ${status.plan === 'max' ? 'Max' : 'Pro'}. Thanks for subscribing!`
          : 'Payment received. Your plan will update in a moment; refresh the page if it does not.');
      }
    };
    run();
    return () => { cancelled = true; };
  }, [user?.uid, awaitingVerification, user?.emailVerified]);

  // plan: 'pro' | 'max'. A free account is sent to checkout. A subscriber asking for the other
  // plan is switched in place by the server (prorated), and the new plan shows on refresh.
  const handleUpgrade = async (plan) => {
    setBillingBusy(true);
    try {
      const result = await startCheckout(plan);
      if (result?.switched) {
        setBillingBusy(false);
        setShowPaywall(false);
        await refreshBilling();
        setBillingNotice(`You are now on Roleberry ${result.switched === 'max' ? 'Max' : 'Pro'}.`);
      }
    } catch (err) {
      setBillingBusy(false);
      if (err.code === 'use_portal') {
        handleManageBilling();
      } else if (err.status === 409) {
        refreshBilling();
        setShowPaywall(false);
        setBillingNotice('Your account already has full access.');
      } else {
        alert(err.message || 'Could not start checkout. Please try again.');
      }
    }
  };

  const handleManageBilling = async () => {
    setBillingBusy(true);
    try {
      await openBillingPortal();
    } catch (err) {
      setBillingBusy(false);
      alert(err.message || 'Could not open billing settings. Please try again.');
    }
  };

  // Free keeps one saved profile, paid more. Until the billing status loads the switcher stays
  // locked: the paywall is the safe thing to show, and firestore.rules enforce the cap regardless.
  const profilesUnlocked = Boolean(billing);
  const profileLimit = billing?.profileLimit ?? null;

  const runProfileOp = async (fn, failure) => {
    setProfileBusy(true);
    try {
      await fn();
    } catch (err) {
      console.error('[profiles] %s', err?.message || err);
      alert(err?.code === 'permission-denied'
        ? 'Your plan does not allow that. Free keeps 1 saved profile, Pro up to 3, Max unlimited.'
        : failure);
    } finally {
      setProfileBusy(false);
    }
  };

  const handleSaveProfileAs = (name) => runProfileOp(async () => {
    if (!aiUserInfo.trim()) {
      alert('Set up your info first, then save it as a profile.');
      return;
    }
    const id = newProfileId();
    const entry = { name, aiUserInfo, fixedUserInfo, updatedAt: new Date().toISOString() };
    await saveProfile(user.uid, id, entry);
    setProfiles((prev) => ({ ...prev, [id]: entry }));
    setActiveProfileId(id);
  }, 'Could not save the profile. Please try again.');

  const handleSwitchProfile = (id) => runProfileOp(async () => {
    const p = profiles[id];
    if (!p) return;
    const ai = withUniqueRoleIds(p.aiUserInfo || '');
    await activateProfile(user.uid, id, { aiUserInfo: ai, fixedUserInfo: p.fixedUserInfo || '' });
    setAiUserInfo(ai);
    setFixedUserInfo(p.fixedUserInfo || '');
    jsonToFormData(p.fixedUserInfo || '', ai);
    setActiveProfileId(id);
  }, 'Could not switch profile. Please try again.');

  const handleRenameProfile = (id, name) => runProfileOp(async () => {
    await renameProfile(user.uid, id, name);
    setProfiles((prev) => ({ ...prev, [id]: { ...prev[id], name } }));
  }, 'Could not rename the profile. Please try again.');

  const handleDeleteProfile = (id) => runProfileOp(async () => {
    const wasActive = id === activeProfileId;
    await deleteProfile(user.uid, id, { wasActive });
    setProfiles((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    if (wasActive) setActiveProfileId(null);
  }, 'Could not delete the profile. Please try again.');

  // Loads a past run from history into the result view, where the usual download works.
  const handleOpenRun = (run) => {
    setOptimizedCv(run.cvContent || '');
    setStructuredCv(run.cv || null);
    setCoverLetter(run.coverLetter || '');
    setCompanyName(run.companyName || '');
    setAnalysis(null);
    setDownloadNotice('');
    setActiveDoc('cv');
    setJdCollapsed(true);
    setOpenedFromHistory(true);
    setCurrentPage('main');
  };

  const saveUserInfo = async () => {
    if (!user) {
      alert('Please sign in to save your information.');
      return;
    }

    setIsSaving(true);
    try {
      const { fixedUserInfo: fixedJson, aiUserInfo: aiJson } = formDataToJson();
      
      const aiStr = JSON.stringify(aiJson, null, 2);
      const fixedStr = JSON.stringify(fixedJson, null, 2);
      // Editing while a saved profile is active updates that profile too, unless the account
      // holds more profiles than its plan allows (e.g. it cancelled Pro): firestore.rules would
      // refuse the profile write and fail the whole save.
      const withinProfileCap = profileLimit == null || Object.keys(profiles).length <= profileLimit;
      const syncProfile = profilesUnlocked && withinProfileCap && activeProfileId && profiles[activeProfileId];
      const now = new Date().toISOString();
      await saveUserData(user.uid, {
        aiUserInfo: aiStr,
        fixedUserInfo: fixedStr,
        lastUpdated: now,
        ...(syncProfile ? { profiles: { [activeProfileId]: { aiUserInfo: aiStr, fixedUserInfo: fixedStr, updatedAt: now } } } : {})
      });
      if (syncProfile) {
        setProfiles((prev) => ({ ...prev, [activeProfileId]: { ...prev[activeProfileId], aiUserInfo: aiStr, fixedUserInfo: fixedStr, updatedAt: now } }));
      }
      
      // Also update the JSON state for backward compatibility
      setAiUserInfo(JSON.stringify(aiJson, null, 2));
      setFixedUserInfo(JSON.stringify(fixedJson, null, 2));
      
      // Saved successfully
    } catch (error) {
      console.error('Error saving user data:', error);
      alert('Failed to save user information. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePdfUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    // Reset previous error
    setPdfError('');
    setIsProcessingPdf(true);

    try {
      console.log('📄 Processing PDF:', file.name);

      let result;
      try {
        result = await processPdf(file);
      } catch (serverErr) {
        // The server refuses image-based PDFs. That is the only case we take over:
        // everything else is re-thrown so the existing error handling is unchanged.
        const isImageBased = /image-based/i.test(serverErr?.message || '');
        if (!isImageBased || !isOcrSupported()) throw serverErr;

        console.log('[ocr] server reported an image-based PDF, running OCR in the browser');
        setOcrStatus('Scanned CV detected. Reading it here in your browser…');
        const text = await ocrPdfInBrowser(file, ({ page, pages }) => {
          setOcrStatus(`Reading page ${page} of ${pages}…`);
        });

        if (!text || text.trim().length < 50) {
          throw new Error('Could not read enough text from this scan. A clearer copy, or a text-based PDF, would work better.');
        }
        console.log('[ocr] extracted %s characters, sending for processing', text.length);
        setOcrStatus('Building your profile…');
        result = await processPdfText(text);
      }

      // The extraction model is given a roleId field with no uniqueness instruction, so
      // repair before anything reads it. Optimize sends this state directly, and the
      // setup overlay lifts as soon as the form is valid, so a user can generate from
      // an import without ever saving.
      const importedAi = withUniqueRoleIds(result.aiUserInfo);

      // Auto-populate the form data from PDF processing
      jsonToFormData(result.fixedUserInfo, importedAi);

      // Also update the JSON fields for backward compatibility
      setAiUserInfo(importedAi);
      setFixedUserInfo(result.fixedUserInfo);
      
      // Move to personal info tab to show the results
      setSetupTab('personal');
      
      console.log('✅ PDF processed successfully');
    } catch (error) {
      console.error('PDF processing error:', error);
      recordAppError(`PDF import: ${error.message}`);
      setPdfError(error.message || 'Failed to process PDF');
    } finally {
      setIsProcessingPdf(false);
      setOcrStatus('');
      // Clear the file input
      event.target.value = '';
    }
  };

  const downloadCv = async () => {
    if (downloadingRef.current) return;
    downloadingRef.current = true;
    setIsDownloading(true);

    // Everything below is inside the try whose finally releases downloadingRef.
    // It used to start after the folder-handle await — so when that await hung, the
    // guard stayed true forever and every later click returned silently.
    try {
    setDownloadNotice('');
    setDownloadNoticeTone('warn');

    // Acquire folder handle FIRST — must happen early while user gesture
    // (transient activation) is still valid.
    let preFetchedFolderHandle = null;
    let filePickerBlocked = false;
    console.log('[download] start: folderMgmt=%s apiSupported=%s doc=%s',
      folderMgmtEnabled, isFolderApiSupported(), activeDoc);

    if (folderMgmtEnabled && isFolderApiSupported()) {
      try {
        preFetchedFolderHandle = await getFolderHandle();
        console.log('[download] folder handle acquired: %s', preFetchedFolderHandle?.name);
      } catch (err) {
        // Any failure here blocks the later save picker as well. By the time that
        // picker would run, PDF rendering has consumed the click's transient
        // activation, so it can only throw SecurityError and drop the file into
        // the default download folder without saying so.
        filePickerBlocked = true;
        if (err?.name === 'AbortError') {
          setDownloadNotice('Folder access was cancelled, so the PDF went to your usual downloads folder.');
        } else if (err?.name === 'PICKER_TIMEOUT' || /already active/i.test(err?.message || '')) {
          // Chrome is not answering its own file picker. Nothing the app can do about
          // that, so stop letting it cost the user their download.
          console.warn('[download] folder picker unavailable; continuing without it');
          setDownloadNotice('Chrome did not respond to the folder picker, so the PDF went to your usual downloads folder. Restarting Chrome usually clears this, or switch folder management off.');
        } else {
          console.error('[download] could not acquire folder handle:', err);
          setDownloadNotice('Could not open the chosen folder, so the PDF went to your usual downloads folder.');
        }
      }
    }

    const formatName = (raw) => {
      const clean = String(raw || '').trim();
      if (!clean) return '';
      const parts = clean
        .replace(/[^a-zA-Z\s]/g, ' ')
        .split(/\s+/)
        .filter(Boolean);
      const first = parts[0] ? parts[0][0].toUpperCase() + parts[0].slice(1).toLowerCase() : '';
      const second = parts[1] ? parts[1][0].toUpperCase() + parts[1].slice(1).toLowerCase() : '';
      const joined = [first, second].filter(Boolean).join('_');
      return joined || '';
    };

    const getPreferredFilename = () => {
      // Prefer structured cv name
      if (structuredCv && structuredCv.name) {
        const n = formatName(structuredCv.name);
        if (n) return n;
      }
      // Try fixedUserInfo JSON
      try {
        const parsed = JSON.parse(String(fixedUserInfo || ''));
        const n = formatName(parsed?.name);
        if (n) return n;
      } catch {}
      // Fallback
      return 'RoleBerry_CV';
    };

    // The download follows whichever document is on screen.
    const showingLetter = Boolean(coverLetter) && activeDoc === 'letter';
    const baseFilename = showingLetter
      ? `${getPreferredFilename()}_Cover_Letter`
      : getPreferredFilename();

    // Build full HTML document including styles
    let fullHtml = '';
    if (showingLetter) {
      fullHtml = renderCoverLetterHtml(coverLetter, structuredCv);
    } else if (structuredCv) {
      fullHtml = renderCvHtml(structuredCv);
    } else if (optimizedCv) {
      fullHtml = generateDownloadHtml(optimizedCv);
    }

    if (fullHtml) {

      const opt = {
        margin:       [10, 10, 10, 10],
        filename:     `${baseFilename}.pdf`,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak:    { mode: ['css', 'legacy'], avoid: ['li', '.skills-block'] }
      };

      const saveWithPicker = async (blob) => {
        if (preFetchedFolderHandle) {
          try {
            const where = await writePdfWithHandle(blob, preFetchedFolderHandle, companyName, `${baseFilename}.pdf`);
            // Each download makes its own numbered folder, so say which one — otherwise
            // the file looks missing when the user checks the folder they named.
            if (where?.folder) {
              console.log('[download] saved to %s/%s/%s', where.root, where.folder, where.filename);
              setDownloadNoticeTone('ok');
              setDownloadNotice(`Saved to ${where.root}/${where.folder}/${where.filename}`);
            }
            return true;
          } catch (err) {
            console.error('[download] writing into the chosen folder failed:', err);
            setDownloadNoticeTone('warn');
            setDownloadNotice(`Could not write into "${preFetchedFolderHandle?.name || 'the chosen folder'}" (${err?.name || 'error'}). The PDF went to your usual downloads folder instead.`);
            return false;
          }
        }
        if (filePickerBlocked || !('showSaveFilePicker' in window)) return false;
        try {
          const handle = await window.showSaveFilePicker({
            suggestedName: `${baseFilename}.pdf`,
            types: [{ description: 'PDF', accept: { 'application/pdf': ['.pdf'] } }]
          });
          const writable = await handle.createWritable();
          await writable.write(blob);
          await writable.close();
          return true;
        } catch (err) {
          // SecurityError here means PDF rendering outlived the click's transient
          // activation, which is expected for anything but a very small CV.
          if (err?.name !== 'AbortError') {
            console.warn('[download] save picker unavailable (%s), using the default download', err?.name || err);
          }
          return false;
        }
      };

      // Both documents are drawn with jsPDF text primitives, not screenshotted. html2pdf
      // is html2canvas + addImage: it produced a PDF containing JPEGs and zero extractable
      // text, so an ATS parsing it read nothing at all. Verified with poppler, mupdf and
      // pdfjs — all returned 0 characters.
      const buildTextPdf = () => {
        if (showingLetter) return coverLetter ? buildCoverLetterPdf(coverLetter, structuredCv) : null;
        return structuredCv ? buildCvPdf(structuredCv) : null;
      };

      try {
        const pdf = buildTextPdf();
        if (pdf) {
          const blob = pdf.output('blob');
          const saved = await saveWithPicker(blob);
          if (!saved) {
            console.log('[download] falling back to the browser download');
            pdf.save(`${baseFilename}.pdf`);
          }
          return;
        }
      } catch (err) {
        // Fall through to the html2pdf path rather than lose the download.
        console.error('[download] text PDF build failed, falling back to the image renderer:', err);
      }

      try {
        const pdf = await html2pdf().set(opt).from(fullHtml).toPdf().get('pdf');
        const blob = pdf.output('blob');
        const saved = await saveWithPicker(blob);
        if (!saved) {
          console.log('[download] falling back to the browser download');
          pdf.save(`${baseFilename}.pdf`);
        }
        return;
      } catch (e) {
        // Fallback to DOM container render
        const container = document.createElement('div');
        container.style.position = 'fixed';
        container.style.top = '0';
        container.style.left = '0';
        container.style.opacity = '0';
        container.style.pointerEvents = 'none';
        container.style.width = '794px';
        container.style.background = '#ffffff';
        container.innerHTML = extractBody(fullHtml);
        document.body.appendChild(container);
        try {
          // Generate blob again from container
          const pdf = await html2pdf().set(opt).from(container).toPdf().get('pdf');
          const blob = pdf.output('blob');
          const saved = await saveWithPicker(blob);
          if (!saved) {
            console.log('[download] falling back to the browser download (container)');
            pdf.save(`${baseFilename}.pdf`);
          }
        } catch (inner) {
          // Both render paths failed. Fall through to the HTML download below rather
          // than throwing out of downloadCv, which produced no file and no message.
          console.error('[download] both PDF render paths failed:', e, inner);
          setDownloadNoticeTone('warn');
          setDownloadNotice('Could not build the PDF, so an HTML copy was downloaded instead. Open it and print to PDF.');
          document.body.removeChild(container);
          const htmlOnly = structuredCv && !(coverLetter && activeDoc === 'letter')
            ? renderCvHtml(structuredCv)
            : fullHtml;
          downloadHtml(htmlOnly, `${baseFilename}.html`);
          return;
        }
        document.body.removeChild(container);
        return;
      }
    }

    // Fallback to HTML download
    if (structuredCv) {
      const html = renderCvHtml(structuredCv);
      downloadHtml(html, `${baseFilename}.html`);
      return;
    }
    const htmlFallback = generateDownloadHtml(optimizedCv);
    // Try File System Access API for HTML
    if ('showSaveFilePicker' in window) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: `${baseFilename}.html`,
          types: [{ description: 'HTML', accept: { 'text/html': ['.html'] } }]
        });
        const writable = await handle.createWritable();
        await writable.write(new Blob([htmlFallback], { type: 'text/html' }));
        await writable.close();
        return;
      } catch (err) {
        if (err?.name !== 'AbortError') {
          console.warn('[download] HTML save picker unavailable (%s), using the default download', err?.name || err);
        }
      }
    }
    downloadHtml(htmlFallback, `${baseFilename}.html`);
    } catch (err) {
      // Last resort. Without this the exception escaped downloadCv entirely: no file,
      // no message, nothing but an unhandled rejection in the console.
      console.error('[download] failed:', err);
      setDownloadNoticeTone('warn');
      setDownloadNotice('The download failed. Nothing was saved — please try again.');
    } finally {
      downloadingRef.current = false;
      setIsDownloading(false);
    }
  };


  // Copies the letter as plain text. navigator.clipboard needs a secure context and
  // permission, so fall back to a hidden textarea + execCommand rather than failing
  // silently on http origins or older browsers.
  const copyCoverLetter = async () => {
    if (!coverLetter) return;
    const done = () => {
      setLetterCopied(true);
      setTimeout(() => setLetterCopied(false), 2000);
    };

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(coverLetter);
        done();
        return;
      }
    } catch {
      // fall through to the legacy path
    }

    try {
      const scratch = document.createElement('textarea');
      scratch.value = coverLetter;
      scratch.setAttribute('readonly', '');
      scratch.style.position = 'fixed';
      scratch.style.opacity = '0';
      document.body.appendChild(scratch);
      scratch.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(scratch);
      if (ok) done();
      else setDownloadNotice('Could not copy the letter. Select the text in the preview and copy it manually.');
    } catch (err) {
      console.error('[copy] cover letter copy failed', err);
      setDownloadNotice('Could not copy the letter. Select the text in the preview and copy it manually.');
    }
  };

  const handleOptimize = async () => {
    if (!jobDescription.trim() || !aiUserInfo.trim()) {
      alert('Please provide both job description and AI input content.');
      return;
    }
    if (jobDescription.length > 10000 || aiUserInfo.length > 20000 || fixedUserInfo.length > 10000) {
      alert('Input text is too long. Please shorten your inputs.');
      return;
    }

    setIsProcessing(true);
    setOpenedFromHistory(false);
    setOptimizedCv('');
    setAnalysis(null);
    setCoverLetter('');
    setActiveDoc('cv');

    try {
      const { cvContent, cv, analysis: an, companyName: cn, coverLetter: cl, quota } = await optimizeCvService({
        jobDescription,
        aiUserInfo,
        fixedUserInfo,
        includeCoverLetter: wantsCoverLetter,
        profileId: activeProfileId && profiles[activeProfileId] ? activeProfileId : null,
        profileName: activeProfileId && profiles[activeProfileId] ? profiles[activeProfileId].name : null
      });
      if (quota) setBilling((prev) => (prev ? { ...prev, ...quota } : prev));
      setOptimizedCv(cvContent);
      setStructuredCv(cv || null);
      setAnalysis(an || null);
      if (cn) setCompanyName(cn);
      setCoverLetter(typeof cl === 'string' ? cl : '');
      if (wantsCoverLetter && !cl) {
        setDownloadNotice('The CV is ready, but the cover letter could not be written this time.');
      }

      // Collapse JD into sidebar after CV is successfully generated (desktop only)
      setJdCollapsed(true);
    } catch (error) {
      if (error.code === 'upgrade_required') {
        if (error.quota) setBilling((prev) => ({ ...(prev || {}), ...error.quota }));
        setShowPaywall(true);
        return;
      }
      recordAppError(`Optimize: ${error.message}`);
      if (error.message.includes('500')) {
        alert('Server error occurred. The OpenAI API may be temporarily unavailable. Please try again in a few moments.');
      } else if (error.message.includes('400')) {
        alert('Invalid request format. Please check your input and try again.');
      } else if (error.message.includes('401')) {
        alert('Authentication error. Please check your OpenAI API key.');
      } else if (error.message.includes('403')) {
        alert('Access forbidden. Please check your OpenAI API permissions.');
      } else if (error.message.includes('429')) {
        alert('Rate limit exceeded. Please wait a moment before trying again.');
      } else {
        alert(`An error occurred while optimizing your CV: ${error.message}`);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const paywallModal = showPaywall && (
    <PricingModal
      billing={billing}
      busy={billingBusy}
      onClose={() => setShowPaywall(false)}
      onCheckout={handleUpgrade}
      onManage={handleManageBilling}
    />
  );

  const tipsModal = showTips && (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={() => setShowTips(false)}></div>
      <div className="relative bg-white text-ink w-full max-w-2xl mx-4 rounded-2xl shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-line">
          <h3 className="text-lg font-extrabold text-ink">Optimization Tips</h3>
          <button
            type="button"
            onClick={() => setShowTips(false)}
            className="text-ink-muted hover:text-ink"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          <ul className="list-disc pl-6 text-ink text-sm space-y-1">
            <li>Use the complete job posting, including requirements and preferred qualifications.</li>
            <li>Provide detailed CV content with specific achievements and metrics.</li>
            <li>Review the optimized CV to ensure it accurately represents your experience.</li>
            <li>The downloaded PDF contains real text, so keep it as-is rather than printing it to a new file.</li>
            <li>Customize further based on your specific industry and role.</li>
          </ul>
        </div>
        <div className="px-6 py-4 border-t border-line bg-blush text-right">
          <button
            type="button"
            onClick={() => setShowTips(false)}
            className="px-4 py-2 rounded-lg bg-ink text-white text-sm hover:bg-[#3A2630]"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );

  // Password accounts verify their email before they get the app. The server refuses their
  // tokens until then, so nothing behind this would work anyway.
  if (awaitingVerification) {
    return (
      <div className="font-brand min-h-screen flex flex-col items-center justify-center px-4 py-10" style={{ backgroundColor: '#24131C' }}>
        <img src="/roleberry-logo-dark.svg" alt="Roleberry" className="h-9 w-auto mb-8" />
        <div className="mx-auto w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl shadow-black/30 ring-1 ring-black/5 sm:p-8">
          <VerifyEmail
            user={user}
            onVerified={() => setAuthTick((n) => n + 1)}
            onSignedOut={() => setUser(null)}
          />
        </div>
      </div>
    );
  }

  // Comped accounts have nothing to manage, unless they also still pay for a subscription they may want to cancel.
  const canManageSubscription = (billing?.plan === 'paid' || billing?.plan === 'max') && billing.hasCustomer
    && (!billing.comped || (billing.billingPlan && billing.billingPlan !== 'free'));
  const profileSwitcherEl = (
    <ProfileSwitcher
      tone="dark"
      locked={!profilesUnlocked}
      upsell={billing?.plan === 'free'}
      profiles={profiles}
      activeProfileId={activeProfileId}
      limit={billing?.unlimitedProfiles ? null : profileLimit}
      busy={profileBusy}
      onLocked={() => setShowPaywall(true)}
      onSwitch={handleSwitchProfile}
      onSaveAs={handleSaveProfileAs}
      onRename={handleRenameProfile}
      onDelete={handleDeleteProfile}
    />
  );
  const accountEl = (
    <Auth user={user} onAuthChange={setUser} onToggleTheme={() => setIsDark(v => !v)} isDark={isDark} folderMgmtEnabled={folderMgmtEnabled} onToggleFolderMgmt={handleToggleFolderMgmt} onManageSubscription={canManageSubscription ? handleManageBilling : undefined} manageBusy={billingBusy} />
  );
  const planStripEl = (
    <PlanStrip
      billing={billing}
      billingNotice={billingNotice}
      onUpgrade={() => setShowPaywall(true)}
      onPlans={() => setShowPaywall(true)}
    />
  );
  const pageRootCls = 'font-brand min-h-screen flex flex-col bg-white text-ink dark:bg-night dark:text-night-text';

  if (user && currentPage === 'history') {
    return (
      <div className={pageRootCls}>
        <TopBar page="history" onNavigate={setCurrentPage} onTips={() => setShowTips(true)} profileSwitcher={profileSwitcherEl} account={accountEl} />
        {planStripEl}
        <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 py-8">
          <HistoryPage
            onBack={() => setCurrentPage('main')}
            onOpenRun={handleOpenRun}
            onUpgrade={() => setShowPaywall(true)}
          />
        </div>
        {tipsModal}{paywallModal}
      </div>
    );
  }

  // Show setup page
  if (currentPage === 'setup') {
    const sectionState = (id) => {
      switch (id) {
        case 'import':
          return { count: null, done: Boolean(formData.name.trim()) };
        case 'personal':
          return {
            count: [formData.name, formData.email, formData.phone, formData.location, formData.yearsOfExperience].filter(v => String(v).trim()).length,
            done: Boolean(formData.name.trim() && formData.email.trim())
          };
        case 'links': {
          const n = formData.links.filter(l => l.trim()).length;
          return { count: n, done: n > 0 };
        }
        case 'skills': {
          const n = formData.skills.filter(s => s.category.trim() && s.items.some(i => i.trim())).length;
          return { count: n, done: n > 0 };
        }
        case 'experience': {
          const n = formData.experience.filter(e => e.title.trim()).length;
          return { count: n, done: n > 0 };
        }
        case 'education': {
          const n = formData.education.filter(e => e.trim()).length;
          return { count: n, done: n > 0 };
        }
        case 'certifications': {
          const n = formData.certifications.filter(c => c.trim()).length;
          return { count: n, done: n > 0 };
        }
        default:
          return { count: null, done: false };
      }
    };

    const completed = SETUP_SECTIONS.filter(s => sectionState(s.id).done).length;
    const progressPct = Math.round((completed / SETUP_SECTIONS.length) * 100);

    const scrollToSection = (id) => {
      const node = sectionRefs.current[id];
      if (node) node.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    const addSkillToken = (skillIndex) => {
      const raw = (skillDrafts[skillIndex] || '').trim();
      if (!raw) return;
      const newSkills = formData.skills.map((s, i) => (
        i === skillIndex
          ? { ...s, items: [...s.items.filter(x => x.trim()), ...raw.split(',').map(x => x.trim()).filter(Boolean)] }
          : s
      ));
      setFormData(prev => ({ ...prev, skills: newSkills }));
      setSkillDrafts(prev => ({ ...prev, [skillIndex]: '' }));
    };

    const removeSkillToken = (skillIndex, itemIndex) => {
      const newSkills = formData.skills.map((s, i) => (
        i === skillIndex ? { ...s, items: s.items.filter((_, j) => j !== itemIndex) } : s
      ));
      setFormData(prev => ({ ...prev, skills: newSkills }));
    };

    const toggleRecord = (setter, key) => setter(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });

    return (
      <div className={pageRootCls}>
        <TopBar page="setup" onNavigate={setCurrentPage} onTips={() => setShowTips(true)} profileSwitcher={profileSwitcherEl} account={accountEl} />

        <div className="flex flex-1">
          {/* Section rail */}
          <aside className="hidden lg:block w-[280px] shrink-0 border-r border-line bg-blush px-4 py-7 dark:bg-night-surface dark:border-night-line">
            <div className="sticky top-6">
              <nav aria-label="Profile sections" className="space-y-0.5">
                <div className="px-3 pb-3 text-[11px] font-bold tracking-[0.08em] text-ink-faint">SECTIONS</div>
                {SETUP_SECTIONS.map((s) => {
                  const state = sectionState(s.id);
                  const active = activeSection === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => scrollToSection(s.id)}
                      className={`w-full flex items-center gap-2.5 h-[38px] px-3 rounded-[10px] text-sm font-semibold text-left ${
                        active
                          ? 'bg-white text-ink shadow-[0_1px_2px_rgba(36,19,28,0.08)] dark:bg-night-raised dark:text-night-text'
                          : 'text-ink-muted hover:bg-hover hover:text-ink dark:text-night-muted'
                      }`}
                    >
                      <span
                        className={`h-2 w-2 rounded-full shrink-0 ${
                          state.done ? 'bg-leaf' : 'bg-[#D9C9D0] dark:bg-night-line'
                        }`}
                      />
                      <span className="flex-1 text-left truncate">{s.label}</span>
                      {state.count !== null && state.count > 0 && (
                        <span className="text-xs tabular-nums text-ink-faint">{state.count}</span>
                      )}
                    </button>
                  );
                })}
              </nav>

              <div className="mt-5 mx-3 pt-5 border-t border-line dark:border-night-line">
                <div className="h-1.5 w-full rounded-full bg-line dark:bg-night-line overflow-hidden">
                  <div className="h-full bg-leaf transition-all duration-500" style={{ width: `${progressPct}%` }} />
                </div>
                <div className="mt-2 flex justify-between text-xs text-ink-muted dark:text-night-muted">
                  <span>{completed} of {SETUP_SECTIONS.length} complete</span>
                  <span className="tabular-nums">{progressPct}%</span>
                </div>
                <button
                  type="button"
                  onClick={async () => { await saveUserInfo(); setCurrentPage('main'); }}
                  disabled={isSaving || !isValidFormData()}
                  className="mt-4 w-full h-[46px] rounded-xl bg-berry text-white text-[14.5px] font-bold hover:bg-berry-dark disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
                >
                  {isSaving ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      Save and continue
                    </>
                  )}
                </button>
                {!isValidFormData() && (
                  <p className="mt-2 text-[11.5px] text-ink-muted dark:text-night-muted leading-snug">
                    Needs a name, one skill group and one role before it can be saved.
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => setCurrentPage('main')}
                  className="mt-2 w-full h-10 text-[13.5px] font-semibold text-ink-muted hover:text-ink"
                >
                  Back to the app
                </button>
              </div>
            </div>
          </aside>

          {/* Canvas */}
          <div className="flex-1 min-w-0 max-w-[1080px] px-4 sm:px-10 pt-8 pb-24 space-y-8">
            <div>
              <h1 className="text-[28px] font-extrabold tracking-tight">Your info</h1>
              <p className="mt-1.5 text-[14.5px] text-ink-muted dark:text-night-muted">
                The raw material every tailored CV is built from.
                {activeProfileId && profiles?.[activeProfileId] && (
                  <> You are editing the <b className="text-ink dark:text-night-text">{profiles[activeProfileId].name}</b> profile.</>
                )}
              </p>
            </div>
              {/* Import */}
              <section id="import" ref={(el) => { sectionRefs.current.import = el; }} className="scroll-mt-6">
                <SectionHead icon={Upload} title="Import" hint="Fastest way to fill this in. We read the PDF and populate every section below." />
                <div className="rounded-2xl border-[1.5px] border-dashed border-berry-line bg-berry-soft p-5 dark:bg-berry/10">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                    <label className="cursor-pointer shrink-0">
                      <input type="file" accept=".pdf" onChange={handlePdfUpload} disabled={isProcessingPdf} className="hidden" />
                      <span className={`inline-flex items-center gap-2 h-11 px-[18px] rounded-[11px] text-sm font-bold text-white ${
                        isProcessingPdf ? 'bg-ink-faint cursor-not-allowed' : 'bg-berry hover:bg-berry-dark'
                      }`}>
                        {isProcessingPdf ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                            {ocrStatus || 'Reading your CV...'}
                          </>
                        ) : (
                          <>
                            <Upload className="h-4 w-4" />
                            Upload CV (PDF)
                          </>
                        )}
                      </span>
                    </label>
                    <p className="text-[13.5px] text-ink-muted dark:text-night-muted">
                      Or fill everything in by hand below. PDFs up to 10MB, including scans.
                    </p>
                  </div>
                  {pdfError && (
                    <div className="mt-3 flex items-start gap-2 text-xs bg-danger-bg border border-danger-line text-danger-text rounded-lg p-2.5">
                      <AlertCircle className="h-4 w-4 mt-px shrink-0" />
                      <span>{pdfError}</span>
                      <button
                        type="button"
                        onClick={() => openFeedback({ type: 'bug', message: `Importing my CV failed: ${pdfError}` })}
                        className="ml-auto shrink-0 underline hover:no-underline"
                      >
                        Report this problem
                      </button>
                    </div>
                  )}
                </div>
              </section>

              {/* Personal */}
              <section id="personal" ref={(el) => { sectionRefs.current.personal = el; }} className="scroll-mt-6">
                <SectionHead icon={User} title="Personal" hint="Printed at the top of every CV. Never sent to the model except your years of experience." />
                <div className={`${cardCls} p-4 sm:p-5`}>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className={labelCls}>Full name</label>
                      <input type="text" value={formData.name} onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))} className={inputCls} placeholder="Jane Doe" />
                    </div>
                    <div>
                      <label className={labelCls}>Email</label>
                      <input type="email" value={formData.email} onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))} className={inputCls} placeholder="jane@example.com" />
                    </div>
                    <div>
                      <label className={labelCls}>Phone</label>
                      <input type="tel" value={formData.phone} onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))} className={inputCls} placeholder="+1 555 123 4567" />
                    </div>
                    <div>
                      <label className={labelCls}>Location</label>
                      <input type="text" value={formData.location} onChange={(e) => setFormData(prev => ({ ...prev, location: e.target.value }))} className={inputCls} placeholder="Berlin, Germany" />
                    </div>
                    <div className="sm:col-span-2">
                      <label className={labelCls}>
                        Total years of experience
                        <span className="ml-2 font-normal text-ink-faint dark:text-night-muted">Calculated from your roles below. Override it here if it is wrong.</span>
                      </label>
                      <input type="number" min="0" step="0.5" value={formData.yearsOfExperience} onChange={(e) => setFormData(prev => ({ ...prev, yearsOfExperience: e.target.value }))} className={`${inputCls} sm:max-w-[10rem]`} placeholder="8" />
                    </div>
                  </div>
                </div>
              </section>

              {/* Links */}
              <section id="links" ref={(el) => { sectionRefs.current.links = el; }} className="scroll-mt-6">
                <SectionHead icon={Link2} title="Links" hint="LinkedIn, GitHub, a portfolio. Printed under your contact line." />
                <SimpleList
                  values={formData.links}
                  type="url"
                  placeholder="https://linkedin.com/in/yourprofile"
                  addLabel="Add link"
                  onChange={(i, v) => setFormData(prev => ({ ...prev, links: prev.links.map((l, j) => (j === i ? v : l)) }))}
                  onAdd={() => setFormData(prev => ({ ...prev, links: [...prev.links, ''] }))}
                  onRemove={(i) => setFormData(prev => ({ ...prev, links: prev.links.filter((_, j) => j !== i) }))}
                />
              </section>

              {/* Skills */}
              <section id="skills" ref={(el) => { sectionRefs.current.skills = el; }} className="scroll-mt-6">
                <SectionHead
                  icon={Zap}
                  title="Skills"
                  hint="Grouped the way you want them printed. Type a skill and press Enter, or paste a comma-separated list."
                  actions={
                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, skills: [...prev.skills, { category: '', items: [] }] }))}
                      className={addBtnCls}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add group
                    </button>
                  }
                />
                <div className={cardCls}>
                  <div className="divide-y divide-line dark:divide-night-line">
                    {formData.skills.map((skill, skillIndex) => {
                      const open = !collapsedSkills.has(skillIndex);
                      const liveItems = skill.items.filter(i => i.trim());
                      return (
                        <article key={skillIndex} className="flex">
                          <div className="w-10 shrink-0 pt-4 text-center">
                            <span className="text-xs tabular-nums text-ink-faint dark:text-night-muted">{skillIndex + 1}</span>
                          </div>
                          <div className="flex-1 min-w-0 p-4 pl-0 pr-4">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => toggleRecord(setCollapsedSkills, skillIndex)}
                                className="p-1 -ml-1 rounded text-ink-faint hover:text-ink dark:hover:text-night-text shrink-0"
                                aria-expanded={open}
                                aria-label={open ? 'Collapse group' : 'Expand group'}
                              >
                                <ChevronRight className={`h-4 w-4 transition-transform ${open ? 'rotate-90' : ''}`} />
                              </button>
                              <input
                                type="text"
                                value={skill.category}
                                onChange={(e) => {
                                  const newSkills = formData.skills.map((s, i) => (i === skillIndex ? { ...s, category: e.target.value } : s));
                                  setFormData(prev => ({ ...prev, skills: newSkills }));
                                }}
                                className="flex-1 min-w-0 bg-transparent border-0 border-b border-transparent hover:border-line focus:border-berry-line focus:outline-none text-sm font-semibold text-ink dark:text-night-text placeholder:text-ink-faint py-1"
                                placeholder="Group name, e.g. Cloud & Infrastructure"
                                aria-label="Category name"
                              />
                              <span className="text-xs text-ink-faint dark:text-night-muted shrink-0 tabular-nums">{liveItems.length} skills</span>
                              {formData.skills.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setFormData(prev => ({ ...prev, skills: prev.skills.filter((_, i) => i !== skillIndex) }));
                                    setCollapsedSkills(new Set());
                                  }}
                                  className="shrink-0 p-1.5 rounded-lg text-ink-faint hover:text-danger-text hover:bg-danger-bg transition-colors"
                                  aria-label="Remove group"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              )}
                            </div>

                            {open && (
                              <div className="mt-3 ml-6 pl-3 border-l-2 border-berry-soft">
                                <div className="flex flex-wrap gap-1.5 items-center">
                                  {skill.items.map((item, itemIndex) => (
                                    item.trim() ? (
                                      <span key={itemIndex} className="inline-flex items-center gap-1 pl-3 pr-1 h-[30px] rounded-full bg-berry-soft text-berry-dark text-[13px] font-semibold">
                                        {item}
                                        <button
                                          type="button"
                                          onClick={() => removeSkillToken(skillIndex, itemIndex)}
                                          className="p-0.5 rounded-full hover:bg-[#F6D3DF] transition-colors"
                                          aria-label={`Remove ${item}`}
                                        >
                                          <X className="h-3 w-3" />
                                        </button>
                                      </span>
                                    ) : null
                                  ))}
                                  <input
                                    type="text"
                                    value={skillDrafts[skillIndex] || ''}
                                    onChange={(e) => setSkillDrafts(prev => ({ ...prev, [skillIndex]: e.target.value }))}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addSkillToken(skillIndex); }
                                      if (e.key === 'Backspace' && !(skillDrafts[skillIndex] || '') && liveItems.length) {
                                        removeSkillToken(skillIndex, skill.items.length - 1);
                                      }
                                    }}
                                    onBlur={() => addSkillToken(skillIndex)}
                                    className="flex-1 min-w-[8rem] bg-transparent border-0 focus:outline-none text-sm text-ink dark:text-night-text placeholder:text-ink-faint dark:placeholder:text-night-muted py-1"
                                    placeholder={liveItems.length ? 'Add another…' : 'Type a skill and press Enter'}
                                    aria-label={`Add skill to ${skill.category || 'group'}`}
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </div>
              </section>

              {/* Experience */}
              <section id="experience" ref={(el) => { sectionRefs.current.experience = el; }} className="scroll-mt-6">
                <SectionHead
                  icon={Briefcase}
                  title="Experience"
                  hint="Write what you actually did. Each tailored CV re-angles these toward the job, it never invents new ones."
                  actions={
                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({
                        ...prev,
                        experience: [...prev.experience, { roleId: '', title: '', company: '', location: '', start: '', end: '', achievements: [''] }]
                      }))}
                      className={addBtnCls}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add role
                    </button>
                  }
                />
                <div className={cardCls}>
                  <div className="divide-y divide-line dark:divide-night-line">
                    {formData.experience.map((exp, expIndex) => {
                      const open = !collapsedRoles.has(expIndex);
                      const achievementCount = exp.achievements.filter(a => a.trim()).length;
                      const dates = [exp.start, exp.end].filter(Boolean).join(' – ');
                      const setExp = (patch) => setFormData(prev => ({
                        ...prev,
                        experience: prev.experience.map((e, i) => (i === expIndex ? { ...e, ...patch } : e))
                      }));
                      return (
                        <article key={expIndex} className="flex">
                          <div className="w-10 shrink-0 pt-4 text-center">
                            <span className="text-xs tabular-nums text-ink-faint dark:text-night-muted">{expIndex + 1}</span>
                          </div>
                          <div className="flex-1 min-w-0 p-4 pl-0 pr-4">
                            <div className="flex items-start gap-2">
                              <button
                                type="button"
                                onClick={() => toggleRecord(setCollapsedRoles, expIndex)}
                                className="p-1 -ml-1 mt-0.5 rounded text-ink-faint hover:text-ink dark:hover:text-night-text shrink-0"
                                aria-expanded={open}
                                aria-label={open ? 'Collapse role' : 'Expand role'}
                              >
                                <ChevronRight className={`h-4 w-4 transition-transform ${open ? 'rotate-90' : ''}`} />
                              </button>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-semibold text-ink dark:text-night-text truncate">
                                  {exp.title || <span className="text-ink-faint font-normal">Untitled role</span>}
                                </div>
                                <div className="text-xs text-ink-muted dark:text-night-muted truncate">
                                  {[exp.company, exp.location].filter(Boolean).join(' · ') || 'No company yet'}
                                </div>
                              </div>
                              <span className="hidden sm:block text-xs text-ink-faint dark:text-night-muted shrink-0 text-right">
                                {dates && <span className="tabular-nums">{dates}</span>}
                                {dates && achievementCount > 0 && <span> · </span>}
                                {achievementCount > 0 && <span>{achievementCount} achievements</span>}
                              </span>
                              {formData.experience.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setFormData(prev => ({ ...prev, experience: prev.experience.filter((_, i) => i !== expIndex) }));
                                    setCollapsedRoles(new Set());
                                  }}
                                  className="shrink-0 p-1.5 rounded-lg text-ink-faint hover:text-danger-text hover:bg-danger-bg transition-colors"
                                  aria-label="Remove role"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              )}
                            </div>

                            {open && (
                              <div className="mt-4 ml-6 pl-3 border-l-2 border-berry-soft space-y-4">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                  <div>
                                    <label className={labelCls}>Job title</label>
                                    <input type="text" value={exp.title} onChange={(e) => setExp({ title: e.target.value })} className={inputCls} placeholder="Senior Platform Engineer" />
                                  </div>
                                  <div>
                                    <label className={labelCls}>Company</label>
                                    <input type="text" value={exp.company} onChange={(e) => setExp({ company: e.target.value })} className={inputCls} placeholder="Northwind Data" />
                                  </div>
                                  <div>
                                    <label className={labelCls}>Location</label>
                                    <input type="text" value={exp.location} onChange={(e) => setExp({ location: e.target.value })} className={inputCls} placeholder="Berlin, Germany" />
                                  </div>
                                  <div>
                                    <label className={labelCls}>Dates</label>
                                    <div className="flex items-center gap-2">
                                      <input type="text" value={exp.start} onChange={(e) => setExp({ start: e.target.value })} className={inputCls} placeholder="2021-03" />
                                      <span className="text-xs text-ink-faint shrink-0">to</span>
                                      <input type="text" value={exp.end} onChange={(e) => setExp({ end: e.target.value })} className={inputCls} placeholder="Present" />
                                    </div>
                                  </div>
                                </div>

                                <div>
                                  <div className={labelCls}>Key achievements</div>
                                  <div className="space-y-2">
                                    {exp.achievements.map((achievement, achIndex) => (
                                      <div key={achIndex} className="flex items-start gap-2">
                                        <span className="mt-3 h-1 w-1 rounded-full bg-line dark:bg-night-line shrink-0" />
                                        <textarea
                                          value={achievement}
                                          onChange={(e) => setExp({ achievements: exp.achievements.map((a, j) => (j === achIndex ? e.target.value : a)) })}
                                          rows="2"
                                          className={`${inputCls} resize-y`}
                                          placeholder="Cut deploy time from 45 minutes to 12 by rebuilding the pipeline"
                                        />
                                        {exp.achievements.length > 1 && (
                                          <button
                                            type="button"
                                            onClick={() => setExp({ achievements: exp.achievements.filter((_, j) => j !== achIndex) })}
                                            className="shrink-0 mt-1 p-2 rounded-lg text-ink-faint hover:text-danger-text hover:bg-danger-bg transition-colors"
                                            aria-label="Remove achievement"
                                          >
                                            <Trash2 className="h-4 w-4" />
                                          </button>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => setExp({ achievements: [...exp.achievements, ''] })}
                                    className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1.5 text-sm text-berry font-bold hover:text-berry-dark rounded-lg"
                                  >
                                    <Plus className="h-4 w-4" />
                                    Add achievement
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </div>
              </section>

              {/* Education */}
              <section id="education" ref={(el) => { sectionRefs.current.education = el; }} className="scroll-mt-6">
                <SectionHead icon={GraduationCap} title="Education" hint="One line each, exactly as you want it printed." />
                <SimpleList
                  values={formData.education}
                  placeholder="BSc Computer Science, TU Berlin (2016)"
                  addLabel="Add education"
                  onChange={(i, v) => setFormData(prev => ({ ...prev, education: prev.education.map((e, j) => (j === i ? v : e)) }))}
                  onAdd={() => setFormData(prev => ({ ...prev, education: [...prev.education, ''] }))}
                  onRemove={(i) => setFormData(prev => ({ ...prev, education: prev.education.filter((_, j) => j !== i) }))}
                />
              </section>

              {/* Certifications */}
              <section id="certifications" ref={(el) => { sectionRefs.current.certifications = el; }} className="scroll-mt-6">
                <SectionHead icon={Award} title="Certifications" hint="Optional. Printed as a single line under Core Skills." />
                <SimpleList
                  values={formData.certifications}
                  placeholder="AWS Certified Solutions Architect"
                  addLabel="Add certification"
                  onChange={(i, v) => setFormData(prev => ({ ...prev, certifications: prev.certifications.map((c, j) => (j === i ? v : c)) }))}
                  onAdd={() => setFormData(prev => ({ ...prev, certifications: [...prev.certifications, ''] }))}
                  onRemove={(i) => setFormData(prev => ({ ...prev, certifications: prev.certifications.filter((_, j) => j !== i) }))}
                />
              </section>

              {/* Mobile save bar (the rail is hidden below lg) */}
              <div className="lg:hidden sticky bottom-4 z-10">
                <div className="rounded-2xl border border-line bg-white/95 dark:bg-night-raised/95 dark:border-night-line backdrop-blur p-3 shadow-lg">
                  <div className="mb-2 h-1.5 w-full rounded-full bg-line dark:bg-night-line overflow-hidden">
                    <div className="h-full bg-leaf transition-all duration-500" style={{ width: `${progressPct}%` }} />
                  </div>
                  <button
                    type="button"
                    onClick={async () => { await saveUserInfo(); setCurrentPage('main'); }}
                    disabled={isSaving || !isValidFormData()}
                    className="w-full h-11 rounded-xl bg-berry text-white text-sm font-bold hover:bg-berry-dark disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
                  >
                    {isSaving ? 'Saving...' : <><Save className="h-4 w-4" /> Save &amp; Continue</>}
                  </button>
                </div>
              </div>
            </div>
          </div>
        {tipsModal}{paywallModal}
      </div>
    );
  }

  // Signed-out: the landing page, or the sign-in / sign-up page on /login and /signup
  if (!user) {
    const authMode = AUTH_PATHS[currentPath()];
    if (authMode) return <LoginPage mode={authMode} onAuthChange={setUser} />;
    return <Landing />;
  }


  return (
    <div className={pageRootCls}>
      <TopBar page="main" onNavigate={setCurrentPage} onTips={() => setShowTips(true)} profileSwitcher={profileSwitcherEl} account={accountEl} />
      {planStripEl}

      <main className={`relative flex-1 grid grid-cols-1 ${jdCollapsed ? 'lg:grid-cols-1' : 'lg:grid-cols-[minmax(420px,1fr)_1.25fr]'}`}>
        {needsSetup && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80 backdrop-blur-[1px] dark:bg-night/80">
            <div className="max-w-sm rounded-2xl border border-line bg-white p-6 text-center shadow-xl dark:bg-night-raised dark:border-night-line">
              <h2 className="text-lg font-extrabold">Set up your info first</h2>
              <p className="mt-1.5 text-sm text-ink-muted dark:text-night-muted">Add your experience once. Every tailored CV is built from it.</p>
              <button
                type="button"
                onClick={() => setCurrentPage('setup')}
                className="mt-4 h-11 px-5 rounded-xl bg-berry text-white font-bold hover:bg-berry-dark"
              >
                Set up your info
              </button>
            </div>
          </div>
        )}

        {/* Left column: job posting */}
        <section aria-label="Job posting" className={`flex flex-col gap-3.5 p-4 sm:p-6 pb-20 lg:border-r border-line dark:border-night-line dark:bg-night-surface ${jdCollapsed ? 'lg:hidden' : ''}`}>
          <div className="flex items-baseline gap-2.5 flex-wrap">
            <label htmlFor="jd-input" className="text-[17px] font-extrabold tracking-tight">Job posting</label>
            <span className="text-[13px] text-ink-muted dark:text-night-muted">Paste the whole thing, requirements included</span>
            <div className="flex-1" />
            {jobDescription && (
              <button
                type="button"
                onClick={() => setJobDescription('')}
                className="text-[13px] font-semibold text-ink-muted hover:text-ink"
              >
                Clear
              </button>
            )}
          </div>
          <textarea
            id="jd-input"
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
            placeholder="Paste a job posting here"
            className="w-full flex-1 min-h-[420px] resize-none rounded-xl border border-line bg-white px-[18px] py-4 text-sm leading-relaxed text-ink placeholder:text-ink-faint focus:border-berry focus:ring-4 focus:ring-berry/15 focus:outline-none dark:bg-night-raised dark:border-night-line dark:text-night-text"
          />

          {/* Cover letter switch, welded to the top edge of the action so the two
              read as one block: this modifies the thing you are about to press. */}
          <div className="mt-auto overflow-hidden rounded-xl border border-line dark:border-night-line">
            <button
              type="button"
              role="switch"
              aria-checked={wantsCoverLetter}
              onClick={() => {
                const next = !wantsCoverLetter;
                setWantsCoverLetter(next);
                localStorage.setItem('wantsCoverLetter', next ? 'true' : 'false');
              }}
              className={`w-full flex items-center justify-between px-4 py-3 text-sm font-semibold ${
                wantsCoverLetter
                  ? 'bg-berry-soft text-ink dark:bg-berry/20 dark:text-night-text'
                  : 'bg-blush text-ink-muted dark:bg-night-raised dark:text-night-muted'
              }`}
            >
              <span>Also write a cover letter</span>
              <span className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                wantsCoverLetter ? 'bg-berry' : 'bg-line'
              }`}>
                <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                  wantsCoverLetter ? 'translate-x-5' : 'translate-x-1'
                }`} />
              </span>
            </button>
            <button
              onClick={handleOptimize}
              disabled={isProcessing}
              className="w-full h-[52px] inline-flex items-center justify-center gap-2 bg-berry text-white text-[15px] font-bold hover:bg-berry-dark disabled:opacity-60"
            >
              {isProcessing ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                  Optimizing...
                </>
              ) : (
                <>
                  <Zap className="h-5 w-5" />
                  Optimize CV
                  {wantsCoverLetter && (
                    <span className="ml-1 text-xs font-medium px-2 py-0.5 rounded-full bg-white/20">+ cover letter</span>
                  )}
                </>
              )}
            </button>
          </div>
        </section>

        {/* Right column: result */}
        <section aria-label="Result" className="flex flex-col gap-3.5 p-4 sm:p-6 pb-20 bg-paper dark:bg-night">
          <div className="flex flex-wrap items-center gap-2.5">
            {openedFromHistory && (
              <button
                type="button"
                onClick={() => setCurrentPage('history')}
                className="h-[30px] px-3 rounded-lg text-[13px] font-semibold border border-line text-ink hover:bg-hover dark:border-night-line dark:text-night-text dark:hover:bg-night-surface inline-flex items-center gap-1.5"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to history
              </button>
            )}
            {coverLetter ? (
              <div role="tablist" aria-label="Document" className="inline-flex p-[3px] rounded-[10px] bg-[#EADDE2] dark:bg-night-raised">
                {[['cv', 'CV'], ['letter', 'Cover letter']].map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={activeDoc === id}
                    onClick={() => setActiveDoc(id)}
                    className={`h-[30px] px-3.5 rounded-lg text-[13px] whitespace-nowrap ${
                      activeDoc === id
                        ? 'bg-white text-ink font-bold shadow-sm'
                        : 'text-ink-muted font-semibold dark:text-night-muted'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : (
              <h2 className="text-[15px] font-extrabold">CV preview</h2>
            )}
            <div className="flex-1" />
            {folderMgmtEnabled && (optimizedCv || structuredCv) && (
              <label className="inline-flex items-center gap-1.5 h-[34px] px-2.5 rounded-[9px] border border-line bg-white text-ink-muted dark:bg-night-raised dark:border-night-line dark:text-night-text dark:hover:bg-night-surface">
                <FolderOpen className="h-4 w-4" />
                <input
                  type="text"
                  aria-label="Company folder"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Company name"
                  className="w-[150px] border-0 bg-transparent text-[13px] font-semibold text-ink outline-none dark:text-night-text"
                />
              </label>
            )}
            {/* Cover letters get pasted into a form or an email far more often than
                they get attached, so copying is worth reaching from either tab. */}
            {coverLetter && (
              <button
                type="button"
                onClick={() => copyCoverLetter()}
                title="Copy the cover letter text to the clipboard"
                className={`inline-flex items-center gap-1.5 h-[34px] px-3 rounded-[9px] border text-[13px] font-semibold ${
                  letterCopied
                    ? 'bg-leaf-soft text-leaf-text border-[#CFE7D8]'
                    : 'border-line bg-white text-ink hover:bg-blush dark:bg-night-raised dark:border-night-line dark:text-night-text dark:hover:bg-night-surface'
                }`}
                aria-live="polite"
              >
                {letterCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {letterCopied ? 'Copied' : 'Copy cover letter'}
              </button>
            )}
          </div>

          <div id="cv-preview" className="flex-1 min-h-[560px] overflow-auto rounded-[10px] bg-white shadow-[0_1px_2px_rgba(36,19,28,0.08),0_12px_32px_rgba(36,19,28,0.10)] dark:bg-night-surface">
            {coverLetter && activeDoc === 'letter' ? (
              <iframe
                title="Cover Letter Preview"
                style={{ width: '100%', height: '100%', minHeight: '560px', border: '0' }}
                srcDoc={renderCoverLetterHtml(coverLetter, structuredCv)}
              />
            ) : structuredCv ? (
              <iframe
                title="CV Preview"
                style={{ width: '100%', height: '100%', minHeight: '560px', border: '0' }}
                srcDoc={renderCvHtml(structuredCv)}
              />
            ) : optimizedCv ? (
              <div className="p-4 prose prose-sm max-w-none min-h-[40vh]" dangerouslySetInnerHTML={{ __html: convertMarkdownToHtml(optimizedCv) }} />
            ) : (
              <div className="flex h-full min-h-[560px] flex-col items-center justify-center gap-2 p-8 text-center">
                <FileText className="h-7 w-7 text-ink-faint" />
                <p className="text-[15px] font-bold text-ink dark:text-night-text">Your tailored CV appears here</p>
                <p className="text-[13.5px] text-ink-muted dark:text-night-muted">Paste a job posting on the left and press Optimize CV.</p>
              </div>
            )}
          </div>

          {(optimizedCv || analysis) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={downloadCv}
                disabled={!optimizedCv || isDownloading}
                className="h-12 rounded-xl bg-ink text-white text-[14.5px] font-bold hover:bg-[#3A2630] dark:bg-white dark:text-ink inline-flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Download className="h-4 w-4" />
                {isDownloading
                  ? 'Downloading...'
                  : (coverLetter && activeDoc === 'letter' ? 'Download cover letter' : 'Download PDF')}
              </button>
              {analysis && (
                <button
                  type="button"
                  onClick={() => setShowAnalysis(true)}
                  className={`h-12 rounded-xl border font-bold inline-flex items-center justify-center gap-2 ${
                    hasUnsupported
                      ? 'border-warn-line bg-warn-bg text-warn-text'
                      : 'border-line bg-white text-ink hover:bg-blush dark:bg-night-raised dark:border-night-line dark:text-night-text dark:hover:bg-night-surface'
                  }`}
                  aria-label={hasUnsupported ? 'View Analysis (check before sending)' : 'View Analysis'}
                  title={hasUnsupported ? 'Check before sending: open analysis' : 'View analysis'}
                >
                  {hasUnsupported ? <Info className="h-4 w-4" /> : <BarChart3 className="h-4 w-4" />}
                  {hasUnsupported ? 'Check before sending' : 'View Analysis'}
                </button>
              )}
            </div>
          )}

          {downloadNotice && (
            <div className={`flex items-start gap-2 text-sm px-3 py-2 rounded-lg border ${
              downloadNoticeTone === 'ok'
                ? 'bg-leaf-soft border-[#CFE7D8] text-leaf-text'
                : 'bg-warn-bg border-warn-line text-warn-text'
            }`}>
              {downloadNoticeTone === 'ok'
                ? <Check className="h-4 w-4 mt-0.5 shrink-0" />
                : <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />}
              <span className="flex-1 break-all">{downloadNotice}</span>
              <button
                type="button"
                onClick={() => setDownloadNotice('')}
                className="shrink-0 opacity-70 hover:opacity-100"
                aria-label="Dismiss"
              >
                ✕
              </button>
            </div>
          )}
        </section>
      </main>

      {showAnalysis && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowAnalysis(false)}></div>
          <div className="relative bg-white text-ink w-full max-w-3xl mx-4 rounded-2xl shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-line">
              <h3 className="text-lg font-extrabold text-ink">Result Analysis</h3>
              <button
                type="button"
                onClick={() => setShowAnalysis(false)}
                className="text-ink-muted hover:text-ink"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
              {hasUnsupported && (
                <div className="p-3 rounded-lg bg-warn-bg border border-warn-line text-warn-text text-sm space-y-2">
                  <p>Not found in your profile. Make sure you can back these up before sending:</p>
                  <div className="flex flex-wrap gap-2">
                    {analysis.unsupported.map((term) => (
                      <span key={term} className="bg-warn-bg text-warn-text border border-warn-line px-3 py-1 rounded-full text-sm font-medium">
                        {term}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {analysis && (
                <div>
                  <h4 className="text-base font-bold text-ink mb-2">Job keyword match</h4>
                  {analysis.total === 0 ? (
                    <p className="text-sm text-ink-muted">Couldn't read key requirements from this job description.</p>
                  ) : (
                    <>
                      <p className="text-lg font-extrabold text-ink mb-3">
                        Matches {analysis.matched.length} of {analysis.total} key requirements ({Math.round((analysis.coverage ?? 0) * 100)}%)
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {analysis.matched.map((term) => (
                          <span key={term} className="bg-berry-soft text-berry-dark px-3 py-1 rounded-full text-sm font-medium">
                            {term}
                          </span>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}

              {analysis && analysis.missing.length > 0 && (
                <div>
                  <h4 className="text-base font-bold text-ink mb-2">Missing from this CV</h4>
                  <div className="flex flex-wrap gap-2">
                    {analysis.missing.map(({ term, inProfile }) => (
                      <span key={term} className="bg-blush border border-line text-ink px-3 py-1 rounded-full text-sm font-medium">
                        {term}
                        {inProfile && <span className="text-ink-muted font-normal"> · in your profile</span>}
                      </span>
                    ))}
                  </div>
                  <p className="text-sm text-ink-muted mt-2">If you have one of these and it's not in your profile, add it there and generate again.</p>
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-line bg-blush text-right">
              <button
                type="button"
                onClick={() => setShowAnalysis(false)}
                className="px-4 py-2 rounded-lg bg-ink text-white text-sm hover:bg-[#3A2630]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {tipsModal}
      {paywallModal}

      {/* Floating restore button when the job posting is collapsed */}
      {jdCollapsed && (
        <button
          type="button"
          onClick={() => setJdCollapsed(false)}
          className="hidden lg:flex fixed left-4 top-1/2 -translate-y-1/2 z-40 rounded-full bg-berry p-3 text-white shadow-xl hover:bg-berry-dark"
          aria-label="Expand Job Description"
          title="Expand Job Description"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      )}
    </div>
  );
};

export default CVOptimizer;



