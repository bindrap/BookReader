const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const multer = require('multer');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const session = require('express-session');
const cors = require('cors');
const db = require('./db');

const app = express();
const PORT = 8669;
const USER_BOOKS_DIR = path.join(__dirname, 'user_books');
const SHARED_BOOKS_DIR = path.join(__dirname, 'Books');
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Initialize database
db.initDB();

// Ensure user_books and shared books directories exist
fs.mkdir(USER_BOOKS_DIR, { recursive: true }).catch(console.error);
fs.mkdir(path.join(SHARED_BOOKS_DIR, 'Novels'), { recursive: true }).catch(console.error);
fs.mkdir(path.join(SHARED_BOOKS_DIR, 'Manga'), { recursive: true }).catch(console.error);
fs.mkdir(path.join(SHARED_BOOKS_DIR, 'Textbooks'), { recursive: true }).catch(console.error);

// Middleware
app.use(cors()); // Enable CORS for all routes
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

// Helper function to calculate directory size
async function getDirectorySize(dirPath) {
  let totalSize = 0;

  try {
    const files = await fs.readdir(dirPath, { withFileTypes: true });

    for (const file of files) {
      const filePath = path.join(dirPath, file.name);
      if (file.isDirectory()) {
        totalSize += await getDirectorySize(filePath);
      } else {
        const stats = await fs.stat(filePath);
        totalSize += stats.size;
      }
    }
  } catch (error) {
    // Ignore errors for directories that don't exist yet
  }

  return totalSize;
}

// Configure multer for user-specific uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const category = req.body.category || 'novels'; // Default to novels
    const userDir = path.join(getUserBooksDir(req.userId), category);
    await fs.mkdir(userDir, { recursive: true });
    cb(null, userDir);
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 500 * 1024 * 1024 // 500MB per file
  },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.pdf', '.epub', '.cbz', '.cbr', '.mobi'].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, EPUB, CBZ, CBR, and MOBI files are allowed.'));
    }
  }
});

// Serve static files with caching - auth checking happens on the frontend
app.use((req, res, next) => {
  // Add caching for static assets (24 hours)
  if (req.path.match(/\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$/)) {
    res.set('Cache-Control', 'public, max-age=86400'); // 24 hours
  }
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

// Get list of user's books (including shared books)
app.get('/api/books', authenticateToken, async (req, res) => {
  try {
    const userBooksDir = getUserBooksDir(req.userId);

    // Ensure directory and category folders exist
    await fs.mkdir(userBooksDir, { recursive: true });
    await fs.mkdir(path.join(userBooksDir, 'novels'), { recursive: true });
    await fs.mkdir(path.join(userBooksDir, 'manga'), { recursive: true });
    await fs.mkdir(path.join(userBooksDir, 'textbooks'), { recursive: true });

    const categories = ['novels', 'manga', 'textbooks'];
    const supportedExtensions = ['.pdf', '.epub', '.cbz', '.cbr', '.mobi'];
    const allBooks = [];

    // Helper function to recursively scan a directory for books
    async function scanDirectory(baseDir, category, isShared = false, relativePath = '') {
      const categoryPath = path.join(baseDir, category, relativePath);
      let files = [];

      try {
        files = await fs.readdir(categoryPath);
      } catch (error) {
        return []; // Skip if category folder doesn't exist
      }

      const allBooks = [];

      for (const file of files) {
        const filePath = path.join(categoryPath, file);
        const stats = await fs.stat(filePath);
        const ext = path.extname(file).toLowerCase();

        // Build the relative path from category root
        const relativeFilePath = relativePath ? `${relativePath}/${file}` : file;
        const bookPath = `${category}/${relativeFilePath}`;
        const bookId = isShared
          ? Buffer.from(`shared/${bookPath}`).toString('base64')
          : Buffer.from(bookPath).toString('base64');

        if (stats.isFile() && supportedExtensions.includes(ext)) {
          allBooks.push({
            id: bookId,
            name: file,
            type: ext.substring(1),
            path: bookPath,
            category: category,
            isDirectory: false,
            isShared: isShared,
            size: stats.size,
            modified: stats.mtime
          });
        } else if (stats.isDirectory()) {
          // Check if directory contains images (manga folder)
          const dirFiles = await fs.readdir(filePath);
          const hasImages = dirFiles.some(f => {
            const imgExt = path.extname(f).toLowerCase();
            return ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(imgExt);
          });

          if (hasImages) {
            // This is a manga folder with images
            allBooks.push({
              id: bookId,
              name: file,
              type: 'manga',
              path: bookPath,
              category: category,
              isDirectory: true,
              isShared: isShared,
              size: stats.size,
              modified: stats.mtime
            });
          } else {
            // This is a regular folder, recursively scan it
            const subdirBooks = await scanDirectory(baseDir, category, isShared, relativeFilePath);
            allBooks.push(...subdirBooks);
          }
        }
      }

      return allBooks;
    }

    // Scan user's books in each category
    for (const category of categories) {
      const userBooks = await scanDirectory(userBooksDir, category, false);
      allBooks.push(...userBooks);
    }

    // Scan shared books in each category (capitalized folder names)
    const sharedCategories = { 'novels': 'Novels', 'manga': 'Manga', 'textbooks': 'Textbooks' };
    for (const [category, sharedFolder] of Object.entries(sharedCategories)) {
      const sharedBooks = await scanDirectory(SHARED_BOOKS_DIR, sharedFolder, true);
      // Map shared folder names to lowercase categories
      const mappedBooks = sharedBooks.map(book => ({
        ...book,
        category: category,
        path: book.path.replace(sharedFolder, category)
      }));
      allBooks.push(...mappedBooks);
    }

    res.json(allBooks);
  } catch (error) {
    console.error('Error reading books:', error);
    res.status(500).json({ error: 'Failed to read books directory' });
  }
});

// Get pages for a specific book
app.get('/api/books/:bookId/pages', authenticateToken, async (req, res) => {
  try {
    const bookName = Buffer.from(req.params.bookId, 'base64').toString('utf-8');

    // Check if it's a shared book
    let bookPath;
    if (bookName.startsWith('shared/')) {
      const sharedPath = bookName.replace('shared/', '');
      // Map category to capitalized folder
      const parts = sharedPath.split('/');
      const categoryMap = { 'novels': 'Novels', 'manga': 'Manga', 'textbooks': 'Textbooks' };
      parts[0] = categoryMap[parts[0]] || parts[0];
      bookPath = path.join(SHARED_BOOKS_DIR, parts.join('/'));
    } else {
      bookPath = path.join(getUserBooksDir(req.userId), bookName);
    }

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

// Serve book files with caching
app.get('/api/books/:bookId/file', authenticateToken, async (req, res) => {
  try {
    const bookName = Buffer.from(req.params.bookId, 'base64').toString('utf-8');

    // Check if it's a shared book
    let bookPath;
    if (bookName.startsWith('shared/')) {
      const sharedPath = bookName.replace('shared/', '');
      // Map category to capitalized folder
      const parts = sharedPath.split('/');
      const categoryMap = { 'novels': 'Novels', 'manga': 'Manga', 'textbooks': 'Textbooks' };
      parts[0] = categoryMap[parts[0]] || parts[0];
      bookPath = path.join(SHARED_BOOKS_DIR, parts.join('/'));
    } else {
      bookPath = path.join(getUserBooksDir(req.userId), bookName);
    }

    const stats = await fs.stat(bookPath);
    if (stats.isFile()) {
      // Add caching headers for PDF files (1 hour cache)
      res.set({
        'Cache-Control': 'private, max-age=3600',
        'ETag': `"${stats.mtime.getTime()}-${stats.size}"`
      });
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
app.get('/api/images/*', authenticateToken, async (req, res) => {
  try {
    // Get the full path from the wildcard
    const imagePath = req.params[0];

    // Check if it's a shared book image
    let fullPath;
    if (imagePath.startsWith('shared/')) {
      const sharedPath = imagePath.replace('shared/', '');
      // Map category to capitalized folder
      const parts = sharedPath.split('/');
      const categoryMap = { 'novels': 'Novels', 'manga': 'Manga', 'textbooks': 'Textbooks' };
      parts[0] = categoryMap[parts[0]] || parts[0];
      fullPath = path.join(SHARED_BOOKS_DIR, parts.join('/'));
    } else {
      fullPath = path.join(getUserBooksDir(req.userId), imagePath);
    }

    res.sendFile(fullPath);
  } catch (error) {
    console.error('Error serving image:', error);
    res.status(404).json({ error: 'Image not found' });
  }
});

// Upload books
app.post('/api/upload', authenticateToken, async (req, res) => {
  try {
    // Process upload with multer
    upload.array('books', 10)(req, res, async (err) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({ error: 'File too large. Maximum file size is 500MB.' });
        }
        return res.status(400).json({ error: err.message });
      }

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
    const { filename, chunkIndex, totalChunks, category } = req.body;
    const chunk = req.file.buffer;

    if (!filename || chunkIndex === undefined || totalChunks === undefined) {
      return res.status(400).json({ error: 'Missing chunk information' });
    }

    const uploadId = `${req.userId}_${filename}`;
    const selectedCategory = category || 'novels';

    // Initialize chunk storage for this upload
    if (!chunkStorage.has(uploadId)) {
      chunkStorage.set(uploadId, {
        chunks: new Array(parseInt(totalChunks)),
        filename: filename,
        category: selectedCategory,
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

      // Save to user's category directory
      const userDir = getUserBooksDir(req.userId);
      const categoryDir = path.join(userDir, uploadData.category);
      await fs.mkdir(categoryDir, { recursive: true });

      const filePath = path.join(categoryDir, filename);
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

// Change book category
app.post('/api/books/:bookId/category', authenticateToken, async (req, res) => {
  try {
    const bookId = req.params.bookId;
    const { category } = req.body;

    if (!category || !['novels', 'manga', 'textbooks'].includes(category)) {
      return res.status(400).json({ error: 'Valid category is required (novels, manga, textbooks)' });
    }

    const bookPath = Buffer.from(bookId, 'base64').toString('utf-8');
    const oldPath = path.join(getUserBooksDir(req.userId), bookPath);

    // Extract filename from path
    const fileName = path.basename(bookPath);
    const newPath = path.join(getUserBooksDir(req.userId), category, fileName);

    // Check if book exists
    await fs.stat(oldPath);

    // Check if destination already exists
    try {
      await fs.access(newPath);
      return res.status(400).json({ error: 'A book with this name already exists in the target category' });
    } catch {
      // Good, doesn't exist
    }

    // Ensure target category directory exists
    await fs.mkdir(path.join(getUserBooksDir(req.userId), category), { recursive: true });

    // Move the file/directory
    await fs.rename(oldPath, newPath);

    res.json({
      success: true,
      message: 'Book category changed successfully',
      newId: Buffer.from(`${category}/${fileName}`).toString('base64')
    });
  } catch (error) {
    console.error('Error changing category:', error);
    res.status(500).json({ error: 'Failed to change category' });
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

// Delete a book
app.delete('/api/books/:bookId', authenticateToken, async (req, res) => {
  try {
    const bookId = req.params.bookId;
    const bookPath = Buffer.from(bookId, 'base64').toString('utf-8');
    const fullPath = path.join(getUserBooksDir(req.userId), bookPath);

    // Check if book exists
    const stats = await fs.stat(fullPath);

    // Delete file or directory
    if (stats.isFile()) {
      await fs.unlink(fullPath);
    } else if (stats.isDirectory()) {
      await fs.rm(fullPath, { recursive: true, force: true });
    }

    // Clean up cover settings
    const settingsPath = path.join(USER_BOOKS_DIR, req.userId, '.cover-settings.json');
    try {
      const data = await fs.readFile(settingsPath, 'utf8');
      const settings = JSON.parse(data);
      if (settings[bookId]) {
        delete settings[bookId];
        await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2));
      }
    } catch {
      // No settings file, that's okay
    }

    res.json({ success: true, message: 'Book deleted successfully' });
  } catch (error) {
    console.error('Error deleting book:', error);
    res.status(500).json({ error: 'Failed to delete book' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`BookReader server running at http://localhost:${PORT}`);
  console.log(`User books will be stored in: ${USER_BOOKS_DIR}`);
});
