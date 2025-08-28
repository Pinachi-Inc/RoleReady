import React, { useState, useEffect } from 'react';
import { Download, FileText, Target, Zap, AlertCircle, Save } from 'lucide-react';
import { convertMarkdownToHtml } from '../utils/markdown.js';
import { generateDownloadHtml, downloadHtml } from '../utils/download.js';
import { renderCvHtml } from '../src/templateRenderer.js';
import { optimizeCv as optimizeCvService } from '../services/openai.js';
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
  const [showInstructions, setShowInstructions] = useState(false);
  const [user, setUser] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showUserInfoModal, setShowUserInfoModal] = useState(false);

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
      await saveUserData(user.uid, {
        aiUserInfo,
        fixedUserInfo,
        lastUpdated: new Date().toISOString()
      });
      alert('User information saved successfully!');
    } catch (error) {
      console.error('Error saving user data:', error);
      alert('Failed to save user information. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const downloadCv = () => {
    if (structuredCv) {
      const html = renderCvHtml(structuredCv);
      downloadHtml(html, 'optimized-cv.html');
      return;
    }
    const htmlFallback = generateDownloadHtml(optimizedCv);
    downloadHtml(htmlFallback, 'optimized-cv.html');
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
      const { cvContent, keywords: kws, keywordsFiltered: kf, cv, needsFix: nf, stats: st } = await optimizeCvService({
        jobDescription,
        aiUserInfo,
        fixedUserInfo
      });
      setOptimizedCv(cvContent);
      setStructuredCv(cv || null);
      setKeywords(kf && kf.length ? kf : kws);
      setNeedsFix(Boolean(nf));
      setStats(st || null);
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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-4 sm:p-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
              <div className="flex items-center gap-3">
              <Target className="h-8 w-8" />
              <h1 className="text-3xl font-bold">CV Optimization Tool</h1>
              </div>
              <Auth user={user} onAuthChange={setUser} />
            </div>
            <p className="text-blue-100 text-lg">Maximize your ATS compatibility while maintaining professional readability</p>
          </div>

          <div className="p-4 sm:p-8 space-y-8">
            
            {/* Buttons Section - Full Width */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="text-sm text-gray-600">Configure your optimization</div>
              <div className="flex items-center gap-2">
                {user && (
                  <button
                    type="button"
                    onClick={() => setShowUserInfoModal(true)}
                    className="px-3 py-1.5 rounded-md text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-1"
                  >
                    <FileText className="h-3 w-3" />
                    User Info
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowInstructions(true)}
                  className="px-3 py-1.5 rounded-md text-sm font-medium bg-gray-800 text-white hover:bg-gray-700"
                >
                  User Instructions
                </button>
              </div>
                </div>

            {/* Responsive Layout: Single column on mobile, two columns on desktop */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              
              {/* Left Column: Job Description */}
              <div className="space-y-6">
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <FileText className="h-5 w-5 text-gray-600" />
                    <label className="text-lg font-semibold text-gray-700">Job Description</label>
                  </div>
                  <textarea
                    value={jobDescription}
                    onChange={(e) => setJobDescription(e.target.value)}
                    placeholder="Paste the complete job posting here..."
                    className="w-full h-64 sm:h-96 p-4 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <button
                  onClick={handleOptimize}
                  disabled={isProcessing}
                  className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-3 px-6 rounded-lg font-semibold flex items-center justify-center gap-2 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
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
              <div className="space-y-6">
                {needsFix && (
                  <div className="p-3 rounded-md bg-red-50 border border-red-200 text-red-800 text-sm">
                    The result may not fully meet the constraints (e.g., JD keyword share or category sizes). You can still download, but consider refining the inputs.
                  </div>
                )}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Target className="h-5 w-5 text-gray-600" />
                      <label className="text-lg font-semibold text-gray-700">Optimized CV Preview</label>
                    </div>
                    {optimizedCv && (
                      <button
                        onClick={downloadCv}
                        className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors"
                      >
                        <Download className="h-4 w-4" />
                        Download PDF
                      </button>
                    )}
                  </div>
                  <div className="h-96 p-0 border border-gray-300 rounded-lg bg-gray-50 overflow-hidden">
                    {structuredCv ? (
                      <iframe
                        title="CV Preview"
                        style={{ width: '100%', height: '100%', border: '0' }}
                        srcDoc={renderCvHtml(structuredCv)}
                      />
                    ) : optimizedCv ? (
                      <div className="p-4 prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: convertMarkdownToHtml(optimizedCv) }} />
                    ) : (
                      <p className="p-4 text-gray-500 italic">Optimized CV will appear here after processing...</p>
                    )}
                  </div>
                </div>

                {keywords.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold text-gray-700 mb-3">Keywords Integrated</h3>
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
                  <div className="text-sm text-gray-700">
                    <h3 className="text-lg font-semibold text-gray-700 mb-2">AI Stats</h3>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-gray-50 border border-gray-200 rounded p-2">JD Share: {(stats.jdShare * 100).toFixed(0)}%</div>
                      <div className="bg-gray-50 border border-gray-200 rounded p-2">Categories: {stats.categories}</div>
                      <div className="bg-gray-50 border border-gray-200 rounded p-2">Total Skills: {stats.totalSkills}</div>
                      {Array.isArray(stats.categorySizeViolations) && stats.categorySizeViolations.length > 0 && (
                        <div className="col-span-2 bg-yellow-50 border border-yellow-200 rounded p-2">
                          Category size issues: {stats.categorySizeViolations.join(', ')}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {showUserInfoModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center">
                <div className="absolute inset-0 bg-black/50" onClick={() => setShowUserInfoModal(false)}></div>
                <div className="relative bg-white w-full max-w-2xl mx-4 rounded-lg shadow-xl overflow-hidden">
                  <div className="flex items-center justify-between px-6 py-4 border-b">
                    <h3 className="text-xl font-semibold text-gray-800">User Information</h3>
                    <button
                      type="button"
                      onClick={() => setShowUserInfoModal(false)}
                      className="text-gray-500 hover:text-gray-800"
                      aria-label="Close"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="p-6 space-y-6">
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <FileText className="h-5 w-5 text-gray-600" />
                        <label className="text-lg font-semibold text-gray-700">Skills & Experience Data</label>
                      </div>
                      <textarea
                        value={aiUserInfo}
                        onChange={(e) => setAiUserInfo(e.target.value)}
                        placeholder="Provide only what the AI needs: base skills list; per role: title, company, dates, bullet pool to rewrite."
                        className="w-full h-48 p-4 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>

                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <FileText className="h-5 w-5 text-gray-600" />
                        <label className="text-lg font-semibold text-gray-700">Personal Information</label>
                      </div>
                      <textarea
                        value={fixedUserInfo}
                        onChange={(e) => setFixedUserInfo(e.target.value)}
                        placeholder={`JSON preferred: {"name":"...", "contact":{...}, "certifications":[...], "education":[...] }`}
                        className="w-full h-40 p-4 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                  <div className="px-6 py-4 border-t bg-gray-50 flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => setShowUserInfoModal(false)}
                      className="px-4 py-2 rounded-md bg-gray-200 text-gray-700 text-sm hover:bg-gray-300"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await saveUserInfo();
                        setShowUserInfoModal(false);
                      }}
                      disabled={isSaving}
                      className="px-4 py-2 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                    >
                      {isSaving ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border border-white border-t-transparent"></div>
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save className="h-4 w-4" />
                          Save
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {showInstructions && (
              <div className="fixed inset-0 z-50 flex items-center justify-center">
                <div className="absolute inset-0 bg-black/50" onClick={() => setShowInstructions(false)}></div>
                <div className="relative bg-white w-full max-w-4xl mx-4 rounded-lg shadow-xl overflow-hidden">
                  <div className="flex items-center justify-between px-6 py-4 border-b">
                    <h3 className="text-xl font-semibold text-gray-800">User Instructions</h3>
                    <button
                      type="button"
                      onClick={() => setShowInstructions(false)}
                      className="text-gray-500 hover:text-gray-800"
                      aria-label="Close"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
                    
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <h4 className="font-semibold text-blue-900 mb-2">How to use with other LLMs</h4>
                      <p className="text-blue-800 text-sm">Open ChatGPT, Claude, Gemini, or any LLM, attach your current CV, and use the prompts below to get the required JSON formats.</p>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <h4 className="font-semibold text-gray-700 mb-2">1. Skills & Experience Data Prompt</h4>
                        <p className="text-sm text-gray-600 mb-2">Use this prompt to extract your CV data:</p>
                        <textarea
                          readOnly
                          value={`Analyze my CV and extract the information in this exact JSON format:

{
  "coreSkillsBase": [
    { "category": "Programming Languages", "items": ["JavaScript", "Python", "Java"] },
    { "category": "Frameworks", "items": ["React", "Node.js", "Express"] }
  ],
  "experienceSource": [
    {
      "roleId": "job1",
      "title": "Software Developer",
      "company": "Tech Corp",
      "location": "New York, NY",
      "start": "2020-01",
      "end": "Present",
      "baseAchievements": [
        "Developed web applications using React and Node.js",
        "Improved system performance by 40%",
        "Led a team of 3 developers"
      ]
    }
  ]
}

Extract all my skills organized by categories, and all my work experience with achievements. Return only the JSON, no explanation.`}
                          className="w-full h-40 p-3 text-xs bg-gray-100 border border-gray-300 rounded font-mono resize-none"
                        />
                      </div>

                      <div>
                        <h4 className="font-semibold text-gray-700 mb-2">2. Personal Information Prompt</h4>
                        <p className="text-sm text-gray-600 mb-2">Use this prompt to extract your personal information:</p>
                        <textarea
                          readOnly
                          value={`Extract my personal information from the CV in this exact JSON format:

{
  "name": "Your Full Name",
  "contact": {
    "email": "your.email@example.com",
    "phone": "+1234567890",
    "location": "City, State",
    "links": ["https://linkedin.com/in/yourprofile", "https://github.com/yourusername"]
  },
  "certifications": ["AWS Certified", "Google Cloud Professional"],
  "education": ["Bachelor of Computer Science, University Name (2020)", "Master of Engineering, University Name (2022)"]
}

Extract my name, contact details, certifications, and education. Return only the JSON, no explanation.`}
                          className="w-full h-40 p-3 text-xs bg-gray-100 border border-gray-300 rounded font-mono resize-none"
                        />
                      </div>
                    </div>

                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                      <h4 className="font-semibold text-yellow-900 mb-2">📝 Instructions</h4>
                      <ol className="text-yellow-800 text-sm space-y-1">
                        <li>1. Copy each prompt separately</li>
                        <li>2. Paste into your preferred LLM (ChatGPT, Claude, Gemini)</li>
                        <li>3. Attach or paste your current CV</li>
                        <li>4. Get the JSON response and paste it into the corresponding field (Skills & Experience Data or Personal Information)</li>
                        <li>5. Save your info and start optimizing CVs!</li>
                      </ol>
                    </div>

                  </div>
                  <div className="px-6 py-4 border-t bg-gray-50 text-right">
                    <button
                      type="button"
                      onClick={() => setShowInstructions(false)}
                      className="px-4 py-2 rounded-md bg-gray-800 text-white text-sm hover:bg-gray-700"
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-6 w-6 text-blue-600 mt-1 flex-shrink-0" />
                <div>
                  <h3 className="text-lg font-semibold text-blue-900 mb-2">Optimization Tips</h3>
                  <ul className="text-blue-800 space-y-1 text-sm">
                    <li>• Use the complete job posting, including requirements and preferred qualifications</li>
                    <li>• Provide detailed CV content with specific achievements and metrics</li>
                    <li>• Review the optimized CV to ensure it accurately represents your experience</li>
                    <li>• Download as HTML and print to PDF for best formatting results</li>
                    <li>• Always customize further based on your specific industry and role</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CVOptimizer;


