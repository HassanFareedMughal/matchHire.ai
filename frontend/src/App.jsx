import React, { useState } from 'react';
import axios from 'axios';
import { useEffect } from 'react';

// --- Score Breakdown Component ---
function ScoreBreakdown({ breakdown, expanded, onToggle, improvedComponents, inferenceMs }) {
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
          {(improvedComponents || inferenceMs != null) && (
            <div className="pt-3 border-t border-[#EEF2FF]">
              <p className="text-xs font-semibold text-indigo-700 mb-1.5">Hybrid (FYP‑II)</p>
              {improvedComponents && (
                <div className="text-xs text-gray-600">
                  Semantic used: <span className="font-medium">{String(improvedComponents.semantic_used)}</span>
                  {' — '}Skill recall: <span className="font-medium">{Math.round((improvedComponents.skill_recall ?? 0) * 100)}%</span>
                </div>
              )}
              {inferenceMs != null && (
                <div className="text-xs text-gray-500 mt-1">Semantic latency: <span className="font-medium">{Math.round(inferenceMs)} ms</span></div>
              )}
            </div>
          )}
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
  const [cacheStatus, setCacheStatus] = useState(null);
  const [sortBy, setSortBy] = useState('baseline');
  // Authentication state
  const [authToken, setAuthToken] = useState(localStorage.getItem('mh_token') || null);
  const [authUser, setAuthUser] = useState(JSON.parse(localStorage.getItem('mh_user') || 'null'));
  const [showAuth, setShowAuth] = useState(null); // 'login' | 'register' | null
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [showPwdLogin, setShowPwdLogin] = useState(false);
  const [showPwdRegister, setShowPwdRegister] = useState(false);
  // Controlled auth form state and validation errors
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [loginErrors, setLoginErrors] = useState(null);
  const [registerForm, setRegisterForm] = useState({ name: '', email: '', password: '' });
  const [registerErrors, setRegisterErrors] = useState(null);
  const statusPollingRef = React.useRef(null);

  useEffect(() => {
    if (authToken) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${authToken}`;
    } else {
      delete axios.defaults.headers.common['Authorization'];
    }

    // Load Google Identity Services script once if client id present
    const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!googleClientId) {
      console.warn('VITE_GOOGLE_CLIENT_ID is not set. Google Sign-In will not be available.');
    }

    if (googleClientId && !document.getElementById('google-identity')) {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.defer = true;
      s.id = 'google-identity';
      s.onload = () => {
        try {
          if (window.google && window.google.accounts && !window._mh_gsi_initialized) {
            console.info('GSI script loaded — initializing with client id');
            window.google.accounts.id.initialize({
              client_id: googleClientId,
              callback: async (resp) => {
                console.info('GSI callback received');
                if (!resp || !resp.credential) { setAuthError('No credential received from Google'); return; }
                setAuthLoading(true); setAuthError(null);
                try {
                  const r = await axios.post('http://localhost:5000/api/auth/google', { credential: resp.credential });
                  if (r.data?.token) {
                    setAuthToken(r.data.token);
                    setAuthUser(r.data.user);
                    localStorage.setItem('mh_token', r.data.token);
                    localStorage.setItem('mh_user', JSON.stringify(r.data.user));
                    setShowAuth(null);
                  }
                } catch (e) {
                  setAuthError(e.response?.data?.message || 'Google sign-in failed');
                } finally { setAuthLoading(false); }
              }
            });
            // Mark initialized and attempt to render official Google buttons into known containers
            window._mh_gsi_initialized = true;
            setTimeout(() => {
              try {
                if (document.getElementById('google-button-login')) {
                  window.google.accounts.id.renderButton(
                    document.getElementById('google-button-login'),
                    { theme: 'outline', size: 'large', type: 'standard', text: 'signin_with' }
                  );
                  console.info('GSI login button rendered');
                }
                if (document.getElementById('google-button-register')) {
                  window.google.accounts.id.renderButton(
                    document.getElementById('google-button-register'),
                    { theme: 'outline', size: 'large', type: 'standard', text: 'signup_with' }
                  );
                  console.info('GSI register button rendered');
                }
              } catch (err) {
                console.warn('GSI render error (elements may not be present yet)', err);
              }
            }, 50);
          }
        } catch (e) {
          console.error('GSI init error', e);
        }
      };
      document.head.appendChild(s);
    }
  }, [authToken]);

  // Ensure Google button is rendered when an auth modal opens and the container is present.
  React.useEffect(() => {
    const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!showAuth) return; // no auth modal open
    if (!googleClientId) {
      console.warn('[Google Auth] VITE_GOOGLE_CLIENT_ID missing — button cannot be rendered');
      return;
    }

    const renderFor = (id, text) => {
      try {
        const container = document.getElementById(id);
        if (!container) {
          console.warn('[Google Auth] Container not found for', id);
          return false;
        }
        if (!window.google || !window.google.accounts) {
          console.warn('[Google Auth] window.google not ready yet');
          return false;
        }
        window.google.accounts.id.renderButton(container, { theme: 'outline', size: 'large', type: 'standard', text });
        console.info('[Google Auth] %s button rendered', id);
        return true;
      } catch (err) {
        console.error('[Google Auth] Error rendering button for', id, err);
        return false;
      }
    };

    // If GSI already initialized, render immediately, otherwise wait briefly for script to finish loading
    if (window.google && window.google.accounts && window._mh_gsi_initialized) {
      if (showAuth === 'login') renderFor('google-button-login', 'signin_with');
      if (showAuth === 'register') renderFor('google-button-register', 'signup_with');
      return;
    }

    // Try a few times while waiting for the script to load
    let attempts = 0;
    const maxAttempts = 10;
    const iv = setInterval(() => {
      attempts += 1;
      if (window.google && window.google.accounts) {
        window._mh_gsi_initialized = window._mh_gsi_initialized || false; // keep flag
        if (showAuth === 'login') renderFor('google-button-login', 'signin_with');
        if (showAuth === 'register') renderFor('google-button-register', 'signup_with');
        clearInterval(iv);
      } else if (attempts >= maxAttempts) {
        console.warn('[Google Auth] GSI not available after waiting — check network or script load');
        clearInterval(iv);
      }
    }, 300);

    return () => clearInterval(iv);
  }, [showAuth]);

  const togglePasswordField = (which) => {
    if (which === 'login') setShowPwdLogin((v) => !v);
    if (which === 'register') setShowPwdRegister((v) => !v);
  };

  // Client-side validation helpers
  const emailIsValid = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const passwordIsValid = (pwd) => /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{8,}$/.test(pwd); // min 8, letters+numbers
  const nameIsValid = (name) => typeof name === 'string' && name.trim().length >= 2 && name.trim().length <= 100;

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

  // Auth actions
  const registerUser = async (payload) => {
    setAuthLoading(true); setAuthError(null);
    try {
      const resp = await axios.post('http://localhost:5000/api/auth/register', payload);
      if (resp.data?.token) {
        setAuthToken(resp.data.token);
        setAuthUser(resp.data.user);
        localStorage.setItem('mh_token', resp.data.token);
        localStorage.setItem('mh_user', JSON.stringify(resp.data.user));
        setShowAuth(null);
        setRegisterErrors(null);
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Registration failed';
      setAuthError(msg);
      // If backend returned validation details use them
      if (err.response?.status === 400 || err.response?.status === 409) {
        setRegisterErrors(err.response.data?.errors || { general: msg });
      }
    } finally { setAuthLoading(false); }
  };

  const loginUser = async (payload) => {
    setAuthLoading(true); setAuthError(null);
    try {
      const resp = await axios.post('http://localhost:5000/api/auth/login', payload);
      if (resp.data?.token) {
        setAuthToken(resp.data.token);
        setAuthUser(resp.data.user);
        localStorage.setItem('mh_token', resp.data.token);
        localStorage.setItem('mh_user', JSON.stringify(resp.data.user));
        setShowAuth(null);
        setLoginErrors(null);
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Login failed';
      setAuthError(msg);
      if (err.response?.status === 400 || err.response?.status === 401) {
        setLoginErrors({ general: msg });
      }
    } finally { setAuthLoading(false); }
  };

  const logout = () => {
    setAuthToken(null); setAuthUser(null);
    localStorage.removeItem('mh_token'); localStorage.removeItem('mh_user');
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
    setCacheStatus(null);

    // Start polling status endpoint while we wait for results
    const startPolling = () => {
      if (statusPollingRef.current) return;
      const poll = async () => {
        try {
          const resp = await axios.get(
            `http://localhost:5000/api/jobs/status?keyword=${encodeURIComponent(formData.keyword)}&location=${encodeURIComponent(formData.location)}`
          );
          if (resp.data && resp.data.status) {
            setCacheStatus(resp.data.status);
          }
        } catch (e) {
          // ignore polling errors
        }
      };
      // immediate poll then every second
      poll();
      statusPollingRef.current = setInterval(poll, 1000);
    };

    const stopPolling = () => {
      if (statusPollingRef.current) {
        clearInterval(statusPollingRef.current);
        statusPollingRef.current = null;
      }
    };

    startPolling();

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
      // stop polling after search completes (allow background refresh to continue server-side)
      if (statusPollingRef.current) {
        clearInterval(statusPollingRef.current);
        statusPollingRef.current = null;
      }
    }
  };

  // Cleanup polling on unmount
  React.useEffect(() => {
    return () => {
      if (statusPollingRef.current) clearInterval(statusPollingRef.current);
    };
  }, []);

  const sortedResults = React.useMemo(() => {
    if (!results || results.length === 0) return [];
    const copy = results.slice();
    copy.sort((a, b) => {
      if (sortBy === 'hybrid') {
        const aa = (a.improved_score ?? a.improvedScore ?? 0);
        const bb = (b.improved_score ?? b.improvedScore ?? 0);
        return bb - aa;
      }
      // baseline
      const aBaseline = (a.baseline_score ?? a.score ?? a.matchScore ?? 0);
      const bBaseline = (b.baseline_score ?? b.score ?? b.matchScore ?? 0);
      return bBaseline - aBaseline;
    });
    return copy;
  }, [results, sortBy]);

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
          <div className="absolute right-6 top-6">
            {authUser ? (
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-gray-700">{authUser.name}</span>
                <button onClick={logout} className="px-3 py-1 rounded-md bg-red-50 text-red-700 border border-red-100 text-sm">Logout</button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button onClick={() => setShowAuth('login')} className="px-3 py-1 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-100 text-sm">Login</button>
                <button onClick={() => setShowAuth('register')} className="px-3 py-1 rounded-md bg-green-50 text-green-700 border border-green-100 text-sm">Register</button>
              </div>
            )}
          </div>
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
                  disabled={isUploading || isLoading || !authToken}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                />
                {!authToken && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <p className="text-sm text-gray-500">Please login to upload a resume</p>
                  </div>
                )}
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

            {/* Status badge */}
            {cacheStatus && (
              <div className="mt-3 text-sm">
                {cacheStatus.refreshInProgress ? (
                  <span className="inline-block px-3 py-1 rounded-full bg-yellow-100 text-yellow-800 font-medium">Refreshing…</span>
                ) : cacheStatus.cacheHit ? (
                  <span className="inline-block px-3 py-1 rounded-full bg-green-100 text-green-800 font-medium">Cached</span>
                ) : (
                  <span className="inline-block px-3 py-1 rounded-full bg-gray-100 text-gray-800 font-medium">No Cache</span>
                )}
              </div>
            )}

            {/* Sort toggle: Baseline vs Hybrid */}
            <div className="mt-3 text-sm flex items-center gap-3">
              <label className="text-gray-600 font-medium">Rank by:</label>
              <label className="inline-flex items-center text-sm">
                <input type="radio" name="sort" value="baseline" checked={sortBy === 'baseline'} onChange={() => setSortBy('baseline')} className="mr-2" />
                Baseline (FYP‑I)
              </label>
              <label className="inline-flex items-center text-sm">
                <input type="radio" name="sort" value="hybrid" checked={sortBy === 'hybrid'} onChange={() => setSortBy('hybrid')} className="mr-2" />
                Hybrid (FYP‑II)
              </label>
            </div>
          </div>
        </div>

        {/* Auth modal / panel */}
        {showAuth === 'login' && (
          <div className="fixed inset-0 bg-black/30 flex items-center justify-center">
            <div className="bg-white p-6 rounded-xl w-96">
              <h3 className="text-lg font-semibold mb-3">Login</h3>
              {authError && <div className="text-sm text-red-600 mb-2">{authError}</div>}
              <input placeholder="Email" className="w-full px-3 py-2 border mb-2" id="auth_email" />
              <div className="relative">
                <input placeholder="Password" id="auth_password" type={showPwdLogin ? 'text' : 'password'} className="w-full px-3 py-2 border mb-4 pr-10" />
                <button type="button" onClick={() => togglePasswordField('login')} className="absolute right-2 top-2 text-gray-600 p-1">
                  {showPwdLogin ? (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M10 3C5 3 1 7 1 10s4 7 9 7 9-4 9-7-4-7-9-7zM5.7 9.7A4 4 0 0110 6a4 4 0 014.3 3.7A6.97 6.97 0 0010 13c-1.6 0-3-.5-4.3-1.3z"/></svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M2.93 2.93a.75.75 0 011.06 0L17.07 16a.75.75 0 11-1.06 1.06L2.93 3.99a.75.75 0 010-1.06zM10 4a6 6 0 016 6c0 1.04-.3 2.01-.82 2.83l1.3 1.3A7.98 7.98 0 0018 10a8 8 0 10-8 8c2.1 0 4.03-.8 5.5-2.1l.7.7A9.98 9.98 0 0110 20 10 10 0 1110 0z"/></svg>
                  )}
                </button>
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowAuth(null)} className="px-3 py-1">Cancel</button>
                <button onClick={async () => {
                  const email = document.getElementById('auth_email').value;
                  const password = document.getElementById('auth_password').value;
                  await loginUser({ email, password });
                }} className="px-3 py-1 bg-indigo-600 text-white rounded-md" disabled={authLoading}>{authLoading ? '...' : 'Login'}</button>
              </div>
              <div className="mt-3">
                <div id="google-button-login" />
              </div>
              <div className="mt-2 text-sm text-center">
                <button onClick={() => setShowAuth('register')} className="text-indigo-600 underline">Create account</button>
              </div>
            </div>
          </div>
        )}

        {showAuth === 'register' && (
          <div className="fixed inset-0 bg-black/30 flex items-center justify-center">
            <div className="bg-white p-6 rounded-xl w-96">
              <h3 className="text-lg font-semibold mb-3">Register</h3>
              {authError && <div className="text-sm text-red-600 mb-2">{authError}</div>}
              <input placeholder="Full name" className="w-full px-3 py-2 border mb-2" id="reg_name" />
              <input placeholder="Email" className="w-full px-3 py-2 border mb-2" id="reg_email" />
              <div className="relative">
                <input placeholder="Password" id="reg_password" type={showPwdRegister ? 'text' : 'password'} className="w-full px-3 py-2 border mb-4 pr-10" />
                <button type="button" onClick={() => togglePasswordField('register')} className="absolute right-2 top-2 text-gray-600 p-1">
                  {showPwdRegister ? (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M10 3C5 3 1 7 1 10s4 7 9 7 9-4 9-7-4-7-9-7zM5.7 9.7A4 4 0 0110 6a4 4 0 014.3 3.7A6.97 6.97 0 0010 13c-1.6 0-3-.5-4.3-1.3z"/></svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M2.93 2.93a.75.75 0 011.06 0L17.07 16a.75.75 0 11-1.06 1.06L2.93 3.99a.75.75 0 010-1.06zM10 4a6 6 0 016 6c0 1.04-.3 2.01-.82 2.83l1.3 1.3A7.98 7.98 0 0018 10a8 8 0 10-8 8c2.1 0 4.03-.8 5.5-2.1l.7.7A9.98 9.98 0 0110 20 10 10 0 1110 0z"/></svg>
                  )}
                </button>
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowAuth(null)} className="px-3 py-1">Cancel</button>
                <button onClick={async () => {
                  const name = document.getElementById('reg_name').value;
                  const email = document.getElementById('reg_email').value;
                  const password = document.getElementById('reg_password').value;
                  await registerUser({ name, email, password });
                }} className="px-3 py-1 bg-green-600 text-white rounded-md" disabled={authLoading}>{authLoading ? '...' : 'Register'}</button>
              </div>
              <div className="mt-3">
                <div id="google-button-register" />
              </div>
              <div className="mt-2 text-sm text-center">
                <button onClick={() => setShowAuth('login')} className="text-indigo-600 underline">Already have an account?</button>
              </div>
            </div>
          </div>
        )}

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
              Top Matches <span className="ml-2 text-sm bg-blue-50 text-[#2563EB] py-1 px-2.5 rounded-lg border border-blue-100">{sortedResults.length}</span>
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {sortedResults.map((job, index) => {
                const scoreRaw = job.score ?? job.matchScore ?? 0;
                const scorePct = Math.round(scoreRaw * 100);
                const improvedRaw = (job.improved_score ?? job.improvedScore ?? null);
                const improvedPct = improvedRaw == null ? 'N/A' : `${Math.round(Number(improvedRaw))}%`;
                const semanticRaw = job.semantic_similarity ?? job.semanticScore ?? job.semanticSimilarity ?? null;
                const semanticPct = semanticRaw == null ? 'N/A' : `${(Number(semanticRaw) * 100).toFixed(1)}%`;
                
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
                        <div className="flex flex-col items-end gap-2">
                          <div className={`shrink-0 px-3.5 py-1.5 rounded-full font-bold text-sm tracking-wide shadow-sm whitespace-nowrap ${getScoreColor(scorePct)}`}>
                            {scorePct}%
                          </div>
                          <div className="mt-1 text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-800 font-semibold">
                            Hybrid: {improvedPct}
                          </div>
                        </div>
                      </div>

                      <div className="rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-[11px] font-semibold uppercase tracking-wide text-indigo-700">Sentence-BERT</span>
                          <span className="text-sm font-bold text-indigo-700">{semanticPct}</span>
                        </div>
                        {job.semantic_inference_ms != null && (
                          <div className="text-xs text-gray-500 mt-1">Latency: {Math.round(job.semantic_inference_ms)} ms</div>
                        )}
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
                          improvedComponents={job.improved_score_components}
                          inferenceMs={job.semantic_inference_ms}
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
