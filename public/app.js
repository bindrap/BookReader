// Check authentication
function checkAuth() {
  const token = localStorage.getItem('token');
  if (!token) {
    window.location.href = '/auth.html';
    return false;
  }
  return true;
}

// Get auth headers
function getAuthHeaders() {
  const token = localStorage.getItem('token');
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
}

// Logout function
function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('username');
  window.location.href = '/auth.html';
}

// Register Service Worker for PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js')
      .then(registration => {
        console.log('Service Worker registered successfully:', registration.scope);
      })
      .catch(error => {
        console.log('Service Worker registration failed:', error);
      });
  });
}

// State Management
let currentBook = null;
let currentPages = [];
let currentPageIndex = 0;
let pdfDoc = null;
let epubBook = null;
let epubRendition = null;
let currentBookForOptions = null;
let currentCategory = 'all';
let allBooks = [];
let pdfZoomLevel = 1.5; // Default zoom level for PDFs
let pdfPageCache = {}; // Cache for rendered PDF pages

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// Local Storage Keys
const SETTINGS_KEY = 'bookReader_settings';

// Get user-specific storage key
function getUserStorageKey(key) {
  const username = localStorage.getItem('username');
  return `${key}_${username}`;
}

// Get reading progress from localStorage (user-specific)
function getProgress() {
  const storageKey = getUserStorageKey('bookReader_progress');
  const stored = localStorage.getItem(storageKey);
  return stored ? JSON.parse(stored) : {};
}

// Save reading progress to localStorage (user-specific)
function saveProgress(bookId, page, totalPages) {
  const progress = getProgress();
  progress[bookId] = {
    page,
    totalPages,
    lastRead: new Date().toISOString()
  };
  const storageKey = getUserStorageKey('bookReader_progress');
  localStorage.setItem(storageKey, JSON.stringify(progress));
}

// Get progress percentage
function getProgressPercentage(bookId, totalPages) {
  const progress = getProgress();
  if (!progress[bookId]) return 0;
  return Math.round((progress[bookId].page / totalPages) * 100);
}

// Get last read page
function getLastReadPage(bookId) {
  const progress = getProgress();
  return progress[bookId]?.page || 1;
}

// Settings Management
function getSettings() {
  const stored = localStorage.getItem(SETTINGS_KEY);
  return stored ? JSON.parse(stored) : { theme: 'default', bgColor: '#667eea' };
}

function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function applySettings() {
  const settings = getSettings();

  // Apply theme
  document.body.className = settings.theme === 'light' ? 'light-mode' :
                           settings.theme === 'dark' ? 'dark-mode' : '';

  // Apply background color if not using default theme
  if (settings.theme === 'default' && settings.bgColor) {
    document.body.style.background = `linear-gradient(135deg, ${settings.bgColor} 0%, ${adjustColor(settings.bgColor, -20)} 100%)`;
  }

  // Update theme button states
  document.querySelectorAll('.theme-btn').forEach(btn => btn.classList.remove('active'));
  if (settings.theme === 'light') {
    document.getElementById('light-mode-btn')?.classList.add('active');
  } else if (settings.theme === 'dark') {
    document.getElementById('dark-mode-btn')?.classList.add('active');
  }

  // Update color picker
  const colorPicker = document.getElementById('bg-color-picker');
  if (colorPicker) colorPicker.value = settings.bgColor;
}

function adjustColor(color, percent) {
  const num = parseInt(color.replace("#",""), 16);
  const amt = Math.round(2.55 * percent);
  const R = (num >> 16) + amt;
  const G = (num >> 8 & 0x00FF) + amt;
  const B = (num & 0x0000FF) + amt;
  return "#" + (0x1000000 + (R<255?R<1?0:R:255)*0x10000 +
    (G<255?G<1?0:G:255)*0x100 + (B<255?B<1?0:B:255))
    .toString(16).slice(1);
}

// Prevent mobile viewport scaling and refresh issues
function lockMobileViewport() {
  // Prevent pull-to-refresh on mobile
  document.body.style.overscrollBehavior = 'none';
  document.documentElement.style.overscrollBehavior = 'none';

  // Prevent zoom on mobile
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('gesturechange', (e) => e.preventDefault());
  document.addEventListener('gestureend', (e) => e.preventDefault());

  // Lock viewport for better mobile experience
  const viewport = document.querySelector('meta[name="viewport"]');
  if (viewport && /Mobi|Android/i.test(navigator.userAgent)) {
    viewport.setAttribute('content',
      'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover, minimal-ui');
  }

  // Hide URL bar on mobile by scrolling
  if (/Mobi|Android/i.test(navigator.userAgent)) {
    window.addEventListener('load', () => {
      setTimeout(() => {
        window.scrollTo(0, 1);
      }, 100);
    });
  }
}

// Initialize the app
async function init() {
  if (!checkAuth()) return;

  // Lock viewport on mobile to prevent refresh issues
  lockMobileViewport();

  // Display username
  const username = localStorage.getItem('username');
  if (username) {
    const userDisplay = document.createElement('span');
    userDisplay.className = 'user-display';
    userDisplay.textContent = `Welcome, ${username}`;
    document.querySelector('.header-controls').prepend(userDisplay);
  }

  applySettings();
  await loadLibrary();
  setupEventListeners();
  setupModalHandlers();
  setupBrowseModal();
  setupBookOptionsModal();
  setupCategoryTabs();
}

// Load all books from the server
async function loadLibrary() {
  try {
    const response = await fetch('/api/books', {
      headers: getAuthHeaders()
    });

    if (response.status === 401 || response.status === 403) {
      logout();
      return;
    }

    const books = await response.json();
    allBooks = books; // Store all books for filtering

    const container = document.getElementById('books-container');

    // Filter books by current category
    const filteredBooks = currentCategory === 'all'
      ? books
      : books.filter(book => book.category === currentCategory);

    if (filteredBooks.length === 0) {
      const message = books.length === 0
        ? 'No books found. Add books to the Books folder!'
        : `No books in the ${currentCategory} category.`;
      container.innerHTML = `<div class="loading">${message}</div>`;
      return;
    }

    container.innerHTML = filteredBooks.map(book => {
      const icon = book.type === 'manga' ? '📚' : book.type === 'pdf' ? '📄' : '📖';
      const progress = getProgress();
      const bookProgress = progress[book.id];
      const progressPercent = bookProgress
        ? Math.round((bookProgress.page / bookProgress.totalPages) * 100)
        : 0;

      return `
        <div class="book-card ${book.isShared ? 'shared-book' : ''}" data-book-id="${book.id}">
          ${book.isShared ? '<div class="shared-badge">📖 Shared</div>' : ''}
          <button class="book-options-btn" data-book-id="${book.id}" title="Book Options">⋮</button>
          <div class="book-cover-container" id="cover-${book.id}">
            <div class="book-icon">${icon}</div>
          </div>
          <div class="book-name">${book.name}</div>
          <div class="book-type">${book.type}</div>
          ${progressPercent > 0 ? `
            <div class="progress-bar">
              <div class="progress-fill" style="width: ${progressPercent}%"></div>
            </div>
          ` : ''}
        </div>
      `;
    }).join('');

    // Load covers for all filtered books
    filteredBooks.forEach(book => loadBookCover(book));

    // Add click handlers to book cards
    document.querySelectorAll('.book-card').forEach(card => {
      card.addEventListener('click', (e) => {
        // Don't open book if clicking options button
        if (e.target.classList.contains('book-options-btn')) {
          return;
        }
        const bookId = card.dataset.bookId;
        const book = allBooks.find(b => b.id === bookId);
        openBook(book);
      });
    });

    // Add click handlers to options buttons
    document.querySelectorAll('.book-options-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const bookId = btn.dataset.bookId;
        const book = allBooks.find(b => b.id === bookId);
        openBookOptions(book);
      });
    });
  } catch (error) {
    console.error('Error loading library:', error);
    document.getElementById('books-container').innerHTML =
      '<div class="loading">Error loading library. Please refresh the page.</div>';
  }
}

// Open a book in the reader
async function openBook(book) {
  currentBook = book;

  try {
    if (book.type === 'pdf') {
      // Load PDF file
      const token = localStorage.getItem('token');
      const pdfUrl = `/api/books/${book.id}/file`;
      const loadingTask = pdfjsLib.getDocument({
        url: pdfUrl,
        httpHeaders: {
          'Authorization': `Bearer ${token}`
        }
      });
      pdfDoc = await loadingTask.promise;

      // Create pages array for PDF
      currentPages = [];
      for (let i = 1; i <= pdfDoc.numPages; i++) {
        currentPages.push({ pageNumber: i });
      }
      epubBook = null;
      epubRendition = null;
    } else if (book.type === 'epub') {
      // EPUB support disabled - recommend PDF conversion
      alert('EPUB files are not currently supported due to performance and compatibility issues.\n\nPlease convert your EPUB to PDF for the best reading experience.\n\nRecommended tools:\n• Calibre (free)\n• Online converters: cloudconvert.com, zamzar.com');
      return;
    } else {
      // Get pages for the book (manga/images)
      const response = await fetch(`/api/books/${book.id}/pages`, {
        headers: getAuthHeaders()
      });

      if (response.status === 401 || response.status === 403) {
        logout();
        return;
      }

      const data = await response.json();

      if (data.totalPages === 0) {
        alert('This book format is not yet supported or contains no pages.');
        return;
      }

      currentPages = data.pages;
      pdfDoc = null;
      epubBook = null;
      epubRendition = null;
    }

    // Load last read page or start from page 1
    const lastPage = getLastReadPage(book.id);
    currentPageIndex = Math.min(lastPage - 1, currentPages.length - 1);

    // Show reader view
    document.getElementById('library-view').style.display = 'none';
    document.getElementById('reader-view').style.display = 'flex';
    document.getElementById('book-title').textContent = book.name;

    // Prevent body scroll on mobile when reading
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';
    document.body.style.height = '100%';

    // Setup page slider
    const slider = document.getElementById('page-slider');
    slider.max = currentPages.length;
    slider.value = currentPageIndex + 1;

    // Display current page
    displayPage(currentPageIndex);
  } catch (error) {
    console.error('Error opening book:', error);
    alert('Failed to open book. Please try again.');
  }
}

// Display a specific page
async function displayPage(pageIndex) {
  if (!currentBook || !currentPages.length) return;

  currentPageIndex = pageIndex;
  const page = currentPages[pageIndex];

  // Update page content
  const pageContent = document.getElementById('page-content');
  const pdfCanvas = document.getElementById('pdf-canvas');
  const epubViewer = document.getElementById('epub-viewer');

  // Hide all viewers first
  pdfCanvas.style.display = 'none';
  epubViewer.style.display = 'none';

  // Remove any img elements
  const existingImg = pageContent.querySelector('img');
  if (existingImg) existingImg.remove();

  // Prevent scroll during page load on mobile
  if (/Mobi|Android/i.test(navigator.userAgent)) {
    window.scrollTo(0, 0);
  }

  if (currentBook.type === 'pdf') {
    // Render PDF page
    pdfCanvas.style.display = 'block';
    await renderPDFPage(page.pageNumber);
  } else if (currentBook.type === 'epub') {
    // Display EPUB page
    epubViewer.style.display = 'block';
    if (epubRendition) {
      // Use href or cfi for navigation
      await epubRendition.display(page.cfi || page.href);
    }
  } else if (currentBook.isDirectory) {
    // Display image for manga
    const img = document.createElement('img');
    img.src = `/api/images/${page.path}`;
    img.alt = `Page ${page.pageNumber}`;
    pageContent.appendChild(img);
  } else {
    const p = document.createElement('p');
    p.textContent = `Page ${page.pageNumber}`;
    pageContent.appendChild(p);
  }

  // Update UI
  updateReaderUI();

  // Save progress
  saveProgress(currentBook.id, currentPageIndex + 1, currentPages.length);
}

// Render a PDF page with caching
async function renderPDFPage(pageNumber) {
  if (!pdfDoc) return;

  try {
    const canvas = document.getElementById('pdf-canvas');
    const context = canvas.getContext('2d');

    // Create cache key based on page number and zoom level
    const cacheKey = `${currentBook.id}_${pageNumber}_${pdfZoomLevel}`;

    // Check if we have this page cached
    if (pdfPageCache[cacheKey]) {
      // Use cached image data
      const cachedData = pdfPageCache[cacheKey];
      canvas.width = cachedData.width;
      canvas.height = cachedData.height;
      context.putImageData(cachedData.imageData, 0, 0);
      canvas.style.display = 'block';
      return;
    }

    // Not cached, render the page
    const page = await pdfDoc.getPage(pageNumber);

    // Calculate scale using current zoom level
    const viewport = page.getViewport({ scale: pdfZoomLevel });
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    // Make canvas visible
    canvas.style.display = 'block';

    // Render PDF page
    const renderContext = {
      canvasContext: context,
      viewport: viewport
    };

    await page.render(renderContext).promise;

    // Cache the rendered page (limit cache to 10 pages to save memory)
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    pdfPageCache[cacheKey] = {
      imageData: imageData,
      width: canvas.width,
      height: canvas.height
    };

    // Limit cache size to prevent memory issues
    const cacheKeys = Object.keys(pdfPageCache);
    if (cacheKeys.length > 10) {
      // Remove oldest cached page
      delete pdfPageCache[cacheKeys[0]];
    }
  } catch (error) {
    console.error('Error rendering PDF page:', error);
  }
}

// Zoom functions for PDF
function zoomIn() {
  if (currentBook && currentBook.type === 'pdf') {
    pdfZoomLevel = Math.min(pdfZoomLevel + 0.25, 3.0); // Max 3x zoom
    // Clear cache for current page at all zoom levels to force re-render
    const pageNumber = currentPages[currentPageIndex].pageNumber;
    Object.keys(pdfPageCache).forEach(key => {
      if (key.startsWith(`${currentBook.id}_${pageNumber}_`)) {
        delete pdfPageCache[key];
      }
    });
    renderPDFPage(pageNumber);
  }
}

function zoomOut() {
  if (currentBook && currentBook.type === 'pdf') {
    pdfZoomLevel = Math.max(pdfZoomLevel - 0.25, 0.5); // Min 0.5x zoom
    // Clear cache for current page at all zoom levels to force re-render
    const pageNumber = currentPages[currentPageIndex].pageNumber;
    Object.keys(pdfPageCache).forEach(key => {
      if (key.startsWith(`${currentBook.id}_${pageNumber}_`)) {
        delete pdfPageCache[key];
      }
    });
    renderPDFPage(pageNumber);
  }
}

function resetZoom() {
  if (currentBook && currentBook.type === 'pdf') {
    pdfZoomLevel = 1.5; // Reset to default
    // Clear cache for current page at all zoom levels to force re-render
    const pageNumber = currentPages[currentPageIndex].pageNumber;
    Object.keys(pdfPageCache).forEach(key => {
      if (key.startsWith(`${currentBook.id}_${pageNumber}_`)) {
        delete pdfPageCache[key];
      }
    });
    renderPDFPage(pageNumber);
  }
}

// Update reader UI elements
function updateReaderUI() {
  const pageInfo = document.getElementById('page-info');
  pageInfo.textContent = `${currentPageIndex + 1} / ${currentPages.length}`;

  const slider = document.getElementById('page-slider');
  slider.value = currentPageIndex + 1;

  // Update navigation buttons
  document.getElementById('prev-page').disabled = currentPageIndex === 0;
  document.getElementById('next-page').disabled = currentPageIndex === currentPages.length - 1;
}

// Setup event listeners
function setupEventListeners() {
  // Back to library button
  document.getElementById('back-btn').addEventListener('click', () => {
    document.getElementById('reader-view').style.display = 'none';
    document.getElementById('library-view').style.display = 'block';

    // Restore body scroll
    document.body.style.overflow = '';
    document.body.style.position = '';
    document.body.style.width = '';
    document.body.style.height = '';

    currentBook = null;
    currentPages = [];
    loadLibrary(); // Refresh to show updated progress
  });

  // Navigation buttons
  document.getElementById('prev-page').addEventListener('click', () => {
    if (currentPageIndex > 0) {
      displayPage(currentPageIndex - 1);
    }
  });

  document.getElementById('next-page').addEventListener('click', () => {
    if (currentPageIndex < currentPages.length - 1) {
      displayPage(currentPageIndex + 1);
    }
  });

  document.getElementById('first-page').addEventListener('click', () => {
    displayPage(0);
  });

  document.getElementById('last-page').addEventListener('click', () => {
    displayPage(currentPages.length - 1);
  });

  // Page slider
  document.getElementById('page-slider').addEventListener('input', (e) => {
    displayPage(parseInt(e.target.value) - 1);
  });

  // Fullscreen button
  document.getElementById('fullscreen-btn').addEventListener('click', toggleFullscreen);

  // Zoom buttons for PDF
  document.getElementById('zoom-in-btn').addEventListener('click', zoomIn);
  document.getElementById('zoom-out-btn').addEventListener('click', zoomOut);
  document.getElementById('zoom-reset-btn').addEventListener('click', resetZoom);

  // Keyboard navigation
  document.addEventListener('keydown', (e) => {
    if (currentBook) {
      if (e.key === 'ArrowLeft' || e.key === 'a') {
        if (currentPageIndex > 0) displayPage(currentPageIndex - 1);
      } else if (e.key === 'ArrowRight' || e.key === 'd') {
        if (currentPageIndex < currentPages.length - 1) displayPage(currentPageIndex + 1);
      } else if (e.key === 'Home') {
        displayPage(0);
      } else if (e.key === 'End') {
        displayPage(currentPages.length - 1);
      } else if (e.key === 'f' || e.key === 'F') {
        toggleFullscreen();
      }
    }
  });

  // Touch gesture navigation for swipe-based page turning
  setupTouchGestures();
}

// Touch gesture navigation
function setupTouchGestures() {
  const pageContent = document.getElementById('page-content');
  let touchStartX = 0;
  let touchStartY = 0;
  let touchEndX = 0;
  let touchEndY = 0;
  const minSwipeDistance = 50; // Minimum distance for a swipe

  pageContent.addEventListener('touchstart', (e) => {
    if (!currentBook) return;
    touchStartX = e.changedTouches[0].screenX;
    touchStartY = e.changedTouches[0].screenY;
  }, { passive: true });

  pageContent.addEventListener('touchend', (e) => {
    if (!currentBook) return;
    touchEndX = e.changedTouches[0].screenX;
    touchEndY = e.changedTouches[0].screenY;
    handleSwipe();
  }, { passive: true });

  function handleSwipe() {
    const deltaX = touchEndX - touchStartX;
    const deltaY = touchEndY - touchStartY;

    // Check if horizontal swipe is more significant than vertical
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > minSwipeDistance) {
      if (deltaX > 0) {
        // Swipe right - go to previous page
        if (currentPageIndex > 0) {
          displayPage(currentPageIndex - 1);
        }
      } else {
        // Swipe left - go to next page
        if (currentPageIndex < currentPages.length - 1) {
          displayPage(currentPageIndex + 1);
        }
      }
    }
  }
}

// Modal Handlers
function setupModalHandlers() {
  // Logout button
  document.getElementById('logout-btn').addEventListener('click', () => {
    if (confirm('Are you sure you want to logout?')) {
      logout();
    }
  });

  // Settings modal
  const settingsBtn = document.getElementById('settings-btn');
  const settingsModal = document.getElementById('settings-modal');
  const closeSettings = document.getElementById('close-settings');

  settingsBtn.addEventListener('click', () => {
    settingsModal.style.display = 'flex';
    applySettings(); // Update UI to show current settings
  });

  closeSettings.addEventListener('click', () => {
    settingsModal.style.display = 'none';
  });

  // Upload modal
  const uploadBtn = document.getElementById('upload-btn');
  const uploadModal = document.getElementById('upload-modal');
  const closeUpload = document.getElementById('close-upload');

  uploadBtn.addEventListener('click', () => {
    uploadModal.style.display = 'flex';
  });

  closeUpload.addEventListener('click', () => {
    uploadModal.style.display = 'none';
    resetUploadUI();
  });

  // Close modals on background click
  settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) {
      settingsModal.style.display = 'none';
    }
  });

  uploadModal.addEventListener('click', (e) => {
    if (e.target === uploadModal) {
      uploadModal.style.display = 'none';
      resetUploadUI();
    }
  });

  // Theme buttons
  document.getElementById('light-mode-btn').addEventListener('click', () => {
    const settings = getSettings();
    settings.theme = 'light';
    saveSettings(settings);
    applySettings();
  });

  document.getElementById('dark-mode-btn').addEventListener('click', () => {
    const settings = getSettings();
    settings.theme = 'dark';
    saveSettings(settings);
    applySettings();
  });

  // Background color picker
  document.getElementById('bg-color-picker').addEventListener('change', (e) => {
    const settings = getSettings();
    settings.bgColor = e.target.value;
    settings.theme = 'default'; // Reset to default theme when changing color
    saveSettings(settings);
    applySettings();
  });

  // Reset color button
  document.getElementById('reset-color-btn').addEventListener('click', () => {
    const settings = getSettings();
    settings.bgColor = '#667eea';
    settings.theme = 'default';
    saveSettings(settings);
    applySettings();
  });

  // Upload area
  const uploadArea = document.getElementById('upload-area');
  const fileInput = document.getElementById('file-input');

  uploadArea.addEventListener('click', () => {
    fileInput.click();
  });

  // Drag and drop
  uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.style.borderColor = '#5568d3';
    uploadArea.style.background = '#e8ecff';
  });

  uploadArea.addEventListener('dragleave', () => {
    uploadArea.style.borderColor = '#667eea';
    uploadArea.style.background = '#f8f9ff';
  });

  uploadArea.addEventListener('drop', async (e) => {
    e.preventDefault();
    uploadArea.style.borderColor = '#667eea';
    uploadArea.style.background = '#f8f9ff';

    const files = Array.from(e.dataTransfer.files);
    await uploadFiles(files);
  });

  // File input change
  fileInput.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    await uploadFiles(files);
  });
}

// Upload files function with chunked upload support
async function uploadFiles(files) {
  if (files.length === 0) return;

  const uploadProgress = document.getElementById('upload-progress');
  const uploadStatus = document.getElementById('upload-status');
  const progressFill = document.getElementById('upload-progress-fill');
  const uploadArea = document.getElementById('upload-area');
  const categorySelect = document.getElementById('category-select');

  // Get selected category
  const category = categorySelect.value;

  // Validate file sizes (500MB per file max)
  const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB
  for (const file of files) {
    if (file.size > MAX_FILE_SIZE) {
      alert(`File "${file.name}" exceeds the 500MB size limit. Please upload smaller files.`);
      return;
    }
  }

  // Show progress
  uploadArea.style.display = 'none';
  uploadProgress.style.display = 'block';

  try {
    const token = localStorage.getItem('token');
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileSize = file.size;
      const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks

      uploadStatus.textContent = `Uploading ${i + 1}/${files.length}: ${file.name}`;

      // If file is small (< 10MB), upload directly
      if (fileSize < 10 * 1024 * 1024) {
        const formData = new FormData();
        formData.append('books', file);
        formData.append('category', category);

        try {
          const response = await fetch('/api/upload', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`
            },
            body: formData
          });

          if (response.status === 401 || response.status === 403) {
            logout();
            return;
          }

          if (response.ok) {
            successCount++;
          } else {
            failCount++;
          }
        } catch (error) {
          console.error('Upload error:', error);
          failCount++;
        }
      } else {
        // Large file - use chunked upload
        const totalChunks = Math.ceil(fileSize / CHUNK_SIZE);
        let uploadedChunks = 0;

        try {
          for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
            const start = chunkIndex * CHUNK_SIZE;
            const end = Math.min(start + CHUNK_SIZE, fileSize);
            const chunk = file.slice(start, end);

            const formData = new FormData();
            formData.append('chunk', chunk);
            formData.append('filename', file.name);
            formData.append('chunkIndex', chunkIndex);
            formData.append('totalChunks', totalChunks);
            formData.append('category', category);

            const response = await fetch('/api/upload-chunk', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${token}`
              },
              body: formData
            });

            if (response.status === 401 || response.status === 403) {
              logout();
              return;
            }

            if (response.ok) {
              uploadedChunks++;
              const fileProgress = (uploadedChunks / totalChunks) * 100;
              const totalProgress = ((i + fileProgress / 100) / files.length) * 100;
              progressFill.style.width = `${totalProgress}%`;
            } else {
              throw new Error('Chunk upload failed');
            }
          }
          successCount++;
        } catch (error) {
          console.error('Chunked upload error:', error);
          failCount++;
        }
      }

      // Update overall progress
      const overallProgress = ((i + 1) / files.length) * 100;
      progressFill.style.width = `${overallProgress}%`;
    }

    // Show final status
    if (failCount === 0) {
      progressFill.style.width = '100%';
      uploadStatus.textContent = `Successfully uploaded ${successCount} file(s)!`;
    } else {
      uploadStatus.textContent = `Uploaded ${successCount} file(s), ${failCount} failed`;
    }

    // Refresh library after short delay
    setTimeout(async () => {
      await loadLibrary();
      document.getElementById('upload-modal').style.display = 'none';
      resetUploadUI();
    }, 1500);
  } catch (error) {
    console.error('Upload error:', error);
    uploadStatus.textContent = 'Upload failed. Please try again.';
    setTimeout(resetUploadUI, 2000);
  }
}

// Reset upload UI
function resetUploadUI() {
  const uploadProgress = document.getElementById('upload-progress');
  const uploadArea = document.getElementById('upload-area');
  const progressFill = document.getElementById('upload-progress-fill');
  const fileInput = document.getElementById('file-input');

  uploadProgress.style.display = 'none';
  uploadArea.style.display = 'block';
  progressFill.style.width = '0%';
  fileInput.value = '';
}

// Browse Libraries Functions
async function loadUsers() {
  try {
    const response = await fetch('/api/users', {
      headers: getAuthHeaders()
    });

    if (response.status === 401 || response.status === 403) {
      logout();
      return;
    }

    const users = await response.json();
    const usersList = document.getElementById('users-list');
    const sharedBooks = document.getElementById('shared-books');
    const browseTitle = document.getElementById('browse-title');

    // Reset to users list view
    usersList.style.display = 'block';
    sharedBooks.style.display = 'none';
    browseTitle.textContent = 'Browse User Libraries';

    if (users.length === 0) {
      usersList.innerHTML = '<div class="loading">No other users found.</div>';
      return;
    }

    usersList.innerHTML = users.map(user => `
      <div class="user-card" data-user-id="${user.id}">
        <div class="user-icon">👤</div>
        <div class="user-name">${user.username}</div>
        <button class="btn browse-user-btn" data-user-id="${user.id}" data-username="${user.username}">Browse Library →</button>
      </div>
    `).join('');

    // Add click handlers
    document.querySelectorAll('.browse-user-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const userId = btn.dataset.userId;
        const username = btn.dataset.username;
        loadSharedBooks(userId, username);
      });
    });
  } catch (error) {
    console.error('Error loading users:', error);
    document.getElementById('users-list').innerHTML =
      '<div class="loading">Error loading users. Please try again.</div>';
  }
}

async function loadSharedBooks(userId, username) {
  try {
    const response = await fetch(`/api/users/${userId}/books`, {
      headers: getAuthHeaders()
    });

    if (response.status === 401 || response.status === 403) {
      logout();
      return;
    }

    const books = await response.json();
    const usersList = document.getElementById('users-list');
    const sharedBooks = document.getElementById('shared-books');
    const browseTitle = document.getElementById('browse-title');

    // Switch to books view
    usersList.style.display = 'none';
    sharedBooks.style.display = 'grid';
    browseTitle.innerHTML = `
      <button id="back-to-users" class="btn-small" style="margin-right: 1rem;">← Back</button>
      ${username}'s Library
    `;

    // Add back button handler
    document.getElementById('back-to-users').addEventListener('click', loadUsers);

    if (books.length === 0) {
      sharedBooks.innerHTML = '<div class="loading">This user has no books yet.</div>';
      return;
    }

    sharedBooks.innerHTML = books.map(book => {
      const icon = book.type === 'manga' ? '📚' : book.type === 'pdf' ? '📄' : '📖';
      return `
        <div class="book-card shared-book-card">
          <div class="book-icon">${icon}</div>
          <div class="book-name">${book.name}</div>
          <div class="book-type">${book.type}</div>
          <button class="btn btn-small copy-book-btn"
                  data-owner-id="${book.ownerId}"
                  data-book-id="${book.id}"
                  data-book-name="${book.name}">
            Add to My Library
          </button>
        </div>
      `;
    }).join('');

    // Add copy button handlers
    document.querySelectorAll('.copy-book-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const ownerId = btn.dataset.ownerId;
        const bookId = btn.dataset.bookId;
        const bookName = btn.dataset.bookName;
        await copyBook(ownerId, bookId, bookName, btn);
      });
    });
  } catch (error) {
    console.error('Error loading shared books:', error);
    document.getElementById('shared-books').innerHTML =
      '<div class="loading">Error loading books. Please try again.</div>';
  }
}

async function copyBook(ownerId, bookId, bookName, buttonElement) {
  const originalText = buttonElement.textContent;
  buttonElement.disabled = true;
  buttonElement.textContent = 'Copying...';

  try {
    const response = await fetch(`/api/users/${ownerId}/books/${bookId}/copy`, {
      method: 'POST',
      headers: getAuthHeaders()
    });

    if (response.status === 401 || response.status === 403) {
      logout();
      return;
    }

    const result = await response.json();

    if (response.ok) {
      buttonElement.textContent = '✓ Added!';
      buttonElement.style.background = '#28a745';

      // Refresh main library in background
      await loadLibrary();

      setTimeout(() => {
        buttonElement.textContent = originalText;
        buttonElement.disabled = false;
        buttonElement.style.background = '';
      }, 2000);
    } else {
      alert(result.error || 'Failed to copy book');
      buttonElement.textContent = originalText;
      buttonElement.disabled = false;
    }
  } catch (error) {
    console.error('Error copying book:', error);
    alert('Failed to copy book. Please try again.');
    buttonElement.textContent = originalText;
    buttonElement.disabled = false;
  }
}

// Load book cover
async function loadBookCover(book) {
  try {
    // Get cover page setting
    const response = await fetch(`/api/books/${book.id}/cover`, {
      headers: getAuthHeaders()
    });

    if (!response.ok) return;

    const coverData = await response.json();
    const coverPageNumber = coverData.pageNumber || 1;

    const coverContainer = document.getElementById(`cover-${book.id}`);
    if (!coverContainer) return;

    if (book.type === 'pdf') {
      // Load PDF and render the cover page
      const token = localStorage.getItem('token');
      const pdfUrl = `/api/books/${book.id}/file`;
      const loadingTask = pdfjsLib.getDocument({
        url: pdfUrl,
        httpHeaders: { 'Authorization': `Bearer ${token}` }
      });

      const pdf = await loadingTask.promise;

      // Make sure page number is valid
      const pageNum = Math.min(coverPageNumber, pdf.numPages);
      const page = await pdf.getPage(pageNum);

      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      const viewport = page.getViewport({ scale: 0.5 });

      canvas.height = viewport.height;
      canvas.width = viewport.width;

      await page.render({ canvasContext: context, viewport: viewport }).promise;

      coverContainer.innerHTML = '';
      canvas.className = 'book-cover';
      coverContainer.appendChild(canvas);
    } else if (book.isDirectory) {
      // For manga, get the pages and show the cover page
      const pagesResponse = await fetch(`/api/books/${book.id}/pages`, {
        headers: getAuthHeaders()
      });

      if (pagesResponse.ok) {
        const pagesData = await pagesResponse.json();
        if (pagesData.pages && pagesData.pages.length > 0) {
          const pageNum = Math.min(coverPageNumber, pagesData.pages.length);
          const coverPage = pagesData.pages[pageNum - 1];

          const img = document.createElement('img');
          img.className = 'book-cover';
          img.src = `/api/images/${coverPage.path}`;
          img.alt = book.name;

          coverContainer.innerHTML = '';
          coverContainer.appendChild(img);
        }
      }
    }
  } catch (error) {
    console.error('Error loading book cover:', error);
  }
}

// Book Options Functions
async function openBookOptions(book) {
  currentBookForOptions = book;
  const modal = document.getElementById('book-options-modal');
  const titleEl = document.getElementById('book-options-title');
  const nameInput = document.getElementById('book-name-input');
  const coverPageInput = document.getElementById('cover-page-input');
  const categorySelect = document.getElementById('book-category-select');

  titleEl.textContent = `Options: ${book.name}`;
  nameInput.value = book.name.replace(/\.[^/.]+$/, ''); // Remove extension

  // Set current category
  categorySelect.value = book.category || 'novels';

  // Load current cover page setting
  try {
    const response = await fetch(`/api/books/${book.id}/cover`, {
      headers: getAuthHeaders()
    });

    if (response.ok) {
      const coverData = await response.json();
      coverPageInput.value = coverData.pageNumber || 1;
    } else {
      coverPageInput.value = 1;
    }
  } catch (error) {
    coverPageInput.value = 1;
  }

  modal.style.display = 'flex';
}

async function renameBook() {
  if (!currentBookForOptions) return;

  const newName = document.getElementById('book-name-input').value.trim();
  if (!newName) {
    alert('Please enter a new name');
    return;
  }

  try {
    const response = await fetch(`/api/books/${currentBookForOptions.id}/rename`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ newName })
    });

    if (response.status === 401 || response.status === 403) {
      logout();
      return;
    }

    const result = await response.json();

    if (response.ok) {
      alert('Book renamed successfully!');
      document.getElementById('book-options-modal').style.display = 'none';
      await loadLibrary();
    } else {
      alert(result.error || 'Failed to rename book');
    }
  } catch (error) {
    console.error('Error renaming book:', error);
    alert('Failed to rename book. Please try again.');
  }
}

async function setCoverPage() {
  if (!currentBookForOptions) return;

  const pageInput = document.getElementById('cover-page-input');
  const pageNumber = parseInt(pageInput.value);

  if (!pageNumber || pageNumber < 1) {
    alert('Please enter a valid page number');
    return;
  }

  try {
    const response = await fetch(`/api/books/${currentBookForOptions.id}/cover`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ pageNumber })
    });

    if (response.status === 401 || response.status === 403) {
      logout();
      return;
    }

    const result = await response.json();

    if (response.ok) {
      alert(`Cover page set to page ${pageNumber}!`);
      await loadLibrary(); // Refresh to show new cover
    } else {
      alert(result.error || 'Failed to set cover page');
    }
  } catch (error) {
    console.error('Error setting cover page:', error);
    alert('Failed to set cover page. Please try again.');
  }
}

async function resetCoverPage() {
  if (!currentBookForOptions) return;

  try {
    const response = await fetch(`/api/books/${currentBookForOptions.id}/cover`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });

    if (response.status === 401 || response.status === 403) {
      logout();
      return;
    }

    const result = await response.json();

    if (response.ok) {
      alert('Cover page reset to page 1!');
      document.getElementById('cover-page-input').value = 1;
      await loadLibrary(); // Refresh to show default cover
    } else {
      alert(result.error || 'Failed to reset cover page');
    }
  } catch (error) {
    console.error('Error resetting cover page:', error);
    alert('Failed to reset cover page. Please try again.');
  }
}

async function changeCategory() {
  if (!currentBookForOptions) return;

  const categorySelect = document.getElementById('book-category-select');
  const newCategory = categorySelect.value;

  if (newCategory === currentBookForOptions.category) {
    alert('Book is already in this category');
    return;
  }

  try {
    const response = await fetch(`/api/books/${currentBookForOptions.id}/category`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ category: newCategory })
    });

    if (response.status === 401 || response.status === 403) {
      logout();
      return;
    }

    const result = await response.json();

    if (response.ok) {
      alert(`Book moved to ${newCategory} successfully!`);
      document.getElementById('book-options-modal').style.display = 'none';
      await loadLibrary();
    } else {
      alert(result.error || 'Failed to change category');
    }
  } catch (error) {
    console.error('Error changing category:', error);
    alert('Failed to change category. Please try again.');
  }
}

async function deleteBook() {
  if (!currentBookForOptions) return;

  // Prevent deletion of shared books
  if (currentBookForOptions.isShared) {
    alert('Cannot delete shared books. Only your personal books can be deleted.');
    return;
  }

  const bookName = currentBookForOptions.name;
  const confirmed = confirm(`Are you sure you want to permanently delete "${bookName}"?\n\nThis action cannot be undone.`);

  if (!confirmed) return;

  try {
    const response = await fetch(`/api/books/${currentBookForOptions.id}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });

    if (response.status === 401 || response.status === 403) {
      logout();
      return;
    }

    const result = await response.json();

    if (response.ok) {
      alert('Book deleted successfully!');
      document.getElementById('book-options-modal').style.display = 'none';
      currentBookForOptions = null;
      await loadLibrary();
    } else {
      alert(result.error || 'Failed to delete book');
    }
  } catch (error) {
    console.error('Error deleting book:', error);
    alert('Failed to delete book. Please try again.');
  }
}

function setupBookOptionsModal() {
  const modal = document.getElementById('book-options-modal');
  const closeBtn = document.getElementById('close-book-options');
  const renameBtn = document.getElementById('rename-book-btn');
  const changeCategoryBtn = document.getElementById('change-category-btn');
  const setCoverBtn = document.getElementById('set-cover-btn');
  const resetCoverBtn = document.getElementById('reset-cover-btn');
  const deleteBtn = document.getElementById('delete-book-btn');

  closeBtn.addEventListener('click', () => {
    modal.style.display = 'none';
    currentBookForOptions = null;
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.style.display = 'none';
      currentBookForOptions = null;
    }
  });

  renameBtn.addEventListener('click', renameBook);
  changeCategoryBtn.addEventListener('click', changeCategory);
  setCoverBtn.addEventListener('click', setCoverPage);
  resetCoverBtn.addEventListener('click', resetCoverPage);
  deleteBtn.addEventListener('click', deleteBook);
}

function setupBrowseModal() {
  const browseBtn = document.getElementById('browse-btn');
  const browseModal = document.getElementById('browse-modal');
  const closeBrowse = document.getElementById('close-browse');

  browseBtn.addEventListener('click', () => {
    browseModal.style.display = 'flex';
    loadUsers();
  });

  closeBrowse.addEventListener('click', () => {
    browseModal.style.display = 'none';
  });

  browseModal.addEventListener('click', (e) => {
    if (e.target === browseModal) {
      browseModal.style.display = 'none';
    }
  });
}

// Fullscreen toggle function
function toggleFullscreen() {
  const readerView = document.getElementById('reader-view');

  if (!document.fullscreenElement && !document.webkitFullscreenElement && !document.mozFullScreenElement) {
    // Enter fullscreen
    if (readerView.requestFullscreen) {
      readerView.requestFullscreen();
    } else if (readerView.webkitRequestFullscreen) {
      readerView.webkitRequestFullscreen();
    } else if (readerView.mozRequestFullScreen) {
      readerView.mozRequestFullScreen();
    } else if (readerView.msRequestFullscreen) {
      readerView.msRequestFullscreen();
    }
  } else {
    // Exit fullscreen
    if (document.exitFullscreen) {
      document.exitFullscreen();
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    } else if (document.mozCancelFullScreen) {
      document.mozCancelFullScreen();
    } else if (document.msExitFullscreen) {
      document.msExitFullscreen();
    }
  }
}

// Category tabs functionality
function setupCategoryTabs() {
  const tabs = document.querySelectorAll('.category-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      // Update active tab
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      // Update current category and reload library
      currentCategory = tab.dataset.category;
      loadLibrary();
    });
  });
}

// Start the app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
