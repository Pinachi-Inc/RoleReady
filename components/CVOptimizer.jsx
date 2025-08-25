import React, { useState } from 'react';
import { Download, FileText, Target, Zap, AlertCircle } from 'lucide-react';
import { convertMarkdownToHtml } from '../utils/markdown.js';
import { generateDownloadHtml, downloadHtml } from '../utils/download.js';
import { renderCvHtml } from '../src/templateRenderer.js';
import { optimizeCv as optimizeCvService } from '../services/openai.js';

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
  const [showSchemas, setShowSchemas] = useState(false);

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-8">
            <div className="flex items-center gap-3 mb-4">
              <Target className="h-8 w-8" />
              <h1 className="text-3xl font-bold">CV Optimization Tool</h1>
            </div>
            <p className="text-blue-100 text-lg">Maximize your ATS compatibility while maintaining professional readability</p>
          </div>

          <div className="p-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-600">Schemas for guidance</div>
                  <button
                    type="button"
                    onClick={() => setShowSchemas(true)}
                    className="px-3 py-1.5 rounded-md text-sm font-medium bg-gray-800 text-white hover:bg-gray-700"
                  >
                    View JSON Schemas
                  </button>
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <FileText className="h-5 w-5 text-gray-600" />
                    <label className="text-lg font-semibold text-gray-700">Job Description</label>
                  </div>
                  <textarea
                    value={jobDescription}
                    onChange={(e) => setJobDescription(e.target.value)}
                    placeholder="Paste the complete job posting here..."
                    className="w-full h-48 p-4 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <FileText className="h-5 w-5 text-gray-600" />
                    <label className="text-lg font-semibold text-gray-700">AI Input (skills, roles, bullets)</label>
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
                    <label className="text-lg font-semibold text-gray-700">Fixed User Info (not sent to AI)</label>
                  </div>
                  <textarea
                    value={fixedUserInfo}
                    onChange={(e) => setFixedUserInfo(e.target.value)}
                    placeholder={`JSON preferred: {"name":"...", "contact":{...}, "certifications":[...], "education":[...] }`}
                    className="w-full h-40 p-4 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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

            {showSchemas && (
              <div className="fixed inset-0 z-50 flex items-center justify-center">
                <div className="absolute inset-0 bg-black/50" onClick={() => setShowSchemas(false)}></div>
                <div className="relative bg-white w-full max-w-3xl rounded-lg shadow-xl overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b">
                    <h3 className="font-semibold text-gray-800">JSON Schemas</h3>
                    <button
                      type="button"
                      onClick={() => setShowSchemas(false)}
                      className="text-gray-500 hover:text-gray-800"
                      aria-label="Close"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[70vh] overflow-y-auto">
                    <div>
                      <div className="font-medium text-gray-700 mb-2">Fixed User Info (not sent to AI)</div>
                      <pre className="text-xs bg-gray-900 text-gray-100 rounded p-3 overflow-auto">{fixedInfoSchema}</pre>
                    </div>
                    <div>
                      <div className="font-medium text-gray-700 mb-2">AI Input (sent to AI)</div>
                      <pre className="text-xs bg-gray-900 text-gray-100 rounded p-3 overflow-auto">{aiInfoSchema}</pre>
                    </div>
                  </div>
                  <div className="px-4 py-3 border-t bg-gray-50 text-right">
                    <button
                      type="button"
                      onClick={() => setShowSchemas(false)}
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

      <style jsx>{`
        .prose .main-title { font-size: 1.5rem; font-weight: bold; text-align: center; margin-bottom: 0.5rem; color: #1f2937; }
        .prose .section-title { font-size: 1.25rem; font-weight: bold; margin-top: 1.5rem; margin-bottom: 0.75rem; color: #374151; border-bottom: 2px solid #e5e7eb; padding-bottom: 0.25rem; }
        .prose ul { margin: 0.5rem 0; }
        .prose li { margin-bottom: 0.25rem; }
        .prose p { margin-bottom: 0.5rem; }
      `}</style>
    </div>
  );
};

export default CVOptimizer;


