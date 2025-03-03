const invoiceService = require('../services/invoiceServices');
const authService = require('../services/authService');
const multer = require('multer');

const upload = multer({
  storage: multer.memoryStorage(),
});

/**
 * Middleware for handling file uploads
 * This middleware uses Multer to process a single file upload and validates 
 * that a file was actually provided in the request
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {void} Calls next middleware or returns 400 error response if no file
 */
exports.uploadMiddleware = (req, res, next) => {
  upload.single('file')(req, res, () => {
      if (!req.file) {
          return res.status(400).json({ message: "No file uploaded" });
      }
      
      next();
  });
};

/**
 * Handles the upload and validation of invoice PDF files.
 *
 * This function performs multiple validation steps on the uploaded file:
 * 1. Authentication: Verifies client credentials before processing.
 * 2. Simulated Timeout: Allows testing of server timeout behavior.
 * 3. File Type Validation: Ensures the uploaded file is a valid PDF.
 * 4. Encryption Check: Rejects encrypted PDFs.
 * 5. Integrity Check: Verifies the PDF is not corrupted.
 * 6. Size Validation: Ensures the file does not exceed the allowed size limit.
 * 7. Upload Process: Uploads the validated invoice file.
 *
 * @param {Object} req - Express request object containing the uploaded file and request data.
 * @param {Object} req.file - Uploaded file information from Multer middleware.
 * @param {Buffer} req.file.buffer - File content in buffer format.
 * @param {string} req.file.originalname - Original filename including extension.
 * @param {string} req.file.mimetype - MIME type of the file.
 * @param {Object} req.body - Request body containing authentication credentials.
 * @param {string} req.body.client_id - Client ID for authentication.
 * @param {string} req.body.client_secret - Client secret for authentication.
 * @param {Object} req.query - Query parameters from the request.
 * @param {string} [req.query.simulateTimeout] - Optional flag to simulate a timeout response.
 * @param {Object} res - Express response object.
 * @returns {Promise<Object>} JSON response with appropriate status code and message.
 *
 * @throws {Error} Returns specific error messages for each validation failure.
 * Logs internal server errors to the console but provides a generic response to the client.
 */

exports.uploadInvoice = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const { buffer, originalname, mimetype } = req.file;
    const { client_id, client_secret } = req.body;

    try {
      const isAuthorized = await authService.authenticate(client_id, client_secret);
      if (!isAuthorized) {
        return res.status(401).json({ message: "Unauthorized" });
      }
    } catch (authError) {
      return res.status(500).json({ message: "Internal Server Error" });
    }

    if (req.query.simulateTimeout === 'true') {
      return res.status(504).json({ message: "Server timeout during upload" });
    }
    
    try {
      await invoiceService.validatePDF(buffer, mimetype, originalname);
    } catch (error) {
      return res.status(415).json({ message: "File format is not PDF"});
    }
    
    const isEncrypted = await invoiceService.isPdfEncrypted(buffer);
    if (isEncrypted) {
      return res.status(400).json({ message: "pdf is encrypted"});
    }
    
    const isValidPdf = await invoiceService.checkPdfIntegrity(buffer);
    if (!isValidPdf) {
      return res.status(400).json({ message: "PDF file is invalid" });
    }
    
    try {
      await invoiceService.validateSizeFile(buffer);
    } catch (error) {
      return res.status(413).json({ message: "File size exceeds maximum limit" });
    }
    
    const result = await invoiceService.uploadInvoice(req.file);
    return res.status(501).json(result);
  } catch (error) {
    return res.status(500).json({ message: "Internal server error" });
  }
};