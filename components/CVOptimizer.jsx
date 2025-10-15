import React, { useState, useEffect } from 'react';
import { Download, FileText, Target, Zap, AlertCircle, Save, Info, Copy, Check, Bot, Upload, User } from 'lucide-react';
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
import { renderCvHtml } from '../src/templateRenderer.js';
import { optimizeCv as optimizeCvService } from '../services/openai.js';
import { processPdf } from '../services/pdf.js';
import { onAuthStateChange, saveUserData, getUserData } from '../services/auth.js';
import Auth from './Auth.jsx';

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
  const [currentPage, setCurrentPage] = useState('main'); // 'main' | 'setup'
  const [user, setUser] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showUserInfoModal, setShowUserInfoModal] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [overlapSkills, setOverlapSkills] = useState([]);
  const [showTips, setShowTips] = useState(false);
  const [isProcessingPdf, setIsProcessingPdf] = useState(false);
  const [pdfError, setPdfError] = useState('');
  const [setupTab, setSetupTab] = useState('personal');
  
  // Structured form data
  const [formData, setFormData] = useState({
    // Personal Info
    name: '',
    email: '',
    phone: '',
    location: '',
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

  // Helper functions to convert between form data and JSON
  const formDataToJson = () => {
    const fixedUserInfo = {
      name: formData.name,
      contact: {
        email: formData.email,
        phone: formData.phone,
        location: formData.location,
        links: formData.links.filter(link => link.trim())
      },
      certifications: formData.certifications.filter(cert => cert.trim()),
      education: formData.education.filter(edu => edu.trim())
    };

    const aiUserInfo = {
      coreSkillsBase: formData.skills
        .filter(skill => skill.category.trim())
        .map(skill => ({
          category: skill.category,
          items: skill.items.filter(item => item.trim())
        })),
      experienceSource: formData.experience
        .filter(exp => exp.title.trim())
        .map(exp => ({
          roleId: exp.roleId || `role_${Date.now()}`,
          title: exp.title,
          company: exp.company,
          location: exp.location,
          start: exp.start,
          end: exp.end,
          baseAchievements: exp.achievements.filter(ach => ach.trim())
        }))
    };

    return { fixedUserInfo, aiUserInfo };
  };

  const jsonToFormData = (fixedJson, aiJson) => {
    try {
      const fixed = fixedJson ? JSON.parse(fixedJson) : {};
      const ai = aiJson ? JSON.parse(aiJson) : {};
      
      setFormData({
        name: fixed.name || '',
        email: fixed.contact?.email || '',
        phone: fixed.contact?.phone || '',
        location: fixed.contact?.location || '',
        links: fixed.contact?.links?.length ? fixed.contact.links : [''],
        certifications: fixed.certifications?.length ? fixed.certifications : [''],
        education: fixed.education?.length ? fixed.education : [''],
        
        skills: ai.coreSkillsBase?.length ? ai.coreSkillsBase.map(skill => ({
          category: skill.category,
          items: skill.items.length ? skill.items : ['']
        })) : [{ category: '', items: [''] }],
        
        experience: ai.experienceSource?.length ? ai.experienceSource.map(exp => ({
          roleId: exp.roleId,
          title: exp.title,
          company: exp.company,
          location: exp.location,
          start: exp.start,
          end: exp.end,
          achievements: exp.baseAchievements.length ? exp.baseAchievements : ['']
        })) : [{
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

  // Auth state management
  useEffect(() => {
    const unsubscribe = onAuthStateChange(async (user) => {
      setUser(user);
      if (user) {
        // Load user data when signed in
        try {
          const userData = await getUserData(user.uid);
          if (userData) {
            setAiUserInfo(userData.aiUserInfo || '');
            setFixedUserInfo(userData.fixedUserInfo || '');
            
            // Populate form data from existing JSON
            jsonToFormData(userData.fixedUserInfo || '', userData.aiUserInfo || '');
          }
        } catch (error) {
          console.error('Error loading user data:', error);
        }
      } else {
        // Clear data when signed out (optional - you can keep data in session)
        // setAiUserInfo('');
        // setFixedUserInfo('');
      }
    });

    return () => unsubscribe();
  }, []);

  const saveUserInfo = async () => {
    if (!user) {
      alert('Please sign in to save your information.');
      return;
    }

    setIsSaving(true);
    try {
      const { fixedUserInfo: fixedJson, aiUserInfo: aiJson } = formDataToJson();
      
      await saveUserData(user.uid, {
        aiUserInfo: JSON.stringify(aiJson, null, 2),
        fixedUserInfo: JSON.stringify(fixedJson, null, 2),
        lastUpdated: new Date().toISOString()
      });
      
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
      const result = await processPdf(file);
      
      // Auto-populate the form data from PDF processing
      jsonToFormData(result.fixedUserInfo, result.aiUserInfo);
      
      // Also update the JSON fields for backward compatibility
      setAiUserInfo(result.aiUserInfo);
      setFixedUserInfo(result.fixedUserInfo);
      
      // Move to personal info tab to show the results
      setSetupTab('personal');
      
      console.log('✅ PDF processed successfully');
    } catch (error) {
      console.error('PDF processing error:', error);
      setPdfError(error.message || 'Failed to process PDF');
    } finally {
      setIsProcessingPdf(false);
      // Clear the file input
      event.target.value = '';
    }
  };

  const downloadCv = async () => {
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
      return 'RoleReady_CV';
    };

    const baseFilename = getPreferredFilename();
    // Build full HTML document including styles
    let fullHtml = '';
    if (structuredCv) {
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

      // Helper to use File System Access API when available
      const saveWithPicker = async (blob) => {
        if (!('showSaveFilePicker' in window)) return false;
        try {
          const handle = await window.showSaveFilePicker({
            suggestedName: `${baseFilename}.pdf`,
            types: [{ description: 'PDF', accept: { 'application/pdf': ['.pdf'] } }]
          });
          const writable = await handle.createWritable();
          await writable.write(blob);
          await writable.close();
          return true;
        } catch {
          return false;
        }
      };

      try {
        // Try generate blob and use Save File Picker
        const pdf = await html2pdf().set(opt).from(fullHtml).toPdf().get('pdf');
        const blob = pdf.output('blob');
        const saved = await saveWithPicker(blob);
        if (!saved) {
          // Fallback to automatic download
          await html2pdf().set(opt).from(fullHtml).save();
        }
        return;
      } catch (e) {
        console.warn('html2pdf(from string) failed, trying DOM container', e);
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
            await html2pdf().set(opt).from(container).save();
          }
        } finally {
          document.body.removeChild(container);
        }
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
      } catch {}
    }
    downloadHtml(htmlFallback, `${baseFilename}.html`);
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

    try {
      const { cvContent, keywords: kws, keywordsFiltered: kf, cv, needsFix: nf, stats: st, overlapSkills: os } = await optimizeCvService({
        jobDescription,
        aiUserInfo,
        fixedUserInfo
      });
      setOptimizedCv(cvContent);
      setStructuredCv(cv || null);
      setKeywords(kf && kf.length ? kf : kws);
      setNeedsFix(Boolean(nf));
      setStats(st || null);
      setOverlapSkills(Array.isArray(os) ? os : []);
    } catch (error) {
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

  // Show setup page
  if (currentPage === 'setup') {
    return (
      <div className="min-h-screen p-6 bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-lg overflow-hidden">
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-6 dark:from-gray-800 dark:to-gray-700">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Target className="h-8 w-8" />
                  <h1 className="text-3xl font-bold">Setup Your Profile</h1>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setCurrentPage('main')}
                    className="px-4 py-2 rounded-md bg-white/20 text-white hover:bg-white/30 transition-colors"
                  >
                    ← Back to Main
                  </button>
                  <Auth user={user} onAuthChange={setUser} onToggleTheme={() => setIsDark(v => !v)} isDark={isDark} />
                </div>
              </div>
            </div>
            <div className="p-6 space-y-6 text-gray-900 dark:text-gray-100">
              
              {/* CV Upload Section */}
              <div className="border border-blue-200 dark:border-gray-700 rounded-lg p-6 bg-blue-50 dark:bg-gray-900">
                <h3 className="text-lg font-semibold text-blue-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                  <Upload className="h-5 w-5 text-blue-800 dark:text-gray-200" />
                  Upload Your CV (Recommended)
                </h3>
                <p className="text-blue-800 dark:text-gray-300 text-sm mb-4">
                  Upload your CV in PDF format and we'll automatically extract both your skills/experience and personal information.
                </p>
                <div className="flex flex-col gap-2">
                  <label className="relative cursor-pointer inline-block w-fit">
                    <input
                      type="file"
                      accept=".pdf"
                      onChange={handlePdfUpload}
                      disabled={isProcessingPdf}
                      className="hidden"
                    />
                    <div className={`inline-flex items-center gap-2 px-6 py-3 rounded-md text-sm font-medium transition-colors ${
                      isProcessingPdf ? 'bg-gray-400 text-white cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700 cursor-pointer'
                    }`}>
                      {isProcessingPdf ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                          Processing PDF...
                        </>
                      ) : (
                        <>
                          <Upload className="h-4 w-4" />
                          Upload CV (PDF)
                        </>
                      )}
                    </div>
                  </label>
                  {pdfError && (
                    <div className="text-red-600 text-xs bg-red-50 border border-red-200 rounded p-2">
                      {pdfError}
                    </div>
                  )}
                </div>
              </div>

              <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-2">
                <User className="h-5 w-5 text-gray-700 dark:text-gray-200" />
                Personal Info
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                  <input type="text" value={formData.name} onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))} className="w-full p-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500" placeholder="John Doe" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input type="email" value={formData.email} onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))} className="w-full p-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500" placeholder="john@example.com" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                  <input type="tel" value={formData.phone} onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))} className="w-full p-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500" placeholder="+1 (555) 123-4567" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                  <input type="text" value={formData.location} onChange={(e) => setFormData(prev => ({ ...prev, location: e.target.value }))} className="w-full p-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500" placeholder="San Francisco, CA" />
                </div>
              </div>
              {/* Links */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Links (LinkedIn, GitHub, etc.)</label>
                {formData.links.map((link, index) => (
                  <div key={index} className="flex gap-2 mb-2">
                    <input
                      type="url"
                      value={link}
                      onChange={(e) => {
                        const newLinks = [...formData.links];
                        newLinks[index] = e.target.value;
                        setFormData(prev => ({ ...prev, links: newLinks }));
                      }}
                      className="flex-1 p-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                      placeholder="https://linkedin.com/in/yourprofile"
                    />
                    {formData.links.length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          const newLinks = formData.links.filter((_, i) => i !== index);
                          setFormData(prev => ({ ...prev, links: newLinks }));
                        }}
                        className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, links: [...prev.links, ''] }))}
                  className="text-blue-600 hover:text-blue-700 text-sm"
                >
                  + Add Link
                </button>
              </div>

              {/* Certifications */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Certifications</label>
                {formData.certifications.map((cert, index) => (
                  <div key={index} className="flex gap-2 mb-2">
                    <input
                      type="text"
                      value={cert}
                      onChange={(e) => {
                        const newCerts = [...formData.certifications];
                        newCerts[index] = e.target.value;
                        setFormData(prev => ({ ...prev, certifications: newCerts }));
                      }}
                      className="flex-1 p-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                      placeholder="AWS Certified Solutions Architect"
                    />
                    {formData.certifications.length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          const newCerts = formData.certifications.filter((_, i) => i !== index);
                          setFormData(prev => ({ ...prev, certifications: newCerts }));
                        }}
                        className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, certifications: [...prev.certifications, ''] }))}
                  className="text-blue-600 hover:text-blue-700 text-sm"
                >
                  + Add Certification
                </button>
              </div>

              {/* Education */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Education</label>
                {formData.education.map((edu, index) => (
                  <div key={index} className="flex gap-2 mb-2">
                    <input
                      type="text"
                      value={edu}
                      onChange={(e) => {
                        const newEdu = [...formData.education];
                        newEdu[index] = e.target.value;
                        setFormData(prev => ({ ...prev, education: newEdu }));
                      }}
                      className="flex-1 p-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                      placeholder="Bachelor of Computer Science, Stanford University (2020)"
                    />
                    {formData.education.length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          const newEdu = formData.education.filter((_, i) => i !== index);
                          setFormData(prev => ({ ...prev, education: newEdu }));
                        }}
                        className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, education: [...prev.education, ''] }))}
                  className="text-blue-600 hover:text-blue-700 text-sm"
                >
                  + Add Education
                </button>
              </div>

              {/* Skills */}
              <div className="space-y-6">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-2">
                  <Target className="h-5 w-5 text-gray-700 dark:text-gray-200" />
                  Skills
                </h3>
                {/* Skills */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">Skills by Category</label>
                  {formData.skills.map((skill, skillIndex) => (
                    <div key={skillIndex} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 mb-4 bg-white dark:bg-gray-900">
                      {/* Category Header */}
                      <div className="flex gap-2 mb-4">
                        <div className="flex-1">
                          <label className="block text-xs font-medium text-gray-600 mb-1">Category Name</label>
                          <input
                            type="text"
                            value={skill.category}
                            onChange={(e) => {
                              const newSkills = [...formData.skills];
                              newSkills[skillIndex].category = e.target.value;
                              setFormData(prev => ({ ...prev, skills: newSkills }));
                            }}
                            className="w-full p-3 border-2 border-blue-200 dark:border-blue-800 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-400 bg-white dark:bg-gray-800 dark:text-gray-100 font-medium"
                            placeholder="Programming Languages"
                          />
                        </div>
                        {formData.skills.length > 1 && (
                          <div className="flex items-end">
                            <button
                              type="button"
                              onClick={() => {
                                const newSkills = formData.skills.filter((_, i) => i !== skillIndex);
                                setFormData(prev => ({ ...prev, skills: newSkills }));
                              }}
                              className="px-3 py-3 text-red-600 hover:bg-red-50 rounded-lg border border-red-200"
                            >
                              Remove Category
                            </button>
                          </div>
                        )}
                      </div>
                      {/* Skills Items */}
                      <div className="space-y-2">
                        <label className="block text-xs font-medium text-gray-600 mb-2">Skills in this category</label>
                        {skill.items.map((item, itemIndex) => (
                          <div key={itemIndex} className="flex gap-2">
                            <input
                              type="text"
                              value={item}
                              onChange={(e) => {
                                const newSkills = [...formData.skills];
                                newSkills[skillIndex].items[itemIndex] = e.target.value;
                                setFormData(prev => ({ ...prev, skills: newSkills }));
                              }}
                              className="flex-1 p-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                              placeholder="JavaScript, Python, Java"
                            />
                            {skill.items.length > 1 && (
                              <button
                                type="button"
                                onClick={() => {
                                  const newSkills = [...formData.skills];
                                  newSkills[skillIndex].items = newSkills[skillIndex].items.filter((_, i) => i !== itemIndex);
                                  setFormData(prev => ({ ...prev, skills: newSkills }));
                                }}
                                className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg text-sm"
                              >
                                Remove
                              </button>
                            )}
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => {
                            const newSkills = [...formData.skills];
                            newSkills[skillIndex].items.push('');
                            setFormData(prev => ({ ...prev, skills: newSkills }));
                          }}
                          className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                        >
                          + Add Skill to this Category
                        </button>
                      </div>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, skills: [...prev.skills, { category: '', items: [''] }] }))}
                    className="text-blue-600 hover:text-blue-700 text-sm font-medium border border-blue-200 rounded-lg px-4 py-2 hover:bg-blue-50"
                  >
                    + Add New Skill Category
                  </button>
                </div>

                {/* Experience */}
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-2">
                  <Target className="h-5 w-5 text-gray-700 dark:text-gray-200" />
                  Experience
                </h3>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">Work Experience</label>
                  {formData.experience.map((exp, expIndex) => (
                    <div key={expIndex} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 mb-4 bg-white dark:bg-gray-900">
                      {/* Job Header */}
                      <div className="mb-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Job Title</label>
                            <input
                              type="text"
                              value={exp.title}
                              onChange={(e) => {
                                const newExp = [...formData.experience];
                                newExp[expIndex].title = e.target.value;
                                setFormData(prev => ({ ...prev, experience: newExp }));
                              }}
                              className="w-full p-3 border-2 border-blue-200 dark:border-blue-800 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-400 bg-white dark:bg-gray-800 dark:text-gray-100 font-medium"
                              placeholder="Software Engineer"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Company</label>
                            <input
                              type="text"
                              value={exp.company}
                              onChange={(e) => {
                                const newExp = [...formData.experience];
                                newExp[expIndex].company = e.target.value;
                                setFormData(prev => ({ ...prev, experience: newExp }));
                              }}
                              className="w-full p-3 border-2 border-blue-200 dark:border-blue-800 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-400 bg-white dark:bg-gray-800 dark:text-gray-100 font-medium"
                              placeholder="Tech Corp"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Location</label>
                            <input
                              type="text"
                              value={exp.location}
                              onChange={(e) => {
                                const newExp = [...formData.experience];
                                newExp[expIndex].location = e.target.value;
                                setFormData(prev => ({ ...prev, experience: newExp }));
                              }}
                              className="w-full p-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                              placeholder="San Francisco, CA"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Duration</label>
                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={exp.start}
                                onChange={(e) => {
                                  const newExp = [...formData.experience];
                                  newExp[expIndex].start = e.target.value;
                                  setFormData(prev => ({ ...prev, experience: newExp }));
                                }}
                                className="flex-1 p-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                                placeholder="2020-01"
                              />
                              <span className="flex items-center text-gray-500 text-sm">to</span>
                              <input
                                type="text"
                                value={exp.end}
                                onChange={(e) => {
                                  const newExp = [...formData.experience];
                                  newExp[expIndex].end = e.target.value;
                                  setFormData(prev => ({ ...prev, experience: newExp }));
                                }}
                                className="flex-1 p-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                                placeholder="Present"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                      {/* Achievements Section */}
                      <div className="space-y-2">
                        <label className="block text-xs font-medium text-gray-600 mb-2">Key Achievements</label>
                        {exp.achievements.map((achievement, achIndex) => (
                          <div key={achIndex} className="flex gap-2">
                            <textarea
                              value={achievement}
                              onChange={(e) => {
                                const newExp = [...formData.experience];
                                newExp[expIndex].achievements[achIndex] = e.target.value;
                                setFormData(prev => ({ ...prev, experience: newExp }));
                              }}
                              className="flex-1 p-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none bg-white dark:bg-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                              placeholder="Developed web applications using React and Node.js"
                              rows="2"
                            />
                            {exp.achievements.length > 1 && (
                              <button
                                type="button"
                                onClick={() => {
                                  const newExp = [...formData.experience];
                                  newExp[expIndex].achievements = newExp[expIndex].achievements.filter((_, i) => i !== achIndex);
                                  setFormData(prev => ({ ...prev, experience: newExp }));
                                }}
                                className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg text-sm"
                              >
                                Remove
                              </button>
                            )}
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => {
                            const newExp = [...formData.experience];
                            newExp[expIndex].achievements.push('');
                            setFormData(prev => ({ ...prev, experience: newExp }));
                          }}
                          className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                        >
                          + Add Achievement
                        </button>
                      </div>
                      {formData.experience.length > 1 && (
                        <div className="mt-3 pt-3 border-t border-gray-200">
                          <button
                            type="button"
                            onClick={() => {
                              const newExp = formData.experience.filter((_, i) => i !== expIndex);
                              setFormData(prev => ({ ...prev, experience: newExp }));
                            }}
                            className="text-red-600 hover:text-red-700 text-sm"
                          >
                            Remove Experience
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({ 
                      ...prev, 
                      experience: [...prev.experience, {
                        roleId: '',
                        title: '',
                        company: '',
                        location: '',
                        start: '',
                        end: '',
                        achievements: ['']
                      }]
                    }))}
                    className="text-blue-600 hover:text-blue-700 text-sm font-medium border border-blue-200 rounded-lg px-4 py-2 hover:bg-blue-50"
                  >
                    + Add New Work Experience
                  </button>
                </div>
              </div>

              {/* Save Button */}
              <div className="flex justify-end pt-6 border-t">
                <button type="button" onClick={async () => { await saveUserInfo(); setCurrentPage('main'); }} disabled={isSaving || !isValidFormData()} className="px-6 py-3 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
                  {isSaving ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border border-white border-t-transparent"></div>
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      Save & Continue
                    </>
                  )}
                </button>
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
              <h1 className="text-4xl font-bold text-white">TailorCV</h1>
            </div>
            <p className="text-gray-300 text-lg mb-2">AI-Powered CV Optimization</p>
            <p className="text-gray-400">Transform your CV to match any job description with precision and professionalism</p>
          </div>
          
          <div className="bg-gray-800 rounded-xl shadow-2xl p-8 border border-gray-700">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-semibold text-white mb-2">Get Started</h2>
              <p className="text-gray-400">Sign in to save your templates and optimize your CV</p>
            </div>
            
            <Auth user={user} onAuthChange={setUser} />
            
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
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-lg overflow-hidden">
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-4 sm:p-8 dark:from-gray-800 dark:to-gray-700">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
              <div className="flex items-center gap-3">
              <Target className="h-8 w-8" />
              <h1 className="text-3xl font-bold">RoleReady</h1>
              </div>
              <Auth user={user} onAuthChange={setUser} onToggleTheme={() => setIsDark(v=>!v)} isDark={isDark} />
            </div>
            <p className="text-blue-100 text-lg dark:text-gray-300">Maximize your ATS compatibility while maintaining professional readability</p>
          </div>

          <div className="p-4 sm:p-8 space-y-8 text-gray-900 dark:text-gray-100">
            
            {/* Buttons Section - Full Width */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="text-sm text-gray-600"></div>
              <div className="flex items-center gap-2">
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

            {/* Responsive Layout: Single column on mobile, two columns on desktop */}
            <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-8 min-h-[70vh]">
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
              
              {/* Left Column: Job Description */}
              <div className="flex flex-col gap-6 h-full">
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

                <button
                  onClick={handleOptimize}
                  disabled={isProcessing}
                  className="mt-auto w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-3 px-6 rounded-lg font-semibold inline-flex items-center justify-center gap-2 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
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
                    </>
                  )}
                </button>
              </div>

              {/* Right Column: Results */}
              <div className="flex flex-col gap-6 h-full">
                {/* JD share warning moved into Analysis modal */}
                <div className="flex-1 flex flex-col min-h-[40vh]">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Target className="h-5 w-5 text-gray-600" />
                      <label className="text-lg font-semibold text-gray-700">Optimized CV Preview</label>
                    </div>
                  </div>
                  <div id="cv-preview" className="flex-1 p-0 border border-gray-300 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 overflow-auto">
                    {structuredCv ? (
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
                      disabled={!optimizedCv}
                      className="w-full bg-green-600 hover:bg-green-700 text-white py-3 px-6 rounded-lg font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
                    >
                      <Download className="h-4 w-4" />
                      Download PDF
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
              </div>

                      
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
                      <li>Download as HTML and print to PDF for best formatting results.</li>
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

            {/* Optimization Tips moved to modal */}
          </div>
        </div>
      </div>
    </div>
    </div>
  );
};

export default CVOptimizer;


