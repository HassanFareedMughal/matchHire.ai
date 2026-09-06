const { GoogleGenAI } = require('@google/genai');
const User = require('../models/User');

const generationTimeoutMs = 30000;

const generateCoverLetter = async (req, res) => {
  const { job } = req.body || {};
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(503).json({ success: false, message: 'Cover letter generation is not configured.' });
  }

  if (!job || typeof job !== 'object' || !String(job.title || '').trim()) {
    return res.status(400).json({ success: false, message: 'A selected job with a title is required.' });
  }

  const title = String(job.title).trim().slice(0, 300);
  const company = String(job.company || '').trim().slice(0, 300);
  const location = String(job.location || '').trim().slice(0, 300);
  const description = String(job.description || '').trim().slice(0, 12000);

  try {
    const user = await User.findById(req.user._id).select('resumeText').lean();
    const resumeText = String(user?.resumeText || '').trim();
    if (!resumeText) {
      return res.status(422).json({ success: false, message: 'Upload and save a resume before generating a cover letter.' });
    }

    const prompt = [
      'Write one concise, professional cover letter for the selected job below.',
      'Use only facts explicitly supported by the resume. Do not invent or infer degrees, employers, certifications, skills, experience, achievements, projects, dates, or any other qualifications.',
      'Do not use placeholders, markdown fences, headings such as "Cover Letter", AI commentary, contact information, greetings with guessed names, or fabricated details.',
      'Use a professional greeting when no hiring-manager name is provided, and finish with a concise sign-off without a fabricated name.',
      'Return only the letter text, in plain text, with 3 to 5 short paragraphs.',
      '',
      'SELECTED JOB',
      `Title: ${title}`,
      `Company: ${company || 'Not provided'}`,
      `Location: ${location || 'Not provided'}`,
      `Job description: ${description || 'Not provided; tailor only to the title, company, and location.'}`,
      '',
      'RESUME',
      resumeText.slice(0, 20000),
    ].join('\n');

    const ai = new GoogleGenAI({ apiKey });
    const responsePromise = ai.models.generateContent({
      model: process.env.GEMINI_MODEL || 'gemini-3.6-flash',
      contents: prompt,
    });
    const response = await Promise.race([
      responsePromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('GEMINI_TIMEOUT')), generationTimeoutMs)),
    ]);
    const letter = String(response?.text || '').trim();

    if (!letter) {
      return res.status(502).json({ success: false, message: 'Gemini returned an empty cover letter. Please try again.' });
    }
    return res.status(200).json({ success: true, coverLetter: letter });
  } catch (error) {
    const status = Number(error?.status || error?.response?.status);
    if (error.message === 'GEMINI_TIMEOUT') {
      return res.status(504).json({ success: false, message: 'Cover letter generation timed out. Please try again.' });
    }
    if (status === 401 || status === 403) {
      return res.status(502).json({ success: false, message: 'Gemini authentication failed. Check the server configuration.' });
    }
    if (status === 429) {
      return res.status(429).json({ success: false, message: 'Gemini is temporarily rate-limited. Please try again shortly.' });
    }
    console.error('generateCoverLetter error:', error.message);
    return res.status(502).json({ success: false, message: 'Cover letter generation failed. Please try again.' });
  }
};

module.exports = { generateCoverLetter };