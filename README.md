# BookReader

A clean, modern web-based e-book and manga reader that lets you read your downloaded books and manga from a local folder with automatic progress tracking.

## Features

- **User Authentication** - Secure login and registration system
- **Private Libraries** - Each user has their own isolated book collection
- **Browse Your Library** - Automatically scans and displays all YOUR books
- **Multiple Format Support** - Supports manga folders (with images) and PDF files
- **PDF Support** - Full PDF rendering with PDF.js for smooth reading experience
- **Progress Tracking** - Automatically remembers where YOU left off in each book
- **Upload Books** - Drag & drop or browse to upload books directly to YOUR library
- **Theme Customization** - Choose between Light mode, Dark mode, or custom background colors
- **Clean UI** - Beautiful gradient interface with smooth animations
- **Keyboard Navigation** - Use arrow keys (or A/D keys) to navigate pages
- **Page Slider** - Quickly jump to any page in your book
- **Responsive Design** - Works on desktop and mobile devices
- **PWA Support** - Install as a standalone app on mobile devices with no URL bar (Updated: 2025-10-16)
- **Mobile Optimized** - No refresh issues when reading manga on mobile, smooth touch gestures (Updated: 2025-10-16)

## Technical Specifications

### Architecture

**Backend (Node.js + Express)**
- RESTful API server running on port 8669
- JWT-based authentication system
- User-specific file storage and isolation
- File system scanning to detect books and manga (per user)
- Static file serving for images and books (protected)
- File upload handling with Multer (user-specific)
- Base64 ID encoding for secure file path handling
- bcrypt password hashing

**Frontend (Vanilla JavaScript + HTML/CSS)**
- Single-page application with multiple views (Library, Reader, Settings, Upload)
- PDF.js for client-side PDF rendering
- LocalStorage for client-side progress and settings persistence
- Responsive CSS Grid layout for book library
- Modal-based UI for settings and upload
- Drag & drop file upload support
- Theme customization (Light/Dark/Custom colors)

### Tech Stack

- **Runtime**: Node.js
- **Backend Framework**: Express.js
- **Authentication**: JWT (jsonwebtoken) + bcrypt
- **Session Management**: express-session
- **File Upload**: Multer
- **PDF Rendering**: PDF.js (Mozilla)
- **Frontend**: Vanilla JavaScript (no framework dependencies)
- **Database**: JSON file-based (users.json)
- **Storage**: Browser localStorage for settings and progress; File system for books (user-isolated)
- **Styling**: Pure CSS with gradient theming and dark mode

### File Structure

```
BookReader/
├── user_books/           # User-specific book storage (auto-created)
│   ├── [user-id-1]/     # Books for user 1
│   └── [user-id-2]/     # Books for user 2
├── public/               # Frontend files
│   ├── index.html        # Main app HTML
│   ├── auth.html         # Login/Registration page
│   ├── styles.css        # App styling
│   ├── auth.css          # Auth page styling
│   ├── app.js            # Main app logic
│   └── auth.js           # Auth page logic
├── server.js             # Backend Express server with auth
├── db.js                 # Simple JSON database functions
├── users.json            # User data (auto-created, git-ignored)
├── package.json          # Dependencies and scripts
├── Dockerfile            # Docker container definition
├── docker-compose.yml    # Docker Compose configuration
├── .dockerignore         # Docker build ignore rules
├── start.sh              # Quick start script (Linux/Mac)
├── start.bat             # Quick start script (Windows)
├── .env.example          # Environment variables template
├── .gitignore            # Git ignore rules
├── DOCKER.md             # Docker usage guide
├── CLAUDE.md             # Project specifications
└── README.md             # This file
```

## Installation

### Option 1: Docker (Recommended)

The easiest way to run BookReader on any computer:

1. **Prerequisites**
   - Install [Docker](https://docs.docker.com/get-docker/)
   - Install [Docker Compose](https://docs.docker.com/compose/install/) (usually included with Docker Desktop)

2. **Start the Application**

   **Quick Start (Linux/Mac):**
   ```bash
   ./start.sh
   ```

   **Quick Start (Windows):**
   ```cmd
   start.bat
   ```

   **Or manually:**
   ```bash
   docker compose up -d
   ```

3. **Open in Browser**
   - Navigate to `http://localhost:8669`
   - You'll be redirected to the login/registration page

4. **Stop the Application**
   ```bash
   docker compose down
   ```

5. **Update the Application**
   ```bash
   docker compose down
   docker compose build --no-cache
   docker compose up -d
   ```

**Docker Notes:**
- All user data (books, users, settings) is stored in the `user_books/` directory and `users.json` file
- These are automatically persisted on your host machine even when the container is removed
- To change the JWT secret, create a `.env` file with `JWT_SECRET=your-secret-here`

### Option 2: Manual Installation

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Start the Server**
   ```bash
   npm start
   ```

3. **Open in Browser**
   - Navigate to `http://localhost:8669`
   - You'll be redirected to the login/registration page

### First Time Setup

1. **Important: Initial Docker Setup**
   - **If using Docker**: Before starting for the first time, create an empty `users.json` file:
     ```bash
     echo '{"users":[]}' > users.json
     ```
   - This prevents Docker from creating `users.json` as a directory, which would cause registration to fail
   - Then start normally with `docker compose up -d`

2. **Create an Account**
   - Click "Register here" on the login page
   - Enter a username (min 3 characters) and password (min 6 characters)
   - You'll be automatically logged in after registration

3. **Add Your Books**
   - Use the upload button (📤) in the app to upload books
   - Or manually place books in `user_books/[your-user-id]/`
   - Each user's books are completely isolated

## Usage

### Reading Books

1. Click on any book card in the library to open it
2. Use the navigation buttons (← →) or arrow keys to turn pages
3. Use the slider at the bottom to jump to specific pages
4. Your progress is saved automatically
5. Click "Back to Library" to return to your collection

### Mobile Usage (Updated: 2025-10-16)

**Installing as a Web App:**
1. Open BookReader in your mobile browser
2. **iOS**: Tap Share → Add to Home Screen
3. **Android**: Tap Menu (⋮) → Add to Home Screen
4. Launch from the home screen icon for a full-screen, app-like experience

**Benefits of Installing:**
- No URL bar for distraction-free reading
- Standalone app experience
- Prevents accidental page refreshes while reading manga
- Better gesture support for page navigation
- Works like a native app

**Reading on Mobile:**
- Swipe left/right to turn pages
- Touch navigation buttons for precise control
- Pinch and zoom disabled to prevent accidental refreshes
- Fixed viewport prevents pull-to-refresh interruptions

### User Account Management

- **Logout**: Click the logout button (🚪) in the top-right corner
- **Multiple Users**: Each user has their own completely separate library
- **Privacy**: Books uploaded by one user are never visible to other users
- **Progress**: Reading progress is tracked per user

### Uploading Books

1. Click the upload button (📤) in the top-right corner
2. Drag & drop book files into the upload area, or click to browse
3. Supported formats: PDF, EPUB, CBZ, CBR, MOBI (up to 10 files at once)
4. Wait for upload to complete - YOUR library will refresh automatically
5. Books are stored in your private user folder

### Customizing Theme

1. Click the settings button (⚙️) in the top-right corner
2. Choose between:
   - **Light Mode** - Clean light theme
   - **Dark Mode** - Eye-friendly dark theme
   - **Custom Color** - Pick any color for a custom gradient background
3. Your theme preference is saved and persists across sessions

### Keyboard Shortcuts

- `Arrow Left` or `A` - Previous page
- `Arrow Right` or `D` - Next page
- `Home` - First page
- `End` - Last page

### Supported Formats

**Fully Supported:**
- PDF files - Full rendering with PDF.js
- Image-based manga (folders containing JPG, PNG, GIF, WEBP)

**Detected (Upload Support Only):**
- EPUB files (detected in library, rendering not yet implemented)
- CBZ/CBR files (detected in library, rendering not yet implemented)
- MOBI files (detected in library, rendering not yet implemented)

## API Endpoints

### GET `/api/books`
Returns a list of all books in the Books folder.

**Response:**
```json
[
  {
    "id": "base64-encoded-filename",
    "name": "Book Name",
    "type": "manga|pdf|epub",
    "path": "filename",
    "isDirectory": true,
    "size": 1234567,
    "modified": "2025-01-01T00:00:00.000Z"
  }
]
```

### GET `/api/books/:bookId/pages`
Returns pages for a specific book (works for image-based manga).

**Response:**
```json
{
  "totalPages": 150,
  "pages": [
    {
      "pageNumber": 1,
      "filename": "001.jpg",
      "path": "manga-name/001.jpg"
    }
  ]
}
```

### GET `/api/images/:bookName/:imageName`
Serves an individual image file from a manga folder.

### GET `/api/books/:bookId/file`
Serves a book file directly (for PDF/EPUB downloads).

### POST `/api/upload`
Upload books to the server.

**Request:**
- Content-Type: multipart/form-data
- Field name: `books` (supports multiple files, max 10)
- Allowed types: .pdf, .epub, .cbz, .cbr, .mobi

**Response:**
```json
{
  "success": true,
  "message": "Successfully uploaded 2 file(s)",
  "files": [
    { "name": "book.pdf", "size": 1234567 }
  ]
}
```

## Storage

### Progress Tracking

Reading progress is stored in the browser's localStorage with the following structure:

```json
{
  "bookReader_progress": {
    "book-id-1": {
      "page": 42,
      "totalPages": 200,
      "lastRead": "2025-01-01T12:00:00.000Z"
    }
  }
}
```

Progress is automatically saved every time you change pages and persists across browser sessions.

### Settings Storage

User preferences are stored in localStorage:

```json
{
  "bookReader_settings": {
    "theme": "light|dark|default",
    "bgColor": "#667eea"
  }
}
```

Settings persist across browser sessions and apply immediately when changed.

## Design Decisions

### Why This Architecture?

1. **No Database Required** - Uses filesystem as source of truth, localStorage for progress
2. **Simple Setup** - Just install and add books, no configuration needed
3. **Portable** - All progress stored client-side, easy to backup/export
4. **Lightweight** - Minimal dependencies, fast startup

### Why PDF.js for PDF Rendering?

PDF.js is Mozilla's battle-tested PDF renderer that runs entirely in the browser. This approach:
- Eliminates server-side PDF parsing complexity
- Provides smooth, native-like PDF reading experience
- Works offline after initial page load
- No server resources needed for rendering

### Why LocalStorage?

- No server-side database setup required
- Instant saves with no network latency
- Works offline after initial load
- Per-browser persistence (privacy by default)

## Recent Updates

### 2025-10-16: Mobile PWA Enhancements
- Added full Progressive Web App (PWA) support
- Fixed mobile refresh issues when reading manga/PDFs
- Implemented standalone mode to hide URL bar on mobile
- Added viewport locking to prevent pull-to-refresh
- Disabled pinch-to-zoom to prevent accidental interruptions
- Enhanced touch gesture support for smoother reading
- Improved mobile meta tags for better app-like experience

## Future Enhancements

Potential features for future versions:

- [x] Full PDF rendering support
- [x] Dark/Light theme toggle
- [x] File upload from web interface
- [x] PWA support for mobile devices (2025-10-16)
- [x] Mobile optimization and refresh prevention (2025-10-16)
- [ ] EPUB text rendering
- [ ] CBZ/CBR archive extraction
- [ ] Bookmark system (multiple bookmarks per book)
- [ ] Reading statistics dashboard
- [ ] Export/import progress data
- [ ] Two-page spread view for manga
- [ ] Zoom and pan controls for PDFs
- [ ] Full-text search across books
- [ ] Collections and tags
- [ ] Cloud sync

## License

MIT

## Contributing

This is a personal project, but feel free to fork and customize for your own use!
