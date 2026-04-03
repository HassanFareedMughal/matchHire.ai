const multer = require('multer');
const pdfParse = require('pdf-parse');

// Configure multer to use memory storage
const storage = multer.memoryStorage();

// File filter to accept only PDF
const fileFilter = (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
        cb(null, true);
    } else {
        cb(new Error('Only PDF files are allowed!'), false);
    }
};

const upload = multer({ 
    storage: storage,
    fileFilter: fileFilter 
}).single('resume');

const uploadResume = (req, res) => {
    upload(req, res, async (err) => {
        if (err instanceof multer.MulterError) {
            return res.status(400).json({ success: false, message: err.message });
        } else if (err) {
            return res.status(400).json({ success: false, message: err.message });
        }

        if (!req.file) {
            console.error('Upload Error: No file received in req.file');
            return res.status(400).json({ success: false, message: 'Please upload a PDF file.' });
        }

        console.log(`Received file: ${req.file.originalname} (${req.file.size} bytes)`);

        try {
            console.log('Extracting text from PDF...');
            // Extract text from the uploaded PDF buffer
            const data = await pdfParse(req.file.buffer);
            
            console.log('PDF text extracted successfully.');
            res.status(200).json({
                success: true,
                text: data.text
            });
        } catch (error) {
            console.error('PDF Parse Error:', error);
            res.status(500).json({ 
                success: false, 
                message: 'Failed to extract text from PDF.' 
            });
        }
    });
};

module.exports = { uploadResume };
