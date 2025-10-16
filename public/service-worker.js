const CACHE_NAME = 'bookreader-v3';
const BOOK_CACHE_NAME = 'bookreader-books-v3';
const IMAGE_CACHE_NAME = 'bookreader-images-v3';
const urlsToCache = [
  '/',
  '/index.html',
  '/auth.html',
  '/styles.css',
  '/auth.css',
  '/app.js',
  '/auth.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
  'https://cdn.jsdelivr.net/npm/epubjs@0.3.93/dist/epub.min.js'
];

// Install event - cache resources
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache.map(url => new Request(url, { cache: 'no-cache' })))
          .catch(err => {
            console.log('Cache addAll error:', err);
            // Continue even if some resources fail to cache
          });
      })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME && cacheName !== BOOK_CACHE_NAME && cacheName !== IMAGE_CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Only handle GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // Handle book files (PDF, EPUB) with aggressive caching
  if (url.pathname.includes('/api/books/') && url.pathname.includes('/file')) {
    event.respondWith(
      caches.open(BOOK_CACHE_NAME).then(cache => {
        return cache.match(event.request).then(cachedResponse => {
          if (cachedResponse) {
            console.log('Serving book from cache:', url.pathname);
            return cachedResponse;
          }

          console.log('Fetching and caching book:', url.pathname);
          return fetch(event.request).then(response => {
            // Only cache successful responses
            if (response && response.status === 200) {
              cache.put(event.request, response.clone());
            }
            return response;
          });
        });
      })
    );
    return;
  }

  // Handle manga images with aggressive caching
  if (url.pathname.includes('/api/images/')) {
    event.respondWith(
      caches.open(IMAGE_CACHE_NAME).then(cache => {
        return cache.match(event.request).then(cachedResponse => {
          if (cachedResponse) {
            console.log('Serving image from cache:', url.pathname);
            return cachedResponse;
          }

          console.log('Fetching and caching image:', url.pathname);
          return fetch(event.request).then(response => {
            if (response && response.status === 200) {
              // Cache successful responses with a long expiry
              cache.put(event.request, response.clone());
            }
            return response;
          }).catch(error => {
            console.log('Failed to fetch image:', url.pathname, error);
            // Return a placeholder or cached version if network fails
            return cache.match(event.request);
          });
        });
      })
    );
    return;
  }

  // Handle book covers with caching
  if (url.pathname.includes('/api/books/') && url.pathname.includes('/cover')) {
    event.respondWith(
      caches.open(BOOK_CACHE_NAME).then(cache => {
        return cache.match(event.request).then(cachedResponse => {
          if (cachedResponse) {
            return cachedResponse;
          }

          return fetch(event.request).then(response => {
            if (response && response.status === 200) {
              cache.put(event.request, response.clone());
            }
            return response;
          });
        });
      })
    );
    return;
  }

  // Skip other API requests
  if (url.pathname.includes('/api/')) {
    return;
  }

  // Handle static assets
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Cache hit - return response
        if (response) {
          return response;
        }

        return fetch(event.request).then(response => {
          // Check if valid response
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          // Clone the response
          const responseToCache = response.clone();

          caches.open(CACHE_NAME)
            .then(cache => {
              cache.put(event.request, responseToCache);
            });

          return response;
        });
      })
      .catch(() => {
        // If both cache and network fail, return offline page
        if (event.request.destination === 'document') {
          return caches.match('/index.html');
        }
      })
  );
});
