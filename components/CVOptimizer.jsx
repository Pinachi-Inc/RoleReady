import React, { useState, useEffect, useRef } from 'react';
import { Download, FileText, Target, Zap, AlertCircle, Save, Info, Copy, Check, Bot, Upload, User, ChevronRight, FolderOpen, Plus, Trash2, X, ArrowLeft, Link2, Award, GraduationCap, Briefcase, Sparkles, Clock } from 'lucide-react';
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
import { optimizeCv as optimizeCvService, detectAiContent } from '../services/openai.js';
import { getBillingStatus, startCheckout, openBillingPortal } from '../services/billing.js';
import { newProfileId, saveProfile, renameProfile, deleteProfile, activateProfile } from '../services/profiles.js';
import ProfileSwitcher from './ProfileSwitcher.jsx';
import HistoryPage from './HistoryPage.jsx';
import PricingModal from './PricingModal.jsx';
import { processPdf, processPdfText } from '../services/pdf.js';
import { onAuthStateChange, saveUserData, getUserData } from '../services/auth.js';
import { writePdfWithHandle, getFolderHandle, isFolderApiSupported } from '../services/folderManager.js';
import Auth from './Auth.jsx';
import { recordAppError, openFeedback } from '../services/feedback.js';

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
  const inputCls = 'w-full min-w-0 px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow';
  const labelCls = 'block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5';
  const cardCls = 'bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden';

  const SectionHead = ({ icon: Icon, title, hint, actions }) => (
    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-3">
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 text-base font-semibold text-gray-800 dark:text-gray-100">
          <Icon className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
          {title}
        </h2>
        {hint && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{hint}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );

  const SimpleList = ({ values, onChange, onAdd, onRemove, placeholder, addLabel, type = 'text' }) => (
    <div className={cardCls}>
      <ul className="divide-y divide-gray-100 dark:divide-gray-800">
        {values.map((value, index) => (
          <li key={index} className="flex items-center gap-2 p-3">
            <span className="w-6 shrink-0 text-xs tabular-nums text-gray-400 dark:text-gray-600 text-center">{index + 1}</span>
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
                className="shrink-0 p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                aria-label="Remove"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </li>
        ))}
      </ul>
      <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-2">
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
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
  const [keywords, setKeywords] = useState([]);
  const [stats, setStats] = useState(null);
  const [needsFix, setNeedsFix] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [aiScore, setAiScore] = useState(null);
  const [aiScoreLoading, setAiScoreLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState('main'); // 'main' | 'setup'
  const [user, setUser] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showUserInfoModal, setShowUserInfoModal] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [overlapSkills, setOverlapSkills] = useState([]);
  const [showTips, setShowTips] = useState(false);
  const [isProcessingPdf, setIsProcessingPdf] = useState(false);
  const [pdfError, setPdfError] = useState('');
  const [ocrStatus, setOcrStatus] = useState('');
  const [setupTab, setSetupTab] = useState('personal');
  const [jdCollapsed, setJdCollapsed] = useState(false); // Desktop-only JD sidebar collapse
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

  const detectableWordCount = (cv) => {
    if (!cv) return 0;
    const parts = [];
    if (cv.summary) parts.push(cv.summary);
    if (Array.isArray(cv.experience)) {
      for (const job of cv.experience) {
        if (Array.isArray(job.achievements)) parts.push(...job.achievements);
      }
    }
    return parts.join(' ').trim().split(/\s+/).filter(Boolean).length;
  };

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

  // Setup page: section rail state. Declared here, above the early returns, so hook
  // order stays stable regardless of which page is rendering.
  const [activeSection, setActiveSection] = useState(SETUP_SECTIONS[0].id);
  const [collapsedSkills, setCollapsedSkills] = useState(() => new Set());
  const [collapsedRoles, setCollapsedRoles] = useState(() => new Set());
  const [skillDrafts, setSkillDrafts] = useState({});
  const sectionRefs = useRef({});
  // Bumped whenever a run starts or the session is cleared. A detection response
  // that resolves after its bump is stale and must not touch state — that is how a
  // score ended up on a page with no CV on it.
  const detectRunRef = useRef(0);

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
    setKeywords([]);
    setStats(null);
    setNeedsFix(false);
    setOverlapSkills([]);
    detectRunRef.current++;
    setAiScore(null);
    setAiScoreLoading(false);
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
    if (!user) {
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
          ? `You are on RoleBerry ${status.plan === 'max' ? 'Max' : 'Pro'}. Thanks for subscribing!`
          : 'Payment received. Your plan will update in a moment; refresh the page if it does not.');
      }
    };
    run();
    return () => { cancelled = true; };
  }, [user?.uid]);

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
        setBillingNotice(`You are now on RoleBerry ${result.switched === 'max' ? 'Max' : 'Pro'}.`);
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
    detectRunRef.current++;
    setAiScore(null);
    setAiScoreLoading(false);
    setOptimizedCv(run.cvContent || '');
    setStructuredCv(run.cv || null);
    setCoverLetter(run.coverLetter || '');
    setCompanyName(run.companyName || '');
    setKeywords([]);
    setStats(null);
    setNeedsFix(false);
    setOverlapSkills([]);
    setDownloadNotice('');
    setActiveDoc('cv');
    setJdCollapsed(true);
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
    setOptimizedCv('');
    setKeywords([]);
    detectRunRef.current++;
    setAiScore(null);
    setCoverLetter('');
    setActiveDoc('cv');

    try {
      const { cvContent, keywords: kws, keywordsFiltered: kf, cv, needsFix: nf, stats: st, overlapSkills: os, companyName: cn, coverLetter: cl, quota } = await optimizeCvService({
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
      setKeywords(kf && kf.length ? kf : kws);
      if (cn) setCompanyName(cn);
      setNeedsFix(Boolean(nf));
      setStats(st || null);
      setOverlapSkills(Array.isArray(os) ? os : []);
      setCoverLetter(typeof cl === 'string' ? cl : '');
      if (wantsCoverLetter && !cl) {
        setDownloadNotice('The CV is ready, but the cover letter could not be written this time.');
      }

      // Non-blocking AI detection — runs after main optimization
      if (cv) {
        const parts = [];
        if (cv.summary) parts.push(cv.summary);
        if (Array.isArray(cv.experience)) {
          for (const job of cv.experience) {
            if (Array.isArray(job.achievements)) parts.push(...job.achievements);
          }
        }
        const detectText = parts.join('\n').trim();
        if (detectText) {
          const run = ++detectRunRef.current;
          setAiScoreLoading(true);
          detectAiContent(detectText)
            .then(score => { if (detectRunRef.current === run) setAiScore(score); })
            .catch(() => {/* silently ignore detection errors */})
            .finally(() => { if (detectRunRef.current === run) setAiScoreLoading(false); });
        }
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

  if (user && currentPage === 'history') {
    return (
      <div className="min-h-screen p-6 bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
        <div className="max-w-7xl mx-auto">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-lg overflow-hidden relative">
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-4 sm:p-8 dark:from-gray-800 dark:to-gray-700">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Target className="h-8 w-8" />
                  <h1 className="text-3xl font-bold">RoleBerry</h1>
                </div>
                <Auth user={user} onAuthChange={setUser} onToggleTheme={() => setIsDark(v=>!v)} isDark={isDark} folderMgmtEnabled={folderMgmtEnabled} onToggleFolderMgmt={handleToggleFolderMgmt} />
              </div>
            </div>
            <div className="p-4 sm:p-8 text-gray-900 dark:text-gray-100">
              <HistoryPage
                onBack={() => setCurrentPage('main')}
                onOpenRun={handleOpenRun}
                onUpgrade={() => setShowPaywall(true)}
              />
            </div>
            {paywallModal}
          </div>
        </div>
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
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-4 sm:p-6">
        <div className="max-w-7xl mx-auto bg-white dark:bg-gray-900 rounded-xl shadow-lg">
          {/* Gradient header band, matching the main app */}
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-gray-800 dark:to-gray-700 text-white p-5 sm:p-6 rounded-t-xl">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <Target className="h-7 w-7 shrink-0" />
                <div className="min-w-0">
                  <h1 className="text-2xl font-bold truncate">Setup Your Profile</h1>
                  <p className="text-blue-100 dark:text-gray-300 text-sm">This is the raw material every tailored CV is built from</p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setCurrentPage('main')}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-white/20 text-white text-sm hover:bg-white/30 transition-colors"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to app
                </button>
                <Auth user={user} onAuthChange={setUser} onToggleTheme={() => setIsDark(v => !v)} isDark={isDark} folderMgmtEnabled={folderMgmtEnabled} onToggleFolderMgmt={handleToggleFolderMgmt} />
              </div>
            </div>
          </div>

          <div className="flex gap-6 p-4 sm:p-6">
            {/* Section rail */}
            <aside className="hidden lg:block w-60 shrink-0">
              <div className="sticky top-6 space-y-4">
                <nav aria-label="Profile sections" className="space-y-0.5">
                  <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-600">Sections</div>
                  {SETUP_SECTIONS.map((s) => {
                    const state = sectionState(s.id);
                    const active = activeSection === s.id;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => scrollToSection(s.id)}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                          active
                            ? 'bg-blue-50 dark:bg-blue-900/25 text-blue-700 dark:text-blue-300 font-medium'
                            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                            state.done ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'
                          }`}
                        />
                        <span className="flex-1 text-left truncate">{s.label}</span>
                        {state.count !== null && state.count > 0 && (
                          <span className="text-xs tabular-nums text-gray-400 dark:text-gray-600">{state.count}</span>
                        )}
                      </button>
                    );
                  })}
                </nav>

                <div className="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-3">
                  <div>
                    <div className="h-1.5 w-full rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 transition-all duration-500"
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                    <div className="mt-1.5 flex justify-between text-[11px] text-gray-500 dark:text-gray-400">
                      <span>{completed} of {SETUP_SECTIONS.length} complete</span>
                      <span className="tabular-nums">{progressPct}%</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={async () => { await saveUserInfo(); setCurrentPage('main'); }}
                    disabled={isSaving || !isValidFormData()}
                    className="w-full px-4 py-2.5 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-semibold hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 transition-all"
                  >
                    {isSaving ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4" />
                        Save &amp; Continue
                      </>
                    )}
                  </button>
                  {!isValidFormData() && (
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-snug">
                      Needs a name, one skill group and one role before it can be saved.
                    </p>
                  )}
                </div>
              </div>
            </aside>

            {/* Canvas */}
            <div className="flex-1 min-w-0 space-y-8">
              {/* Import */}
              <section id="import" ref={(el) => { sectionRefs.current.import = el; }} className="scroll-mt-6">
                <SectionHead icon={Upload} title="Import" hint="Fastest way to fill this in. We read the PDF and populate every section below." />
                <div className="rounded-xl border border-blue-200 dark:border-gray-700 bg-blue-50 dark:bg-gray-800/50 p-5">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                    <label className="cursor-pointer shrink-0">
                      <input type="file" accept=".pdf" onChange={handlePdfUpload} disabled={isProcessingPdf} className="hidden" />
                      <span className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                        isProcessingPdf ? 'bg-gray-400 text-white cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700'
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
                    <p className="text-sm text-blue-900 dark:text-gray-300">
                      Or fill everything in by hand below. PDFs up to 10MB, including scans.
                    </p>
                  </div>
                  {pdfError && (
                    <div className="mt-3 flex items-start gap-2 text-xs bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-lg p-2.5">
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
                        <span className="ml-2 font-normal text-gray-400 dark:text-gray-600">Calculated from your roles below. Override it here if it is wrong.</span>
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
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add group
                    </button>
                  }
                />
                <div className={cardCls}>
                  <div className="divide-y divide-gray-100 dark:divide-gray-800">
                    {formData.skills.map((skill, skillIndex) => {
                      const open = !collapsedSkills.has(skillIndex);
                      const liveItems = skill.items.filter(i => i.trim());
                      return (
                        <article key={skillIndex} className="flex">
                          <div className="w-10 shrink-0 pt-4 text-center">
                            <span className="text-xs tabular-nums text-gray-400 dark:text-gray-600">{skillIndex + 1}</span>
                          </div>
                          <div className="flex-1 min-w-0 p-4 pl-0 pr-4">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => toggleRecord(setCollapsedSkills, skillIndex)}
                                className="p-1 -ml-1 rounded text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 shrink-0"
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
                                className="flex-1 min-w-0 bg-transparent border-0 border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:outline-none text-sm font-semibold text-gray-800 dark:text-gray-100 placeholder-gray-400 py-1"
                                placeholder="Group name, e.g. Cloud & Infrastructure"
                                aria-label="Category name"
                              />
                              <span className="text-xs text-gray-400 dark:text-gray-600 shrink-0 tabular-nums">{liveItems.length} skills</span>
                              {formData.skills.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setFormData(prev => ({ ...prev, skills: prev.skills.filter((_, i) => i !== skillIndex) }));
                                    setCollapsedSkills(new Set());
                                  }}
                                  className="shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                  aria-label="Remove group"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              )}
                            </div>

                            {open && (
                              <div className="mt-3 ml-6 pl-3 border-l-2 border-gray-100 dark:border-gray-800">
                                <div className="flex flex-wrap gap-1.5 items-center">
                                  {skill.items.map((item, itemIndex) => (
                                    item.trim() ? (
                                      <span key={itemIndex} className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200 text-xs font-medium">
                                        {item}
                                        <button
                                          type="button"
                                          onClick={() => removeSkillToken(skillIndex, itemIndex)}
                                          className="p-0.5 rounded-full hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors"
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
                                    className="flex-1 min-w-[8rem] bg-transparent border-0 focus:outline-none text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-600 py-1"
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
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add role
                    </button>
                  }
                />
                <div className={cardCls}>
                  <div className="divide-y divide-gray-100 dark:divide-gray-800">
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
                            <span className="text-xs tabular-nums text-gray-400 dark:text-gray-600">{expIndex + 1}</span>
                          </div>
                          <div className="flex-1 min-w-0 p-4 pl-0 pr-4">
                            <div className="flex items-start gap-2">
                              <button
                                type="button"
                                onClick={() => toggleRecord(setCollapsedRoles, expIndex)}
                                className="p-1 -ml-1 mt-0.5 rounded text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 shrink-0"
                                aria-expanded={open}
                                aria-label={open ? 'Collapse role' : 'Expand role'}
                              >
                                <ChevronRight className={`h-4 w-4 transition-transform ${open ? 'rotate-90' : ''}`} />
                              </button>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">
                                  {exp.title || <span className="text-gray-400 font-normal">Untitled role</span>}
                                </div>
                                <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                  {[exp.company, exp.location].filter(Boolean).join(' · ') || 'No company yet'}
                                </div>
                              </div>
                              <span className="hidden sm:block text-xs text-gray-400 dark:text-gray-600 shrink-0 text-right">
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
                                  className="shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                  aria-label="Remove role"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              )}
                            </div>

                            {open && (
                              <div className="mt-4 ml-6 pl-3 border-l-2 border-gray-100 dark:border-gray-800 space-y-4">
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
                                      <span className="text-xs text-gray-400 shrink-0">to</span>
                                      <input type="text" value={exp.end} onChange={(e) => setExp({ end: e.target.value })} className={inputCls} placeholder="Present" />
                                    </div>
                                  </div>
                                </div>

                                <div>
                                  <div className={labelCls}>Key achievements</div>
                                  <div className="space-y-2">
                                    {exp.achievements.map((achievement, achIndex) => (
                                      <div key={achIndex} className="flex items-start gap-2">
                                        <span className="mt-3 h-1 w-1 rounded-full bg-gray-300 dark:bg-gray-600 shrink-0" />
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
                                            className="shrink-0 mt-1 p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
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
                                    className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
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
                <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white/95 dark:bg-gray-900/95 backdrop-blur p-3 shadow-lg">
                  <div className="mb-2 h-1.5 w-full rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 transition-all duration-500" style={{ width: `${progressPct}%` }} />
                  </div>
                  <button
                    type="button"
                    onClick={async () => { await saveUserInfo(); setCurrentPage('main'); }}
                    disabled={isSaving || !isValidFormData()}
                    className="w-full px-4 py-2.5 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-semibold hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
                  >
                    {isSaving ? 'Saving...' : <><Save className="h-4 w-4" /> Save &amp; Continue</>}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show sign-in page for anonymous users
  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center p-6">
        <div className="max-w-md w-full">
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-3 mb-6">
              <Target className="h-12 w-12 text-blue-400" />
              <h1 className="text-4xl font-bold text-white">RoleBerry</h1>
            </div>
            <p className="text-gray-300 text-lg mb-2">AI-Powered CV Optimization</p>
            <p className="text-gray-400">Transform your CV to match any job description with precision and professionalism</p>
          </div>
          
          <div className="bg-gray-800 rounded-xl shadow-2xl p-8 border border-gray-700">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-semibold text-white mb-2">Get Started</h2>
              <p className="text-gray-400">Sign in to save your templates and optimize your CV</p>
            </div>
            
            <Auth user={user} onAuthChange={setUser} folderMgmtEnabled={folderMgmtEnabled} onToggleFolderMgmt={handleToggleFolderMgmt} />

            <p className="mt-4 text-center text-xs text-gray-500">
              By continuing you agree to the{' '}
              <a href="/terms" className="underline hover:text-gray-300">Terms of Service</a>
              {' '}and acknowledge the{' '}
              <a href="/privacy" className="underline hover:text-gray-300">Privacy Policy</a>.
            </p>

            <div className="mt-8 pt-6 border-t border-gray-700">
              <div className="grid grid-cols-2 gap-4 text-center text-sm text-gray-400">
                <div>
                  <div className="text-blue-400 font-semibold">✨ Smart Keywords</div>
                  <div>ATS-optimized content</div>
                </div>
                <div>
                  <div className="text-green-400 font-semibold">🎯 Job Matching</div>
                  <div>Tailored to descriptions</div>
                </div>
                <div>
                  <div className="text-purple-400 font-semibold">📄 Clean Design</div>
                  <div>Professional templates</div>
                </div>
                <div>
                  <div className="text-orange-400 font-semibold">💾 Save Templates</div>
                  <div>Reuse your profiles</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6 bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-lg overflow-hidden relative">
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-4 sm:p-8 dark:from-gray-800 dark:to-gray-700">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
              <div className="flex items-center gap-3">
              <Target className="h-8 w-8" />
              <h1 className="text-3xl font-bold">RoleBerry</h1>
              </div>
              <Auth user={user} onAuthChange={setUser} onToggleTheme={() => setIsDark(v=>!v)} isDark={isDark} folderMgmtEnabled={folderMgmtEnabled} onToggleFolderMgmt={handleToggleFolderMgmt} />
            </div>
            <p className="text-blue-100 text-lg dark:text-gray-300">Maximize your ATS compatibility while maintaining professional readability</p>
          </div>

          <div className="p-4 sm:p-8 space-y-8 text-gray-900 dark:text-gray-100">
            {/* Buttons Section - Full Width */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="text-sm text-gray-600 dark:text-gray-400">
                {billing && billing.plan === 'free' && billing.limit != null && (
                  <span>{billing.remaining} of {billing.limit} free optimizations left</span>
                )}
                {billing && billing.plan === 'paid' && (
                  <span>
                    Pro{billing.limit != null ? ` · ${billing.remaining} of ${billing.limit.toLocaleString()} optimizations left this month` : ''}
                    {billing.cancelAtPeriodEnd && billing.renewsAt ? ` · ends ${new Date(billing.renewsAt).toLocaleDateString()}` : ''}
                  </span>
                )}
                {billing && billing.plan === 'max' && (
                  <span>
                    {billing.comped ? 'Max (complimentary)' : 'Max'} · unlimited optimizations
                    {billing.cancelAtPeriodEnd && billing.renewsAt ? ` · ends ${new Date(billing.renewsAt).toLocaleDateString()}` : ''}
                  </span>
                )}
                {billingNotice && (
                  <span className="ml-2 text-green-700 dark:text-green-400">{billingNotice}</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                  {billing?.plan === 'free' && billing.billingAvailable && (
                    <button
                      type="button"
                      onClick={() => setShowPaywall(true)}
                      className="px-3 py-1.5 rounded-md text-sm font-medium bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:from-amber-600 hover:to-orange-600 flex items-center gap-1"
                    >
                      <Sparkles className="h-3 w-3" />
                      Upgrade
                    </button>
                  )}
                  {user && (
                    <ProfileSwitcher
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
                  )}
                  <button
                    type="button"
                    onClick={() => setCurrentPage('history')}
                    className="px-3 py-1.5 rounded-md text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800 flex items-center gap-1"
                  >
                    <Clock className="h-3 w-3" />
                    History
                  </button>
                  {(billing?.plan === 'paid' || billing?.plan === 'max') && (
                    <button
                      type="button"
                      onClick={() => setShowPaywall(true)}
                      className="px-3 py-1.5 rounded-md text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800 flex items-center gap-1"
                    >
                      <Sparkles className="h-3 w-3" />
                      Plans
                    </button>
                  )}
                  {/* Comped accounts have nothing to manage, unless they also still pay for a subscription they may want to cancel. */}
                  {(billing?.plan === 'paid' || billing?.plan === 'max') && billing.hasCustomer
                    && (!billing.comped || (billing.billingPlan && billing.billingPlan !== 'free')) && (
                    <button
                      type="button"
                      onClick={handleManageBilling}
                      disabled={billingBusy}
                      className="px-3 py-1.5 rounded-md text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800 disabled:opacity-50"
                    >
                      Manage subscription
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setCurrentPage('setup')}
                    className="px-3 py-1.5 rounded-md text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-1"
                  >
                    <FileText className="h-3 w-3" />
                    Setup User Info
                  </button>
                <button
                  type="button"
                  onClick={() => setShowTips(true)}
                  className="px-3 py-1.5 rounded-md text-sm font-medium bg-gray-800 text-white hover:bg-gray-700"
                >
                  Optimization Tips
                </button>
              </div>
                </div>

            {/* Responsive Layout: Single column on mobile, JD collapses on desktop */}
            <div className={`relative grid grid-cols-1 ${jdCollapsed ? 'lg:grid-cols-1' : 'lg:grid-cols-2'} gap-8 min-h-[70vh] transition-all duration-700 ease-in-out`}>
              {needsSetup && (
                <div className="absolute inset-0 z-10 bg-white/70 backdrop-blur-[1px] flex items-center justify-center">
                  <button
                    type="button"
                    onClick={() => setCurrentPage('setup')}
                    className="px-4 py-2 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-700"
                  >
                    Setup User Info
                  </button>
                </div>
              )}
              
              {/* Left Column: Job Description (collapsible on desktop) */}
              <div className={`flex flex-col gap-6 h-full transition-all duration-700 ease-in-out overflow-hidden ${jdCollapsed ? 'lg:absolute lg:opacity-0 lg:pointer-events-none lg:-left-full' : 'lg:relative lg:opacity-100'}`}>
                <div className="flex-1 flex flex-col min-h-[40vh]">
                  <div className="flex items-center gap-2 mb-3">
                    <FileText className="h-5 w-5 text-gray-600" />
                    <label className="text-lg font-semibold text-gray-700">Job Description</label>
                  </div>
                  <textarea
                    value={jobDescription}
                    onChange={(e) => setJobDescription(e.target.value)}
                    placeholder="Paste the complete job posting here..."
                    className="w-full flex-1 p-4 border border-gray-300 dark:border-gray-700 rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent overflow-auto bg-white dark:bg-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                  />
                </div>

                {/* Cover letter switch, welded to the top edge of the action so the two
                    read as one block: this modifies the thing you are about to press. */}
                <div className="mt-auto">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={wantsCoverLetter}
                    onClick={() => {
                      const next = !wantsCoverLetter;
                      setWantsCoverLetter(next);
                      localStorage.setItem('wantsCoverLetter', next ? 'true' : 'false');
                    }}
                    className={`w-full flex items-center justify-between gap-3 px-4 py-2.5 rounded-t-lg border border-b-0 text-sm transition-colors ${
                      wantsCoverLetter
                        ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-200'
                        : 'bg-gray-50 dark:bg-gray-800/60 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'
                    }`}
                  >
                    <span className="font-medium">Also write a cover letter</span>
                    <span className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                      wantsCoverLetter ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
                    }`}>
                      <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                        wantsCoverLetter ? 'translate-x-5' : 'translate-x-1'
                      }`} />
                    </span>
                  </button>
                  <button
                    onClick={handleOptimize}
                    disabled={isProcessing}
                    className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-3 px-6 rounded-b-lg font-semibold inline-flex items-center justify-center gap-2 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
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
              </div>

              {/* Right Column: Results */}
              <div className={`flex flex-col gap-6 h-full transition-all duration-700 ease-in-out`}>
                {/* JD share warning moved into Analysis modal */}
                <div className="flex-1 flex flex-col min-h-[40vh]">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Target className="h-5 w-5 text-gray-600" />
                      <label className="text-lg font-semibold text-gray-700">
                        {activeDoc === 'letter' ? 'Cover Letter Preview' : 'Optimized CV Preview'}
                      </label>
                      {aiScoreLoading && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-gray-200">AI detecting…</span>
                      )}
                      {!aiScoreLoading && aiScore !== null && (() => {
                        const pct = Math.round(aiScore * 100);
                        const color = pct >= 70 ? 'bg-red-50 text-red-700 border-red-200' : pct >= 40 ? 'bg-yellow-50 text-yellow-700 border-yellow-200' : 'bg-green-50 text-green-700 border-green-200';
                        return <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${color}`}>{pct}% AI</span>;
                      })()}
                    </div>
                    {folderMgmtEnabled && (optimizedCv || structuredCv) && (
                      <div className="flex items-center gap-2">
                        <FolderOpen className="h-4 w-4 text-gray-400 shrink-0" />
                        <input
                          type="text"
                          value={companyName}
                          onChange={(e) => setCompanyName(e.target.value)}
                          placeholder="Company name"
                          className="text-sm px-2 py-1 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 w-40 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                    )}
                  </div>
                  {/* Document stepper. Only exists once there is a second document; sizes
                      to its content rather than stretching across the column. */}
                  {coverLetter && (
                    <div className="flex items-center justify-between gap-3 mb-3">
                    <div
                      role="tablist"
                      aria-label="Document"
                      className="w-fit inline-flex items-center gap-px p-0.5 rounded-full bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
                    >
                      <button
                        type="button"
                        aria-label="Previous document"
                        onClick={() => setActiveDoc(activeDoc === 'cv' ? 'letter' : 'cv')}
                        className="grid place-items-center h-5 w-5 rounded-full text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-white dark:hover:bg-gray-700 transition-colors"
                      >
                        <ChevronRight className="h-3 w-3 rotate-180" />
                      </button>
                      {[['cv', 'CV'], ['letter', 'Cover letter']].map(([id, label]) => (
                        <button
                          key={id}
                          type="button"
                          role="tab"
                          aria-selected={activeDoc === id}
                          onClick={() => setActiveDoc(id)}
                          className={`px-2.5 py-1 rounded-full text-[11.5px] font-semibold whitespace-nowrap transition-colors ${
                            activeDoc === id
                              ? 'bg-white dark:bg-gray-900 text-blue-600 dark:text-blue-300 shadow-sm'
                              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                      <button
                        type="button"
                        aria-label="Next document"
                        onClick={() => setActiveDoc(activeDoc === 'cv' ? 'letter' : 'cv')}
                        className="grid place-items-center h-5 w-5 rounded-full text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-white dark:hover:bg-gray-700 transition-colors"
                      >
                        <ChevronRight className="h-3 w-3" />
                      </button>
                    </div>

                    {/* Cover letters get pasted into a form or an email far more often than
                        they get attached, so copying is worth reaching from either tab —
                        no need to switch documents just to grab the text. */}
                    <button
                      type="button"
                      onClick={() => copyCoverLetter()}
                      title="Copy the cover letter text to the clipboard"
                      className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                        letterCopied
                          ? 'bg-green-50 dark:bg-green-900/25 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300'
                          : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                      }`}
                      aria-live="polite"
                    >
                      {letterCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      {letterCopied ? 'Copied' : 'Copy cover letter'}
                    </button>
                    </div>
                  )}
                  <div id="cv-preview" className="flex-1 p-0 border border-gray-300 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 overflow-auto">
                    {coverLetter && activeDoc === 'letter' ? (
                      <iframe
                        title="Cover Letter Preview"
                        style={{ width: '100%', height: '100%', minHeight: '40vh', border: '0' }}
                        srcDoc={renderCoverLetterHtml(coverLetter, structuredCv)}
                      />
                    ) : structuredCv ? (
                      <iframe
                        title="CV Preview"
                        style={{ width: '100%', height: '100%', minHeight: '40vh', border: '0' }}
                        srcDoc={renderCvHtml(structuredCv)}
                      />
                    ) : optimizedCv ? (
                      <div className="p-4 prose prose-sm max-w-none min-h-[40vh]" dangerouslySetInnerHTML={{ __html: convertMarkdownToHtml(optimizedCv) }} />
                    ) : (
                      <p className="p-4 text-gray-500 italic">Optimized CV will appear here after processing...</p>
                    )}
                  </div>
                </div>

                {/* Keywords moved to Analysis modal */}

                {/* AI Stats moved to Analysis modal */}

                {(optimizedCv || stats || (keywords && keywords.length > 0)) && (
                  <div className="mt-auto grid grid-cols-1 sm:grid-cols-2 gap-2 w-full">
                    <button
                      type="button"
                      onClick={downloadCv}
                      disabled={!optimizedCv || isDownloading}
                      className="w-full bg-green-600 hover:bg-green-700 text-white py-3 px-6 rounded-lg font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
                    >
                      <Download className="h-4 w-4" />
                      {isDownloading
                        ? 'Downloading...'
                        : (coverLetter && activeDoc === 'letter' ? 'Download cover letter' : 'Download PDF')}
                    </button>
                    {(stats || (keywords && keywords.length > 0)) && (
                      <button
                        type="button"
                        onClick={() => setShowAnalysis(true)}
                        className={`w-full py-3 px-6 rounded-lg font-semibold inline-flex items-center justify-center gap-2 transition-colors duration-200 ${needsFix ? 'bg-yellow-400 hover:bg-yellow-500 text-black' : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700'}`}
                        aria-label={needsFix ? 'View Analysis (issues detected)' : 'View Analysis'}
                        title={needsFix ? 'Issues detected: open analysis' : 'View analysis'}
                      >
                        {needsFix && <Info className="h-4 w-4" />}
                        View Analysis
                      </button>
                    )}
                    </div>
                )}

                {downloadNotice && (
                  <div className={`flex items-start gap-2 text-sm px-3 py-2 rounded-md border ${
                    downloadNoticeTone === 'ok'
                      ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-800 dark:text-green-300'
                      : 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800 text-yellow-800 dark:text-yellow-300'
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
                  </div>
            </div>

            {/* Modals */}
            {showAnalysis && (
              <div className="fixed inset-0 z-50 flex items-center justify-center">
                <div className="absolute inset-0 bg-black/50" onClick={() => setShowAnalysis(false)}></div>
                <div className="relative bg-white w-full max-w-3xl mx-4 rounded-lg shadow-xl overflow-hidden">
                  <div className="flex items-center justify-between px-6 py-4 border-b">
                    <h3 className="text-xl font-semibold text-gray-800">Result Analysis</h3>
                    <button
                      type="button"
                      onClick={() => setShowAnalysis(false)}
                      className="text-gray-500 hover:text-gray-800"
                      aria-label="Close"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
                    {needsFix && (
                      <div className="p-3 rounded-md bg-red-50 border border-red-200 text-red-800 text-sm">
                        The result may not fully meet the constraints (e.g., JD keyword share or category sizes). You can still download, but consider refining the inputs.
                      </div>
                    )}
                    {keywords.length > 0 && (
                <div>
                        <h4 className="text-lg font-semibold text-gray-700 mb-2">Keywords Integrated</h4>
                        <div className="flex flex-wrap gap-2">
                          {keywords.map((keyword, index) => (
                            <span key={index} className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium">
                              {keyword}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {stats && (
                      <div>
                        <h4 className="text-lg font-semibold text-gray-700 mb-2">AI Stats</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div className="bg-gray-50 border border-gray-200 rounded p-3">JD Share: {(stats.jdShare * 100).toFixed(0)}%</div>
                          <div className="bg-gray-50 border border-gray-200 rounded p-3">Categories: {stats.categories}</div>
                          <div className="bg-gray-50 border border-gray-200 rounded p-3">Total Skills: {stats.totalSkills}</div>
                          <div className="sm:col-span-3 bg-gray-50 border border-gray-200 rounded p-3">Overlap Skills: {stats.overlapCount ?? 0}</div>
                          <div className="sm:col-span-3 bg-gray-50 border border-gray-200 rounded p-3">AI-detectable words (summary + bullets): {detectableWordCount(structuredCv)}</div>
                          {Array.isArray(stats.categorySizeViolations) && stats.categorySizeViolations.length > 0 && (
                            <div className="sm:col-span-3 bg-yellow-50 border border-yellow-200 rounded p-3">
                              Category size issues: {stats.categorySizeViolations.join(', ')}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {Array.isArray(overlapSkills) && overlapSkills.length > 0 && (
                <div>
                        <h4 className="text-lg font-semibold text-gray-700 mb-2">Skills Overlap (JD ∩ Base)</h4>
                        <div className="flex flex-wrap gap-2">
                          {overlapSkills.map((s, i) => (
                            <span key={i} className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm font-medium">
                              {s}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="px-6 py-4 border-t bg-gray-50 text-right">
                    <button
                      type="button"
                      onClick={() => setShowAnalysis(false)}
                      className="px-4 py-2 rounded-md bg-gray-800 text-white text-sm hover:bg-gray-700"
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            )}

            {paywallModal}

            {showTips && (
              <div className="fixed inset-0 z-50 flex items-center justify-center">
                <div className="absolute inset-0 bg-black/50" onClick={() => setShowTips(false)}></div>
                <div className="relative bg-white w-full max-w-2xl mx-4 rounded-lg shadow-xl overflow-hidden">
                  <div className="flex items-center justify-between px-6 py-4 border-b">
                    <h3 className="text-xl font-semibold text-gray-800">Optimization Tips</h3>
                    <button
                      type="button"
                      onClick={() => setShowTips(false)}
                      className="text-gray-500 hover:text-gray-800"
                      aria-label="Close"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                    <ul className="list-disc pl-6 text-gray-700 text-sm space-y-1">
                      <li>Use the complete job posting, including requirements and preferred qualifications.</li>
                      <li>Provide detailed CV content with specific achievements and metrics.</li>
                      <li>Review the optimized CV to ensure it accurately represents your experience.</li>
                      <li>The downloaded PDF contains real text, so keep it as-is rather than printing it to a new file.</li>
                      <li>Customize further based on your specific industry and role.</li>
                  </ul>
                </div>
                  <div className="px-6 py-4 border-t bg-gray-50 text-right">
                    <button
                      type="button"
                      onClick={() => setShowTips(false)}
                      className="px-4 py-2 rounded-md bg-gray-800 text-white text-sm hover:bg-gray-700"
                    >
                      Close
                    </button>
              </div>
            </div>
              </div>
            )}

            {/* Floating restore button when JD is collapsed - positioned relative to the card */}
            {jdCollapsed && (
              <button
                type="button"
                onClick={() => setJdCollapsed(false)}
                className="hidden lg:flex absolute left-4 top-1/2 -translate-y-1/2 items-center justify-center rounded-full shadow-2xl bg-blue-600 text-white p-4 hover:bg-blue-700 z-50"
                aria-label="Expand Job Description"
                title="Expand Job Description"
              >
                <ChevronRight className="h-8 w-8" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CVOptimizer;


