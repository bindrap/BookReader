const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const multer = require('multer');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const session = require('express-session');
const db = require('./db');

const app = express();
const PORT = 8669;
const USER_BOOKS_DIR = path.join(__dirname, 'user_books');
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Initialize database
db.initDB();

// Ensure user_books directory exists
fs.mkdir(USER_BOOKS_DIR, { recursive: true }).catch(console.error);

// Middleware
app.use(express.json());
app.use(session({
  secret: JWT_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false } // Set to true in production with HTTPS
}));

// Auth middleware
function authenticateToken(req, res, next) {
  const token = req.headers['authorization']?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid token' });
  }
}

// Get user's books directory
function getUserBooksDir(userId) {
  return path.join(USER_BOOKS_DIR, userId);
}

// Configure multer for user-specific uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const userDir = getUserBooksDir(req.userId);
    await fs.mkdir(userDir, { recursive: true });
    cb(null, userDir);
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  }
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.pdf', '.epub', '.cbz', '.cbr', '.mobi'].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, EPUB, CBZ, CBR, and MOBI files are allowed.'));
    }
  }
});

// Serve static files - auth checking happens on the frontend
app.use((req, res, next) => {
  // Just serve all static files - let the frontend handle auth redirects
  next();
});

app.use(express.static('public'));

// Auth endpoints
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    if (username.length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await db.createUser(username, hashedPassword);

    // Create user's books directory
    await fs.mkdir(getUserBooksDir(user.id), { recursive: true });

    const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });

    res.json({ token, username: user.username, userId: user.id });
  } catch (error) {
    if (error.message === 'User already exists') {
      return res.status(400).json({ error: 'Username already taken' });
    }
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const user = await db.findUserByUsername(username);

    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });

    res.json({ token, username: user.username, userId: user.id });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get user info
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const user = await db.findUserById(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ userId: user.id, username: user.username });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get user info' });
  }
});

// Get list of user's books
app.get('/api/books', authenticateToken, async (req, res) => {
  try {
    const userBooksDir = getUserBooksDir(req.userId);

    // Ensure directory exists
    await fs.mkdir(userBooksDir, { recursive: true });

    const files = await fs.readdir(userBooksDir);
    const supportedExtensions = ['.pdf', '.epub', '.cbz', '.cbr', '.mobi'];

    const books = await Promise.all(
      files.map(async (file) => {
        const filePath = path.join(userBooksDir, file);
        const stats = await fs.stat(filePath);
        const ext = path.extname(file).toLowerCase();

        if (stats.isFile() && supportedExtensions.includes(ext)) {
          return {
            id: Buffer.from(file).toString('base64'),
            name: file,
            type: ext.substring(1),
            path: file,
            isDirectory: false,
            size: stats.size,
            modified: stats.mtime
          };
        } else if (stats.isDirectory()) {
          const dirFiles = await fs.readdir(filePath);
          const hasImages = dirFiles.some(f => {
            const imgExt = path.extname(f).toLowerCase();
            return ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(imgExt);
          });

          if (hasImages) {
            return {
              id: Buffer.from(file).toString('base64'),
              name: file,
              type: 'manga',
              path: file,
              isDirectory: true,
              size: stats.size,
              modified: stats.mtime
            };
          }
        }
        return null;
      })
    );

    res.json(books.filter(book => book !== null));
  } catch (error) {
    console.error('Error reading books:', error);
    res.status(500).json({ error: 'Failed to read books directory' });
  }
});

// Get pages for a specific book
app.get('/api/books/:bookId/pages', authenticateToken, async (req, res) => {
  try {
    const bookName = Buffer.from(req.params.bookId, 'base64').toString('utf-8');
    const bookPath = path.join(getUserBooksDir(req.userId), bookName);

    const stats = await fs.stat(bookPath);

    if (stats.isDirectory()) {
      const files = await fs.readdir(bookPath);
      const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];

      const pages = files
        .filter(file => {
          const ext = path.extname(file).toLowerCase();
          return imageExtensions.includes(ext);
        })
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
        .map((file, index) => ({
          pageNumber: index + 1,
          filename: file,
          path: `${bookName}/${file}`
        }));

      res.json({ totalPages: pages.length, pages });
    } else {
      res.json({ totalPages: 0, pages: [], message: 'PDF/EPUB parsing not yet implemented in this version' });
    }
  } catch (error) {
    console.error('Error getting pages:', error);
    res.status(500).json({ error: 'Failed to get book pages' });
  }
});

// Serve book files
app.get('/api/books/:bookId/file', authenticateToken, async (req, res) => {
  try {
    const bookName = Buffer.from(req.params.bookId, 'base64').toString('utf-8');
    const bookPath = path.join(getUserBooksDir(req.userId), bookName);

    const stats = await fs.stat(bookPath);
    if (stats.isFile()) {
      res.sendFile(bookPath);
    } else {
      res.status(400).json({ error: 'Not a file' });
    }
  } catch (error) {
    console.error('Error serving file:', error);
    res.status(404).json({ error: 'File not found' });
  }
});

// Serve images from manga folders
app.get('/api/images/:bookName/:imageName', authenticateToken, async (req, res) => {
  try {
    const imagePath = path.join(getUserBooksDir(req.userId), req.params.bookName, req.params.imageName);
    res.sendFile(imagePath);
  } catch (error) {
    console.error('Error serving image:', error);
    res.status(404).json({ error: 'Image not found' });
  }
});

// Upload books
app.post('/api/upload', authenticateToken, upload.array('books', 10), (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const uploadedFiles = req.files.map(file => ({
      name: file.originalname,
      size: file.size
    }));

    res.json({
      success: true,
      message: `Successfully uploaded ${req.files.length} file(s)`,
      files: uploadedFiles
    });
  } catch (error) {
    console.error('Error uploading files:', error);
    res.status(500).json({ error: 'Failed to upload files' });
  }
});

// Chunked upload for large files
const chunkStorage = new Map(); // Store chunks temporarily

app.post('/api/upload-chunk', authenticateToken, multer({ storage: multer.memoryStorage() }).single('chunk'), async (req, res) => {
  try {
    const { filename, chunkIndex, totalChunks } = req.body;
    const chunk = req.file.buffer;

    if (!filename || chunkIndex === undefined || totalChunks === undefined) {
      return res.status(400).json({ error: 'Missing chunk information' });
    }

    const uploadId = `${req.userId}_${filename}`;

    // Initialize chunk storage for this upload
    if (!chunkStorage.has(uploadId)) {
      chunkStorage.set(uploadId, {
        chunks: new Array(parseInt(totalChunks)),
        filename: filename,
        userId: req.userId,
        receivedChunks: 0
      });
    }

    const uploadData = chunkStorage.get(uploadId);
    uploadData.chunks[parseInt(chunkIndex)] = chunk;
    uploadData.receivedChunks++;

    // Check if all chunks are received
    if (uploadData.receivedChunks === parseInt(totalChunks)) {
      // Combine all chunks
      const fileBuffer = Buffer.concat(uploadData.chunks);

      // Save to user's directory
      const userDir = getUserBooksDir(req.userId);
      await fs.mkdir(userDir, { recursive: true });

      const filePath = path.join(userDir, filename);
      await fs.writeFile(filePath, fileBuffer);

      // Clean up
      chunkStorage.delete(uploadId);

      res.json({
        success: true,
        message: 'File uploaded successfully',
        filename: filename
      });
    } else {
      res.json({
        success: true,
        message: `Chunk ${parseInt(chunkIndex) + 1}/${totalChunks} received`,
        chunksReceived: uploadData.receivedChunks
      });
    }
  } catch (error) {
    console.error('Error uploading chunk:', error);
    res.status(500).json({ error: 'Failed to upload chunk' });
  }
});

// Get all users (for browsing shared libraries)
app.get('/api/users', authenticateToken, async (req, res) => {
  try {
    const db_data = await require('fs').promises.readFile(path.join(__dirname, 'users.json'), 'utf8');
    const data = JSON.parse(db_data);

    // Return users except the current user, without passwords
    const users = data.users
      .filter(u => u.id !== req.userId)
      .map(u => ({
        id: u.id,
        username: u.username
      }));

    res.json(users);
  } catch (error) {
    console.error('Error getting users:', error);
    res.status(500).json({ error: 'Failed to get users' });
  }
});

// Get another user's books (for browsing)
app.get('/api/users/:userId/books', authenticateToken, async (req, res) => {
  try {
    const targetUserId = req.params.userId;
    const userBooksDir = getUserBooksDir(targetUserId);

    // Check if directory exists
    try {
      await fs.access(userBooksDir);
    } catch {
      return res.json([]);
    }

    const files = await fs.readdir(userBooksDir);
    const supportedExtensions = ['.pdf', '.epub', '.cbz', '.cbr', '.mobi'];

    const books = await Promise.all(
      files.map(async (file) => {
        const filePath = path.join(userBooksDir, file);
        const stats = await fs.stat(filePath);
        const ext = path.extname(file).toLowerCase();

        if (stats.isFile() && supportedExtensions.includes(ext)) {
          return {
            id: Buffer.from(file).toString('base64'),
            name: file,
            type: ext.substring(1),
            size: stats.size,
            ownerId: targetUserId
          };
        } else if (stats.isDirectory()) {
          const dirFiles = await fs.readdir(filePath);
          const hasImages = dirFiles.some(f => {
            const imgExt = path.extname(f).toLowerCase();
            return ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(imgExt);
          });

          if (hasImages) {
            return {
              id: Buffer.from(file).toString('base64'),
              name: file,
              type: 'manga',
              size: stats.size,
              ownerId: targetUserId
            };
          }
        }
        return null;
      })
    );

    res.json(books.filter(book => book !== null));
  } catch (error) {
    console.error('Error reading shared books:', error);
    res.status(500).json({ error: 'Failed to read shared books' });
  }
});

// Rename a book
app.post('/api/books/:bookId/rename', authenticateToken, async (req, res) => {
  try {
    const bookId = req.params.bookId;
    const { newName } = req.body;

    if (!newName || newName.trim().length === 0) {
      return res.status(400).json({ error: 'New name is required' });
    }

    const oldName = Buffer.from(bookId, 'base64').toString('utf-8');
    const oldPath = path.join(getUserBooksDir(req.userId), oldName);

    // Get the extension from old name
    const ext = path.extname(oldName);
    const isDirectory = (await fs.stat(oldPath)).isDirectory();

    // Create new name (add extension if it's a file and not already present)
    let finalNewName = newName.trim();
    if (!isDirectory && !finalNewName.endsWith(ext)) {
      finalNewName += ext;
    }

    const newPath = path.join(getUserBooksDir(req.userId), finalNewName);

    // Check if new name already exists
    try {
      await fs.access(newPath);
      return res.status(400).json({ error: 'A book with this name already exists' });
    } catch {
      // Good, doesn't exist
    }

    // Rename the file/directory
    await fs.rename(oldPath, newPath);

    res.json({
      success: true,
      message: 'Book renamed successfully',
      newId: Buffer.from(finalNewName).toString('base64'),
      newName: finalNewName
    });
  } catch (error) {
    console.error('Error renaming book:', error);
    res.status(500).json({ error: 'Failed to rename book' });
  }
});

// Set cover page for a book
app.post('/api/books/:bookId/cover', authenticateToken, async (req, res) => {
  try {
    const bookId = req.params.bookId;
    const { pageNumber } = req.body;

    if (pageNumber === undefined || pageNumber < 1) {
      return res.status(400).json({ error: 'Valid page number is required' });
    }

    const bookName = Buffer.from(bookId, 'base64').toString('utf-8');
    const bookPath = path.join(getUserBooksDir(req.userId), bookName);

    // Check if book exists
    await fs.access(bookPath);

    // Load or create cover settings file
    const settingsPath = path.join(USER_BOOKS_DIR, req.userId, '.cover-settings.json');
    let settings = {};

    try {
      const data = await fs.readFile(settingsPath, 'utf8');
      settings = JSON.parse(data);
    } catch {
      // File doesn't exist yet
    }

    // Save cover page setting
    settings[bookId] = { pageNumber };
    await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2));

    res.json({
      success: true,
      message: 'Cover page set successfully',
      pageNumber
    });
  } catch (error) {
    console.error('Error setting cover page:', error);
    res.status(500).json({ error: 'Failed to set cover page' });
  }
});

// Get cover page setting for a book
app.get('/api/books/:bookId/cover', authenticateToken, async (req, res) => {
  try {
    const bookId = req.params.bookId;
    const settingsPath = path.join(USER_BOOKS_DIR, req.userId, '.cover-settings.json');

    try {
      const data = await fs.readFile(settingsPath, 'utf8');
      const settings = JSON.parse(data);

      if (settings[bookId]) {
        res.json(settings[bookId]);
      } else {
        // Default to page 1
        res.json({ pageNumber: 1 });
      }
    } catch {
      // No settings file, default to page 1
      res.json({ pageNumber: 1 });
    }
  } catch (error) {
    console.error('Error getting cover page:', error);
    res.status(500).json({ error: 'Failed to get cover page' });
  }
});

// Delete cover page setting for a book (reset to default page 1)
app.delete('/api/books/:bookId/cover', authenticateToken, async (req, res) => {
  try {
    const bookId = req.params.bookId;
    const settingsPath = path.join(USER_BOOKS_DIR, req.userId, '.cover-settings.json');

    try {
      const data = await fs.readFile(settingsPath, 'utf8');
      const settings = JSON.parse(data);

      if (settings[bookId]) {
        delete settings[bookId];
        await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2));
        res.json({ success: true, message: 'Cover page reset to default' });
      } else {
        res.json({ success: true, message: 'Already using default cover page' });
      }
    } catch {
      res.json({ success: true, message: 'Already using default cover page' });
    }
  } catch (error) {
    console.error('Error deleting cover page:', error);
    res.status(500).json({ error: 'Failed to reset cover page' });
  }
});

// Copy a book from another user's library to yours
app.post('/api/users/:userId/books/:bookId/copy', authenticateToken, async (req, res) => {
  try {
    const sourceUserId = req.params.userId;
    const bookId = req.params.bookId;
    const bookName = Buffer.from(bookId, 'base64').toString('utf-8');

    const sourcePath = path.join(getUserBooksDir(sourceUserId), bookName);
    const destPath = path.join(getUserBooksDir(req.userId), bookName);

    // Check if source exists
    const sourceStats = await fs.stat(sourcePath);

    // Check if destination already exists
    try {
      await fs.access(destPath);
      return res.status(400).json({ error: 'You already have this book in your library' });
    } catch {
      // File doesn't exist, good to copy
    }

    // Copy file or directory
    if (sourceStats.isFile()) {
      await fs.copyFile(sourcePath, destPath);
    } else if (sourceStats.isDirectory()) {
      // Copy directory recursively
      await fs.cp(sourcePath, destPath, { recursive: true });
    }

    res.json({ success: true, message: 'Book added to your library!' });
  } catch (error) {
    console.error('Error copying book:', error);
    res.status(500).json({ error: 'Failed to copy book' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`BookReader server running at http://localhost:${PORT}`);
  console.log(`User books will be stored in: ${USER_BOOKS_DIR}`);
});
