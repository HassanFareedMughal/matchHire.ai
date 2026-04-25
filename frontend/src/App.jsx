import React, { useState } from 'react';
import axios from 'axios';

// --- Score Breakdown Component ---
function ScoreBreakdown({ breakdown, expanded, onToggle }) {
  if (!breakdown) return null;

  const bars = [
    { label: 'Skill Recall', value: breakdown.skill_recall, color: 'bg-[#2563EB]', weight: '55%' },
    { label: 'Semantic Match', value: breakdown.tfidf_semantic, color: 'bg-indigo-500', weight: '20%' },
    { label: 'Placement Bonus', value: breakdown.position_bonus, color: 'bg-teal-500', weight: '15%' },
    { label: 'Extra Skills', value: breakdown.extra_skills, color: 'bg-[#F59E0B]', weight: '10%' },
  ];

  return (
    <div className="mt-6 border-t border-[#E2E8F0] pt-4 w-full">
      <button
        onClick={onToggle}
        className="flex items-center gap-2 text-sm font-medium text-[#2563EB] hover:text-[#1D4ED8] transition-colors mb-3 select-none focus:outline-none"
      >
        <svg
          className={`w-4 h-4 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        {expanded ? 'Hide Details' : 'View Breakdown'}
      </button>

      {expanded && (
        <div className="space-y-5 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="space-y-3">
            {bars.map(({ label, value, color, weight }) => (
              <div key={label}>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-medium text-gray-600">{label} <span className="text-gray-400 font-normal ml-1">({weight})</span></span>
                  <span className="text-xs font-bold text-gray-700">{Math.round(value * 100)}%</span>
                </div>
                <div className="h-1.5 bg-[#E2E8F0] rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${color} transition-all duration-700`}
                    style={{ width: `${Math.round(value * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-3 pt-2">
            {breakdown.matched_skills?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-[#16A34A] mb-1.5">Matched Skills</p>
                <div className="flex flex-wrap gap-1.5">
                  {breakdown.matched_skills.map(skill => (
                    <span key={skill} className="text-xs px-2.5 py-1 rounded-md bg-green-50 text-green-700 border border-green-100 font-medium">
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {breakdown.missing_skills?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-[#DC2626] mb-1.5">Missing Skills</p>
                <div className="flex flex-wrap gap-1.5">
                  {breakdown.missing_skills.map(skill => (
                    <span key={skill} className="text-xs px-2.5 py-1 rounded-md bg-red-50 text-red-600 border border-red-100 font-medium">
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {breakdown.extra_skills_list?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-[#F59E0B] mb-1.5">Bonus Skills</p>
                <div className="flex flex-wrap gap-1.5">
                  {breakdown.extra_skills_list.slice(0, 10).map(skill => (
                    <span key={skill} className="text-xs px-2.5 py-1 rounded-md bg-amber-50 text-amber-700 border border-amber-100 font-medium">
                      {skill}
                    </span>
                  ))}
                  {breakdown.extra_skills_list.length > 10 && (
                    <span className="text-xs px-2 py-1 text-gray-500">+{breakdown.extra_skills_list.length - 10} more</span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [formData, setFormData] = useState({ resume: '', keyword: '', location: '' });
  const [fileName, setFileName] = useState('');
  const [results, setResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState({});

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const toggleBreakdown = (i) => {
    setExpanded(prev => ({ ...prev, [i]: !prev[i] }));
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      setError('Please upload a valid PDF file.');
      return;
    }

    setFileName(file.name);
    const uploadData = new FormData();
    uploadData.append('resume', file);
    setIsUploading(true);
    setError(null);

    try {
      const response = await axios.post('http://localhost:5000/api/upload-resume', uploadData);
      if (response.data?.success) {
        setFormData(prev => ({ ...prev, resume: response.data.text }));
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to upload and extract PDF.');
      setFileName('');
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const findJobs = async () => {
    if (!formData.resume.trim() || !formData.keyword.trim() || !formData.location.trim()) {
      setError('Please fill out all fields (Resume, Keyword, Location) before finding jobs.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setResults([]);
    setExpanded({});

    try {
      const response = await axios.post(
        'http://localhost:5000/api/match',
        { resume: formData.resume, keyword: formData.keyword, location: formData.location },
        { headers: { 'Content-Type': 'application/json' } }
      );

      if (response.data?.matches) {
        setResults(response.data.matches);
      } else if (Array.isArray(response.data)) {
        setResults(response.data);
      } else {
        setResults([]);
      }
    } catch (err) {
      setError(
        err.response?.data?.error ||
        err.response?.data?.message ||
        err.message ||
        'An error occurred while finding jobs. Please try again.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const getScoreColor = (scoreValue) => {
    if (scoreValue >= 80) return 'bg-[#16A34A] text-white';
    if (scoreValue >= 50) return 'bg-[#F59E0B] text-white';
    return 'bg-[#DC2626] text-white';
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] font-sans text-gray-700 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-10">
        
        {/* 1. HERO SECTION */}
        <div className="text-center space-y-3">
          <h1 className="text-3xl font-bold tracking-tight text-[#0F172A]">
            matchHire.ai
          </h1>
          <p className="text-lg text-gray-600 max-w-xl mx-auto">
            AI-powered job matching using your resume
          </p>
        </div>

        {/* MAIN FORM CARD */}
        <div className="bg-[#FFFFFF] shadow-md shadow-slate-200/50 rounded-2xl p-6 sm:p-8 border border-[#E2E8F0] space-y-8">
          
          {/* ERROR HANDLING */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-start gap-3 transition-all duration-200">
              <svg className="w-5 h-5 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span className="text-sm font-medium">{error}</span>
            </div>
          )}

          {/* 2. RESUME UPLOAD */}
          <div className="space-y-3">
            <label className="block text-sm font-semibold text-[#0F172A]">
              1. Upload Your Resume
            </label>
            <div className="relative border-2 border-dashed border-[#E2E8F0] hover:border-[#2563EB] transition-colors duration-200 rounded-xl p-8 text-center bg-[#F8FAFC]">
              <input
                type="file"
                accept=".pdf"
                onChange={handleFileUpload}
                disabled={isUploading || isLoading}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
              />
              <div className="space-y-2 pointer-events-none">
                <svg className="mx-auto h-10 w-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                {isUploading ? (
                  <p className="text-sm font-medium text-[#2563EB]">Extracting text from PDF...</p>
                ) : (
                  <>
                    <p className="text-sm font-medium text-[#0F172A]">Drag & drop or click to upload</p>
                    <p className="text-xs text-gray-500">PDF format only</p>
                  </>
                )}
              </div>
            </div>
            
            {fileName && !isUploading && (
              <div className="flex items-center gap-2 text-sm text-[#16A34A] bg-green-50 px-4 py-2.5 rounded-lg border border-green-100 transition-all">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
                <span className="font-medium truncate">Successfully loaded: {fileName}</span>
              </div>
            )}

            <div className="mt-4">
              <label htmlFor="resume" className="block text-xs font-medium text-gray-500 mb-1.5 focus-within:text-[#2563EB] transition-colors">
                Parsed Text (Review or Edit)
              </label>
              <textarea
                id="resume"
                name="resume"
                rows="4"
                value={formData.resume}
                onChange={handleChange}
                disabled={isUploading || isLoading}
                placeholder="Or paste your resume text manually here..."
                className="w-full px-4 py-3 rounded-xl border border-[#E2E8F0] focus:ring-2 focus:ring-[#2563EB] focus:border-[#2563EB] outline-none transition-shadow text-sm text-gray-700 resize-y bg-white disabled:bg-gray-50"
              />
            </div>
          </div>

          {/* 3. SEARCH INPUTS */}
          <div className="space-y-3 pt-2 border-t border-[#E2E8F0]">
            <label className="block text-sm font-semibold text-[#0F172A] mt-4">
              2. Job Preferences
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <input
                  type="text"
                  name="keyword"
                  value={formData.keyword}
                  onChange={handleChange}
                  placeholder="Job Keyword (e.g. Developer)"
                  className="w-full px-4 py-3 rounded-xl border border-[#E2E8F0] focus:ring-2 focus:ring-[#2563EB] focus:border-[#2563EB] outline-none transition-shadow text-sm disabled:bg-gray-50 text-gray-700"
                  disabled={isLoading}
                />
              </div>
              <div>
                <input
                  type="text"
                  name="location"
                  value={formData.location}
                  onChange={handleChange}
                  placeholder="Location (e.g. Remote, NY)"
                  className="w-full px-4 py-3 rounded-xl border border-[#E2E8F0] focus:ring-2 focus:ring-[#2563EB] focus:border-[#2563EB] outline-none transition-shadow text-sm disabled:bg-gray-50 text-gray-700"
                  disabled={isLoading}
                />
              </div>
            </div>
          </div>

          {/* 4. MAIN BUTTON */}
          <div className="pt-2">
            <button
              onClick={findJobs}
              disabled={isLoading || isUploading}
              className="w-full sm:mx-auto sm:block sm:max-w-xs bg-[#2563EB] hover:bg-[#1D4ED8] disabled:bg-blue-300 text-white font-semibold py-3.5 px-8 rounded-xl shadow-md hover:shadow-lg transform transition-all duration-200 hover:scale-105 active:scale-95 flex items-center justify-center gap-2 outline-none focus:ring-4 focus:ring-blue-100"
            >
              {isLoading ? (
                <span>Searching...</span>
              ) : (
                <span>Find Jobs</span>
              )}
            </button>
          </div>
        </div>

        {/* 5. LOADING STATE */}
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-14 space-y-5 animate-in fade-in duration-300 bg-white shadow-sm border border-[#E2E8F0] rounded-2xl">
            <div className="w-10 h-10 border-4 border-blue-100 border-t-[#2563EB] rounded-full animate-spin"></div>
            <p className="text-[#0F172A] font-medium text-lg text-center">Analyzing your resume & finding matches...</p>
          </div>
        )}

        {/* 6. RESULTS GRID */}
        {!isLoading && results.length > 0 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-2xl font-bold text-[#0F172A]">
              Top Matches <span className="ml-2 text-sm bg-blue-50 text-[#2563EB] py-1 px-2.5 rounded-lg border border-blue-100">{results.length}</span>
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {results.map((job, index) => {
                const scoreRaw = job.score ?? job.matchScore ?? 0;
                const scorePct = Math.round(scoreRaw * 100);
                
                return (
                  <div
                    key={index}
                    className="bg-[#FFFFFF] rounded-xl p-6 shadow-md hover:shadow-lg hover:-translate-y-1 border border-[#E2E8F0] transition-all duration-200 flex flex-col justify-between"
                  >
                    <div className="space-y-4">
                      <div className="flex justify-between items-start gap-4">
                        <div className="flex-1">
                          <h3 className="font-bold text-lg text-[#0F172A] leading-snug">
                            {job.title || job.job_title}
                          </h3>
                          <p className="text-sm text-gray-600 mt-1.5 font-medium">
                            {job.company || job.company_name || 'Unknown Company'}
                            {(job.location) && <span className="text-gray-400 font-normal"> • {job.location}</span>}
                          </p>
                        </div>
                        <div className={`shrink-0 px-3.5 py-1.5 rounded-full font-bold text-sm tracking-wide shadow-sm whitespace-nowrap ${getScoreColor(scorePct)}`}>
                          {scorePct}%
                        </div>
                      </div>
                    </div>
                    
                    <div className="mt-8 flex flex-col items-start gap-4 w-full">
                      <a
                        href={job.applyLink || job.apply_link || job.job_apply_link || '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-medium py-2.5 px-5 rounded-lg transition-colors duration-200 text-sm text-center shadow-sm"
                      >
                        Apply Now
                      </a>
                      
                      {/* Score Breakdown (collapsible) */}
                      {job.score_breakdown && (
                        <ScoreBreakdown
                          breakdown={job.score_breakdown}
                          expanded={!!expanded[index]}
                          onToggle={() => toggleBreakdown(index)}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
