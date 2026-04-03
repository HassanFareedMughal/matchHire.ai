import { useState } from 'react';
import axios from 'axios';

function App() {
  const [formData, setFormData] = useState({
    resume: '',
    keyword: '',
    location: ''
  });
  
  const [results, setResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState(null);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      setError('Please upload a valid PDF file.');
      return;
    }

    const uploadData = new FormData();
    uploadData.append('resume', file);

    setIsUploading(true);
    setError(null);

    try {
      const response = await axios.post('http://localhost:5000/api/upload-resume', uploadData);

      if (response.data && response.data.success) {
        setFormData(prev => ({
          ...prev,
          resume: response.data.text
        }));
      }
    } catch (err) {
      console.error('Upload Error:', err);
      setError(err.response?.data?.message || 'Failed to upload and extract PDF.');
    } finally {
      setIsUploading(false);
      e.target.value = ''; // Reset file input so same file can be selected again if needed
    }
  };

  const findJobs = async () => {
    // Basic validation
    if (!formData.resume.trim() || !formData.keyword.trim() || !formData.location.trim()) {
      setError("Please fill out all fields before finding jobs.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setResults([]);

    try {
      const response = await axios.post('http://localhost:5000/api/match', {
        resume: formData.resume,
        keyword: formData.keyword,
        location: formData.location
      }, {
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      console.log('API Response:', response.data);
      
      // Checking if the response contains matching jobs
      if (response.data && response.data.matches) {
        setResults(response.data.matches);
      } else if (response.data && Array.isArray(response.data)) {
        setResults(response.data);
      } else {
        setResults([]);
      }
    } catch (err) {
      console.error('API Error:', err);
      
      // Try to extract the most descriptive error message
      const errorMessage = err.response?.data?.error 
        || err.response?.data?.message 
        || err.message 
        || "An error occurred while finding jobs. Please try again.";
        
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-12">
        {/* Header section */}
        <div className="text-center space-y-4">
          <h1 className="text-5xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600">
            matchHire.ai
          </h1>
          <p className="text-xl text-gray-500 max-w-2xl mx-auto">
            Find the perfect career match tailored specifically to your resume.
          </p>
        </div>

        {/* Form section */}
        <div className="bg-white/70 backdrop-blur-lg shadow-xl shadow-indigo-100/50 rounded-2xl p-8 border border-white">
          <div className="space-y-6">
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Upload Resume (PDF)
              </label>
              <input
                type="file"
                accept=".pdf"
                onChange={handleFileUpload}
                disabled={isUploading || isLoading}
                className="w-full px-4 py-2 mb-4 rounded-xl border border-gray-200 bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-shadow file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer disabled:opacity-50"
              />
              
              <label htmlFor="resume" className="block text-sm font-medium text-gray-700 mb-2">
                Or Paste / Edit Your Resume Text
              </label>
              <textarea
                id="resume"
                name="resume"
                rows="6"
                value={formData.resume}
                onChange={handleChange}
                disabled={isUploading || isLoading}
                placeholder={isUploading ? "Extracting text from PDF..." : "Paste your resume content here..."}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-shadow resize-none box-border disabled:opacity-50 disabled:bg-gray-50"
              ></textarea>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
               <div>
                  <label htmlFor="keyword" className="block text-sm font-medium text-gray-700 mb-2">
                    Job Keyword
                  </label>
                  <input
                    type="text"
                    id="keyword"
                    name="keyword"
                    value={formData.keyword}
                    onChange={handleChange}
                    placeholder="e.g. Software Engineer"
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-shadow"
                  />
               </div>

               <div>
                  <label htmlFor="location" className="block text-sm font-medium text-gray-700 mb-2">
                    Location
                  </label>
                  <input
                    type="text"
                    id="location"
                    name="location"
                    value={formData.location}
                    onChange={handleChange}
                    placeholder="e.g. New York, NY"
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-shadow"
                  />
               </div>
            </div>

            {error && (
              <div className="p-4 bg-red-50 text-red-700 rounded-xl border border-red-100 text-sm flex items-center shadow-sm">
                <svg className="w-5 h-5 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg>
                {error}
              </div>
            )}

            <button
              onClick={findJobs}
              disabled={isLoading}
              className={`w-full py-4 rounded-xl text-white font-bold text-lg shadow-lg flex items-center justify-center transition-all ${
                isLoading 
                  ? 'bg-indigo-400 cursor-not-allowed shadow-indigo-200' 
                  : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 shadow-indigo-200 hover:shadow-indigo-300 hover:-translate-y-0.5'
              }`}
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Matching Jobs...
                </>
              ) : (
                'Find Jobs'
              )}
            </button>
          </div>
        </div>

        {/* Results section */}
        {results.length > 0 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-2xl font-bold text-gray-900 px-2 flex items-center">
              Top Matches <span className="ml-3 text-sm font-medium text-white bg-indigo-500 py-1 px-3 rounded-full">{results.length}</span>
            </h2>
            <div className="grid gap-6">
              {results.map((job, index) => {
                // Ensure there's a score value to display it nicely
                const score = job.matchScore || job.score || 0;
                // Parse score for visual display (fallback to 0 if invalid)
                const parsedScore = parseFloat(score);
                const scoreValue = isNaN(parsedScore) ? 0 : parsedScore;
                
                return (
                  <div 
                    key={index} 
                    className="bg-white rounded-2xl p-6 shadow-md border border-gray-100 hover:shadow-lg hover:border-indigo-100 transition-all group flex flex-col sm:flex-row sm:items-center gap-6"
                  >
                    <div className="flex-1 space-y-2">
                       <h3 className="text-xl font-bold text-gray-900 group-hover:text-indigo-600 transition-colors">
                         {job.title || job.job_title}
                       </h3>
                       {job.company_name && (
                         <p className="text-gray-600 font-medium">
                           {job.company_name} <span className="text-gray-400 font-normal">in {job.location}</span>
                         </p>
                       )}
                    </div>
                    
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
                      <div className="flex flex-col items-center justify-center p-3 rounded-xl bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-100 min-w-24">
                         <span className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600">
                            {scoreValue}{typeof score === 'string' && score.includes('%') ? '' : '%'}
                         </span>
                         <span className="text-xs uppercase tracking-wider font-bold text-indigo-500 mt-1">Match</span>
                      </div>
                      
                      <a 
                        href={job.applyLink || job.apply_link || job.job_apply_link || '#'} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="w-full sm:w-auto px-6 py-3 rounded-xl bg-gray-50 text-indigo-600 font-bold border border-gray-200 hover:bg-indigo-600 hover:text-white hover:border-indigo-600 transition-colors text-center whitespace-nowrap"
                      >
                        Apply Now
                      </a>
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

export default App;
