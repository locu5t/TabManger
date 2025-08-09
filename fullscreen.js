document.addEventListener('DOMContentLoaded', () => {
  // --- DOM Elements ---
  const fullSearchInput = document.getElementById('fullSearchInput');
  const fullFilterSelect = document.getElementById('fullFilterSelect');
  const urlGrid = document.getElementById('urlGrid');
  const bulkDeleteBtn = document.getElementById('bulkDeleteBtn');

  // --- State ---
  let savedGroupsData = {};
  let favoriteUrls = new Set(); // Changed from favoriteDomains to favoriteUrls
      let domainSelectors = {};
  let selectedUrls = new Set(); // To keep track of selected URLs for bulk delete

  // --- SVG Icon Generation ---
  // Placeholder SVG for when no favicon is available
  const placeholderIconSvg = SvgIcons ? SvgIcons.placeholder({ width: 56, height: 56, fill: '#aaa' }) : '<svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z"></path><path d="M12 6v6l4 2"></path></svg>';
  const deleteIconSvg = SvgIcons ? SvgIcons.close({ width: 18, height: 18 }) : '✖';

  // Star SVG - will be dynamically colored based on favorite status
  // Ensure this always returns an SVG string.
  const starIconSvg = SvgIcons
      ? SvgIcons.star // Assuming SvgIcons.star returns an SVG string
      : (isFav) => {
          // Default SVG star if SvgIcons is not available.
          // The color will be controlled by CSS based on the 'isFavorite' class.
          return `
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.03 12 17.77 5.82 21.03 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
              </svg>
          `;
      };

  // --- Utility Functions ---

  function getDomainFromUrl(url) {
      try {
          if (!url || (!url.startsWith('http:') && !url.startsWith('https:'))) return null;
          return new URL(url).hostname;
      } catch (e) { return null; }
  }

  // Function to extract YouTube video ID
  function getYouTubeVideoId(url) {
      if (!url) return null;
      const match = url.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{11})(?:\S+)?/);
      return match && match[1] ? match[1] : null;
  }

  // Function to fetch and extract a primary image URL from a given URL
  async function fetchAndExtractImageUrl(url) {
      const videoId = getYouTubeVideoId(url);
      if (videoId) {
          // Standard YouTube thumbnail URL (maxresdefault is best quality)
          return `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
      }

      try {
          // Use a service to fetch HTML content safely, as direct fetch might be blocked by CORS
          // NOTE: This assumes a CORS proxy service is available or can be set up.
          // For a real extension, you might use `fetch` with `no-cors` mode and parse response,
          // or a dedicated library if available in the extension context.
          // For this example, we'll simulate fetching and parsing.
          // In a real extension, you'd likely need a content script or a background fetch.

          // Simulate fetching HTML content
          // In a real scenario, this would be an actual network request.
          // For demonstration, we'll use a placeholder or a simple mock.
          // A more robust solution would involve a background script fetch.

          // Placeholder for actual fetch logic:
          // const response = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`);
          // const html = await response.text();

          // Mock HTML content for demonstration purposes
          const mockHtml = `
              <html>
              <head>
                  <meta property="og:image" content="https://via.placeholder.com/600x400/FF0000/FFFFFF?text=OG+Image">
                  <meta name="twitter:image" content="https://via.placeholder.com/400x300/00FF00/000000?text=Twitter+Image">
                  <link rel="icon" href="https://via.placeholder.com/32x32/0000FF/FFFFFF?text=Favicon">
              </head>
              <body>
                  <img src="https://via.placeholder.com/800x500/FFFF00/333333?text=Hero+Image" alt="Hero Image">
                  <p>Some content here.</p>
              </body>
              </html>
          `;
          const html = mockHtml; // Use mock HTML for now

          // Try to find Open Graph image first
          const ogImageMatch = html.match(/<meta property="og:image"\s*content="([^"]+)"/i);
          if (ogImageMatch && ogImageMatch[1]) {
              return ogImageMatch[1];
          }

          // Try to find Twitter image
          const twitterImageMatch = html.match(/<meta name="twitter:image"\s*content="([^"]+)"/i);
          if (twitterImageMatch && twitterImageMatch[1]) {
              return twitterImageMatch[1];
          }

          // Try to find a prominent image tag (e.g., first large img tag)
          // This is heuristic and might not always pick the "best" image.
          const imgMatches = html.matchAll(/<img[^>]+src="([^"]+)"/gi);
          let largestImgSrc = null;
          let largestImgSize = 0;

          for (const match of imgMatches) {
              const src = match[1];
              if (!src) continue;

              // Basic check for image dimensions (can be improved by parsing attributes or fetching headers)
              // For simplicity, we'll just use the presence of a URL as a proxy.
              // A more advanced approach would involve fetching image dimensions.
              if (src.length > largestImgSize) {
                  largestImgSize = src.length;
                  largestImgSrc = src;
              }
          }
          if (largestImgSrc) {
              // Resolve relative URLs
              try {
                  return new URL(largestImgSrc, url).href;
              } catch (e) {
                  return largestImgSrc; // Return as is if resolution fails
              }
          }

          // Fallback to favicon if no other image is found
          const faviconMatch = html.match(/<link[^>]+rel="icon"[^>]+href="([^"]+)"/i) ||
                               html.match(/<link[^>]+rel="shortcut icon"[^>]+href="([^"]+)"/i);
          if (faviconMatch && faviconMatch[1]) {
              try {
                  return new URL(faviconMatch[1], url).href;
              } catch (e) {
                  return faviconMatch[1];
              }
          }

      } catch (error) {
          console.error(`Error fetching or parsing image for ${url}:`, error);
          return null; // Return null if any error occurs
      }
      return null; // Return null if no image found
  }


  // Function to get a thumbnail URL (YouTube, fetched image, or fallback favicon)
  

async function getThumbnailUrl(url, faviconUrl, manualThumb, selector) {
    // 1. explicit per‑tab thumbnail set by user
    if (manualThumb) return manualThumb;

    

// 2. domain‑level CSS selector (with smart fallbacks)
const supportedRegex = /\.(webp|jpe?g|png|gif)(\?|#|$)/i;

function generateSelectorVariants(sel) {
    const variants = [sel.trim()];
    // Remove :nth-child(...) pseudo‑classes
    const noNth = sel.replace(/:nth-child\(\d+\)/g, '').trim();
    if (noNth !== sel) variants.push(noNth);
    // Remove obvious "active"/stateful classes
    const noActive = noNth.replace(/\.\w*(active|current)\w*/gi, '').trim();
    if (noActive !== noNth) variants.push(noActive);
    // Progressively shorten the chain from the right
    let parts = sel.split('>').map(s => s.trim());
    while (parts.length > 1) {
        parts.pop();
        variants.push(parts.join(' > '));
    }
    // Deduplicate
    return [...new Set(variants.map(v => v.replace(/\s*>\s*/g, ' > ').trim()).filter(Boolean))];
}

if (selector) {
    try {
        const res = await fetch(url);
        const html = await res.text();
        const doc  = new DOMParser().parseFromString(html, 'text/html');
        for (const variant of generateSelectorVariants(selector)) {
            const el = doc.querySelector(variant);
            if (el && el.src && supportedRegex.test(el.src)) {
                return new URL(el.src, url).href;
            }
        }
    } catch (err) {
        console.warn('Thumbnail selector fetch failed:', err);
    }
}

// 3. Existing logic – OG image or YouTube thumbnail
// Existing logic – OG image or YouTube thumbnail
    const fetchedImageUrl = await fetchAndExtractImageUrl(url);
    if (fetchedImageUrl) return fetchedImageUrl;

    // 4. Fallback – favicon if available
    return faviconUrl || null;
  }

  function loadData(callback) {
      // Load both saved groups and favorite URLs
      chrome.storage.local.get(['savedGroups','domainThumbnails','domainThumbnailSelectors', 'favoriteUrls'], (data) => {
          savedGroupsData = data.savedGroups || {};
          domainSelectors = data.domainThumbnailSelectors || {};
          favoriteUrls = new Set(data.favoriteUrls || []); // Initialize as a Set
          if (callback) callback();
      });
  }

  // Modified renderGrid to use async getThumbnailUrl
  async function renderGrid(groups) {
      urlGrid.innerHTML = ''; // Clear previous content
      let domains = Object.keys(groups);
      let allUrls = [];

      // Flatten all URLs with their group domain, notes, and favorite status
      domains.forEach(domain => {
          const group = groups[domain];
          if (!group || !Array.isArray(group.tabs)) return;

          group.tabs.forEach(tab => {
              allUrls.push({
                  domain: domain,
                  title: tab.title || tab.url,
                  url: tab.url,
                  notes: tab.notes || '',
                  description: tab.description || tab.notes || '',
                  thumb: tab.thumb || null,
                  favicon: group.favicon,
                  isFavorite: favoriteUrls.has(tab.url) // Check if this specific URL is favorited
              });
          });
      });

      // Apply filtering based on search input and filter select
      const searchTerm = fullSearchInput.value.toLowerCase().trim();
      const filterValue = fullFilterSelect.value;

      const filteredUrls = allUrls.filter(item => {
          const matchesSearch = item.title.toLowerCase().includes(searchTerm) ||
                                item.url.toLowerCase().includes(searchTerm) ||
                                item.domain.toLowerCase().includes(searchTerm) ||
                                item.description.toLowerCase().includes(searchTerm);

          // Filter by favorite status
          const matchesFilter = filterValue === 'all' || (filterValue === 'favorites' && item.isFavorite);

          return matchesSearch && matchesFilter;
      });

      if (filteredUrls.length === 0) {
          urlGrid.innerHTML = '<p class="message">No URLs found matching your criteria.</p>';
          bulkDeleteBtn.style.display = 'none'; // Hide bulk delete if no items
          return;
      }

      const fragment = document.createDocumentFragment();
      // Use Promise.all to wait for all thumbnail URLs to be fetched
     const thumbnailPromises = filteredUrls.map(async (item) => {
          const thumbnailUrl = await getThumbnailUrl(item.url, item.favicon, item.thumb, null);
          return { ...item, thumbnailUrl };
      });

      const itemsWithThumbnails = await Promise.all(thumbnailPromises);

      itemsWithThumbnails.forEach((item, index) => {
          const gridItem = document.createElement('div');
          gridItem.className = 'gridItem';
          gridItem.dataset.url = item.url;
          gridItem.dataset.domain = item.domain;

          // Checkbox for bulk selection
          const checkbox = document.createElement('input');
          checkbox.type = 'checkbox';
          checkbox.className = 'bulk-select';
          checkbox.dataset.url = item.url;
          checkbox.checked = selectedUrls.has(item.url);
          checkbox.addEventListener('change', handleCheckboxChange);
          gridItem.appendChild(checkbox);

          // Thumbnail Container
          const thumbnailContainer = document.createElement('div');
          thumbnailContainer.className = 'thumbnail';
          thumbnailContainer.addEventListener('click', () => openUrl(item.url));

          if (item.thumbnailUrl) {
              const img = document.createElement('img');
              img.src = item.thumbnailUrl;
              img.alt = 'Thumbnail';
              img.onerror = () => {
                  img.onerror = null;
                  img.style.display = 'none';
                  thumbnailContainer.innerHTML = '<div class="placeholderIconContainer">' + placeholderIconSvg + '</div>';
              };
              thumbnailContainer.appendChild(img);
          } else {
              thumbnailContainer.innerHTML = '<div class="placeholderIconContainer">' + placeholderIconSvg + '</div>';
          }
          gridItem.appendChild(thumbnailContainer);

          // Content (Title, Domain, Description)
          const contentDiv = document.createElement('div');
          contentDiv.className = 'content';

          const titleLink = document.createElement('a');
          titleLink.className = 'title';
          titleLink.href = item.url;
          titleLink.textContent = item.title;
          titleLink.title = `${item.title}\n${item.url}`;
          titleLink.target = "_blank";
          titleLink.addEventListener('click', (e) => e.stopPropagation());

          const domainSpan = document.createElement('span');
          domainSpan.className = 'domain';
          domainSpan.textContent = item.domain;

          contentDiv.appendChild(titleLink);
          contentDiv.appendChild(domainSpan);

          // --- Description Section ---
          const descSection = document.createElement('div');
          descSection.className = 'notes-section';

          const descInputWrapper = document.createElement('div');
          descInputWrapper.className = 'note-input-wrapper';
          const descInput = document.createElement('textarea');
          descInput.placeholder = 'Add a description...';
          descInput.value = item.description || '';
          const saveDescBtn = document.createElement('button');
          saveDescBtn.className = 'save-note-btn';
          saveDescBtn.textContent = 'Save';
          saveDescBtn.addEventListener('click', () => {
            saveDescription(item.url, descInput.value);
            descInputWrapper.style.display = 'none';
            renderGrid(savedGroupsData);
          });
          descInputWrapper.append(descInput, saveDescBtn);

          const descDisplay = document.createElement('div');
          descDisplay.className = 'note-display';
          if (item.description) {
            const p = document.createElement('p');
            p.className = 'note-text';
            p.textContent = item.description;
            const editBtn = document.createElement('button');
            editBtn.className = 'edit-note-btn';
            editBtn.textContent = 'Edit';
            editBtn.addEventListener('click', () => {
              descInputWrapper.style.display = 'flex';
              descInput.focus();
            });
            descDisplay.append(p, editBtn);
          } else {
            const addBtn = document.createElement('button');
            addBtn.className = 'add-note-btn';
            addBtn.textContent = 'Add Description';
            addBtn.addEventListener('click', () => {
              descInputWrapper.style.display = 'flex';
              descInput.focus();
            });
            descDisplay.append(addBtn);
          }

          descSection.append(descInputWrapper, descDisplay);
          contentDiv.appendChild(descSection);
          gridItem.appendChild(contentDiv);

          const pickWrap = document.createElement('div');
          pickWrap.className = 'pick-controls';

          const pickBtn = document.createElement('button');
          pickBtn.textContent = 'Pick';
          pickBtn.title = 'Pick from page';
          const pickMenu = document.createElement('div');
          pickMenu.className = 'pick-menu';
          pickMenu.style.display = 'none';

          function requestPick(mode, saveAsDefault){
            pickMenu.style.display = 'none';
            chrome.runtime.sendMessage({
              type: 'START_PICK_FOR_URL',
              url: item.url,
              mode,
              saveAsDomainDefault: saveAsDefault
            }, (res) => {
              if (res?.ok) {
                chrome.storage.local.get(['savedGroups'], (data) => {
                  savedGroupsData = data.savedGroups || {};
                  renderGrid(savedGroupsData);
                });
              }
            });
          }

          const pickThumb = document.createElement('button');
          pickThumb.textContent = 'Thumbnail…';
          pickThumb.addEventListener('click', ()=> requestPick('image', false));

          const pickDesc = document.createElement('button');
          pickDesc.textContent = 'Description…';
          pickDesc.addEventListener('click', ()=> requestPick('text', false));

          const pickThumbDefault = document.createElement('button');
          pickThumbDefault.textContent = 'Thumb + Save Domain Default';
          pickThumbDefault.addEventListener('click', ()=> requestPick('image', true));

          const pickDescDefault = document.createElement('button');
          pickDescDefault.textContent = 'Desc + Save Domain Default';
          pickDescDefault.addEventListener('click', ()=> requestPick('text', true));

          pickMenu.append(pickThumb, pickDesc, pickThumbDefault, pickDescDefault);
          pickBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            pickMenu.style.display = pickMenu.style.display === 'none' ? 'block' : 'none';
          });

          pickWrap.append(pickBtn, pickMenu);
          gridItem.appendChild(pickWrap);

          // Action Buttons (Favorite, Delete)
          const actionsDiv = document.createElement('div');
          actionsDiv.className = 'actions';

          const favBtn = document.createElement('button');
          favBtn.className = 'favoriteBtn';
          favBtn.title = 'Toggle favorite';
          // Use the starIconSvg function and pass the favorite status
          favBtn.innerHTML = starIconSvg(item.isFavorite); // This now correctly sets the SVG
          if (item.isFavorite) favBtn.classList.add('isFavorite'); // Add class for styling
          favBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              toggleFavorite(item.url, favBtn); // Pass URL and button element
          });

          const deleteBtn = document.createElement('button');
          deleteBtn.className = 'deleteBtn';
          deleteBtn.title = 'Remove URL';
          deleteBtn.innerHTML = deleteIconSvg;
          deleteBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              // Confirmation dialog for deleting a URL
              if (confirm(`Remove URL "${item.title}" from saved items?`)) {
                  deleteUrl(item.url);
              }
          });

          actionsDiv.appendChild(favBtn);
          actionsDiv.appendChild(deleteBtn);
          gridItem.appendChild(actionsDiv);

          fragment.appendChild(gridItem);
      });

      urlGrid.appendChild(fragment);
      updateBulkDeleteButtonState(); // Update button state after rendering
  }

  function handleCheckboxChange(event) {
      const url = event.target.dataset.url;
      if (event.target.checked) {
          selectedUrls.add(url);
      } else {
          selectedUrls.delete(url);
      }
      updateBulkDeleteButtonState();
  }

  function updateBulkDeleteButtonState() {
      const hasSelection = selectedUrls.size > 0;
      bulkDeleteBtn.disabled = !hasSelection;
      bulkDeleteBtn.style.display = 'block'; // Ensure button is visible if there are items
  }

  function saveDescription(url, description) {
      chrome.storage.local.get(['savedGroups'], (data) => {
          const savedGroups = data.savedGroups || {};
          for (const domain in savedGroups) {
              const group = savedGroups[domain];
              const rec = group.tabs.find(t => t.url === url);
              if (rec) {
                  rec.description = (description || '').slice(0, 1200);
                  chrome.storage.local.set({ savedGroups }, () => {});
                  return;
              }
          }
      });
  }

  function deleteUrl(urlToDelete) {
      let groupDomain = null;
      let tabIndex = -1;
      let groupWasEmpty = false;

      // Find the URL and remove it
      for (const domain in savedGroupsData) {
          tabIndex = savedGroupsData[domain].tabs.findIndex(tab => tab.url === urlToDelete);
          if (tabIndex !== -1) {
              groupDomain = domain;
              if (savedGroupsData[domain].tabs.length === 1) {
                  groupWasEmpty = true; // This group will become empty
              }
              savedGroupsData[domain].tabs.splice(tabIndex, 1);
              break;
          }
      }

      if (groupDomain) {
          if (groupWasEmpty) {
              // If the group is now empty, remove the entire group
              delete savedGroupsData[groupDomain];
              favoriteUrls.delete(urlToDelete); // Remove from favoriteUrls Set
          } else {
              // If group is not empty, still remove from favoriteUrls if it was favorited
              favoriteUrls.delete(urlToDelete);
          }

          // Save updated data
          chrome.storage.local.set({ savedGroups: savedGroupsData, favoriteUrls: Array.from(favoriteUrls) }, () => {
              console.log(`URL removed: ${urlToDelete}`);
              renderGrid(savedGroupsData); // Re-render the grid
          });
      } else {
          console.warn(`URL not found for deletion: ${urlToDelete}`);
      }
  }

  // Toggle favorite status for a specific URL
  function toggleFavorite(url, buttonElement) {
      const isNowFavorite = favoriteUrls.has(url);

      if (isNowFavorite) {
          favoriteUrls.delete(url); // Remove from favorites
      } else {
          favoriteUrls.add(url); // Add to favorites
      }

      // Update the button's content with the SVG
      buttonElement.innerHTML = starIconSvg(!isNowFavorite);
      // Toggle the class for styling
      buttonElement.classList.toggle('isFavorite', !isNowFavorite);

      // Save updated favorites list
      chrome.storage.local.set({ favoriteUrls: Array.from(favoriteUrls) }, () => {
          // Re-render the grid to reflect favorite status changes, especially if filtering by favorites
          renderGrid(savedGroupsData);
      });
  }

  function handleBulkDelete() {
      if (selectedUrls.size === 0) return;

      // Confirmation dialog for bulk delete
      if (confirm(`Delete ${selectedUrls.size} selected URLs? This action cannot be undone.`)) {
          let groupsModified = false;
          let urlsDeletedCount = 0;

          selectedUrls.forEach(urlToDelete => {
              let groupDomain = null;
              let tabIndex = -1;
              let groupWasEmpty = false;

              for (const domain in savedGroupsData) {
                  tabIndex = savedGroupsData[domain].tabs.findIndex(tab => tab.url === urlToDelete);
                  if (tabIndex !== -1) {
                      groupDomain = domain;
                      if (savedGroupsData[domain].tabs.length === 1) {
                          groupWasEmpty = true;
                      }
                      savedGroupsData[domain].tabs.splice(tabIndex, 1);
                      groupsModified = true; // Mark that data has changed
                      urlsDeletedCount++;
                      break;
                  }
              }

              // If the group became empty after deletion, remove the group
              if (groupDomain && groupWasEmpty) {
                  delete savedGroupsData[groupDomain];
                  favoriteUrls.delete(urlToDelete); // Remove from favorites if group is deleted
              } else {
                  // If group is not empty, still remove from favoriteUrls if it was favorited
                  favoriteUrls.delete(urlToDelete);
              }
          });

          if (groupsModified) {
              chrome.storage.local.set({ savedGroups: savedGroupsData, favoriteUrls: Array.from(favoriteUrls) }, () => {
                  console.log(`Bulk deleted ${urlsDeletedCount} URLs.`);
                  selectedUrls.clear(); // Clear selection
                  renderGrid(savedGroupsData); // Re-render
              });
          }
      }
  }

  // --- Event Listeners ---
  fullSearchInput.addEventListener('input', () => renderGrid(savedGroupsData));
  fullFilterSelect.addEventListener('change', () => renderGrid(savedGroupsData));
  bulkDeleteBtn.addEventListener('click', handleBulkDelete);

  // --- Keyboard Shortcut Listener ---
  chrome.commands.onCommand.addListener((command) => {
      if (command === "open-popup") {
          // This is fullscreen, so we can't open the popup directly.
          // We could potentially close this and open the popup, but that might be jarring.
          // For now, we'll just log it.
          console.log("Keyboard shortcut 'open-popup' detected in fullscreen view.");
      } else if (command === "open-fullscreen") {
          // If already in fullscreen, maybe focus or do nothing.
          window.focus();
      }
  });

  // --- Initial Load ---
  loadData(() => {
      renderGrid(savedGroupsData);
      // Ensure bulk delete button is initially hidden if no items are rendered
      if (Object.keys(savedGroupsData).length === 0 || Object.values(savedGroupsData).every(group => group.tabs.length === 0)) {
          bulkDeleteBtn.style.display = 'none';
      }
  });
});