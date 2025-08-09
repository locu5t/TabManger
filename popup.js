document.addEventListener('DOMContentLoaded', () => {
  // --- DOM Elements ---
  const gridSelect = document.getElementById('gridSelect');
  const sortSelect = document.getElementById('sortSelect');
  const searchInput = document.getElementById('search');
  const groupsContainer = document.getElementById('groupsContainer');
  const addCurrentBtn = document.getElementById('addCurrentBtn');
  const moveAllBtn = document.getElementById('moveAllBtn');
  const clearAndLoadBtn = document.getElementById('clearAndLoadBtn');
  const fullViewBtn = document.getElementById('fullViewBtn');

  // --- State ---
  let currentSort = 'most'; // Default
  let currentGrid = '1x1'; // Default
  let favoriteDomains = [];
  let savedGroupsData = {};
  let domainThumbs
  let domainSelectors = {}; // Local cache of saved groups

  // --- SVG Icon Generation ---
  const placeholderIconSvg = SvgIcons ? SvgIcons.placeholder({ width: 16, height: 16, fill: '#6c757d' }) : '<img src="icons/icon16.png" width="16" height="16" alt=""/>'; // Fallback
  const closeIconSvg = SvgIcons ? SvgIcons.close({ width: 14, height: 14 }) : '✖';
  const deleteUrlIconSvg = SvgIcons ? SvgIcons.close({ width: 12, height: 12 }) : 'X'; // Smaller 'X'
  const starIconSvg = SvgIcons ? SvgIcons.star : (isFav) => isFav ? '★' : '☆'; // Function to get star SVG or char

  // --- Utility Functions ---

  // Helper to get domain - ensures it uses the same logic as background
  function getDomainFromUrl(url) {
      try {
          if (!url || (!url.startsWith('http:') && !url.startsWith('https:'))) return null;
          return new URL(url).hostname;
      } catch (e) { return null; }
  }

  function loadPreferences(callback) {
      chrome.storage.local.get(['defaultGrid', 'defaultSort', 'favorites'], (prefs) => {
          currentGrid = prefs.defaultGrid || '1x1';
          currentSort = prefs.defaultSort || 'most';
          favoriteDomains = prefs.favorites || [];

          // Apply loaded preferences to controls
          gridSelect.value = currentGrid;
          sortSelect.value = currentSort;

          // Apply grid style immediately
          applyGridStyle(currentGrid);

          if (callback) callback();
      });
  }

  function applyGridStyle(gridValue) {
      groupsContainer.classList.remove('grid-1x1', 'grid-2x2', 'grid-3x3', 'grid-4x4');
      groupsContainer.classList.add(`grid-${gridValue}`);
      const body = document.body;
      let width = 380; // Base width
      switch (gridValue) {
          case '1x1': width = 380; break;
          case '2x2': width = 740; break;
          case '3x3': width = 1100; break;
          case '4x4': width = 1460; break;
      }
      // Constrain width by screen size
      const maxWidth = Math.min(width, screen.availWidth - 60); // Leave some margin
      body.style.width = `${maxWidth}px`;
  }

  // Groups tabs from the provided list, handling duplicates within the list and adding notes
  function groupTabsByDomain(tabs) {
      const groups = {};
      tabs.forEach(tab => {
          // Basic filtering of invalid tab objects or URLs
          if (!tab || !tab.url || (!tab.url.startsWith('http:') && !tab.url.startsWith('https:'))) {
              console.log("Skipping invalid tab/URL:", tab?.url);
              return;
          }
          const domain = getDomainFromUrl(tab.url);
          if (!domain) return; // Skip tabs without valid domains/URLs

          if (!groups[domain]) {
              groups[domain] = {
                  favicon: tab.favIconUrl || null, // Store null if no favicon initially
                  tabs: []
              };
          }
          // Add tab if URL is unique *within this current batch* for the domain
          if (!groups[domain].tabs.some(t => t.url === tab.url)) {
              groups[domain].tabs.push({
                  id: tab.id, // Store ID for potential future use (like closing)
                  title: tab.title || tab.url,
                  url: tab.url,
                  notes: '' ,
                  thumbnail: domainThumbs[domain] || null,
                  thumb: null,
                  description: ''
              });
          }
          // Update favicon if current tab has one and group doesn't, or if it's different
           if (tab.favIconUrl && (!groups[domain].favicon || groups[domain].favicon !== tab.favIconUrl)) {
               groups[domain].favicon = tab.favIconUrl;
           }
      });
      console.log(`Grouped ${tabs.length} tabs into ${Object.keys(groups).length} domains.`);
      return groups;
  }

  // Renders groups based on the provided data object
  function renderGroups(groupsToRender) {
      let domains = Object.keys(groupsToRender);

      // --- Sorting ---
      switch (currentSort) {
          case 'alphabetical':
              domains.sort((a, b) => a.localeCompare(b));
              break;
          case 'favorites':
              domains.sort((a, b) => {
                  let aFav = favoriteDomains.includes(a) ? 0 : 1;
                  let bFav = favoriteDomains.includes(b) ? 0 : 1;
                  if (aFav !== bFav) return aFav - bFav;
                  return groupsToRender[b].tabs.length - groupsToRender[a].tabs.length;
              });
      
              break;
          default: // 'most'
              domains.sort((a, b) => groupsToRender[b].tabs.length - groupsToRender[a].tabs.length);
      }

      groupsContainer.innerHTML = ''; // Clear previous content
      const fragment = document.createDocumentFragment();

      if (domains.length === 0) {
          groupsContainer.innerHTML = '<p class="message">No groups saved or loaded.<br/>Use buttons above or right-click a page.</p>';
          return;
      }

      domains.forEach(domain => {
          const group = groupsToRender[domain];
          // Basic check for valid group structure
          if (!group || !Array.isArray(group.tabs)) {
             console.warn("Skipping rendering invalid group data for domain:", domain);
             return;
          }

          const groupDiv = document.createElement('div');
          groupDiv.className = 'domainGroup';
          groupDiv.dataset.domain = domain;

          // --- Header ---
          const header = document.createElement('div');
          header.className = 'domainHeader';

          const headerContent = document.createElement('div');
          headerContent.className = 'header-content';

          const faviconImg = document.createElement('img');
          faviconImg.className = 'favicon';
          faviconImg.width = 16;
          faviconImg.height = 16;
          faviconImg.alt = '';
          faviconImg.src = group.favicon || `data:image/svg+xml;base64,${btoa(placeholderIconSvg)}`;
          faviconImg.onerror = (e) => {
              e.target.onerror = null;
              e.target.src = `data:image/svg+xml;base64,${btoa(placeholderIconSvg)}`;
          };

          const starBtn = document.createElement('button');
          starBtn.className = 'starBtn';
          starBtn.title = 'Toggle favorite domain';
          const isFav = favoriteDomains.includes(domain);
          starBtn.innerHTML = starIconSvg(isFav); // Use the function
          if (isFav) starBtn.classList.add('isFavorite');
          starBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              toggleFavorite(domain, starBtn);
          });

          const headerText = document.createElement('span');
          headerText.className = 'domain-name';
          headerText.textContent = domain;
          headerText.title = `${domain} (${group.tabs.length} URLs)`;

const previewImg = document.createElement('img');
previewImg.className = 'domain-thumb-preview';
previewImg.src = domainThumbs[domain] || group.favicon || '';
previewImg.alt = '';
headerContent.insertBefore(previewImg, headerContent.firstChild);

const editThumbBtn = document.createElement('button');
editThumbBtn.className = 'editThumbBtn';
editThumbBtn.textContent = '🖼️';
editThumbBtn.title = domainThumbs[domain] ? 'Change domain thumbnail' : 'Set domain thumbnail';
editThumbBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openThumbnailEditor(domain, previewImg);
});


          headerContent.appendChild(faviconImg);
          headerContent.appendChild(starBtn);
          headerContent.appendChild(headerText);

          const actionIcons = document.createElement('div');
          actionIcons.className = 'action-icons';

          const delGroupBtn = document.createElement('button');
          delGroupBtn.innerHTML = closeIconSvg;
          delGroupBtn.className = 'deleteGroupBtn';
          delGroupBtn.title = "Delete this group and its saved URLs";
          delGroupBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              // Confirmation dialog for deleting a group
              if (confirm(`DELETE group "${domain}"?\n\nThis will remove ${group.tabs.length} saved URLs permanently.`)) {
                  deleteGroup(domain);
              }
          });

          actionIcons.appendChild(delGroupBtn);
          header.appendChild(headerContent);
            actionIcons.prepend(editThumbBtn);
          header.appendChild(actionIcons);
          groupDiv.appendChild(header);

          // --- List ---
          const list = document.createElement('ul');
          group.tabs.forEach((tab, index) => {
              const li = document.createElement('li');
              li.dataset.url = tab.url;
              li.dataset.title = (tab.title || '').toLowerCase();
              li.dataset.notes = tab.notes || ''; // Store notes in dataset for easy access

              const link = document.createElement('a');
              link.href = tab.url;
              link.textContent = tab.title || tab.url;
              link.title = `${tab.title}\n${tab.url}`;
              link.target = "_blank";

              const delUrlBtn = document.createElement('button');
              delUrlBtn.innerHTML = deleteUrlIconSvg;
              delUrlBtn.className = 'deleteUrlBtn';
              delUrlBtn.title = "Remove this URL";
              delUrlBtn.addEventListener('click', (e) => {
                  e.stopPropagation();
                  // Confirmation dialog for deleting a URL
                  if (confirm(`Remove URL "${tab.title}" from this group?`)) {
                      deleteUrlFromGroup(domain, tab.url, li);
                  }
              });

              li.appendChild(link);

              // Display notes if they exist
              if (tab.notes) {
                  const noteDisplay = document.createElement('span');
                  noteDisplay.className = 'url-note-display';
                  noteDisplay.textContent = tab.notes;
                  noteDisplay.title = `Note: ${tab.notes}`; // Tooltip for the note
                  li.appendChild(noteDisplay);
              }

              li.appendChild(delUrlBtn);
              list.appendChild(li);
          });

          groupDiv.appendChild(list);
          fragment.appendChild(groupDiv);
      });

      groupsContainer.appendChild(fragment);
      // Apply search filter after rendering
      applySearchFilter();
  }
      window.renderGroups = renderGroups;


  // Loads groups from storage and triggers rendering
   function loadAndRenderGroups() {
      groupsContainer.innerHTML = '<p class="message">Loading saved groups...</p>';
      chrome.storage.local.get(['savedGroups','domainThumbnails','domainThumbnailSelectors'], (data) => {
          savedGroupsData = data.savedGroups || {};
          domainThumbs = data.domainThumbnails || {};
          domainSelectors = data.domainThumbnailSelectors || {};
// Update local cache
          if (Object.keys(savedGroupsData).length > 0) {
              console.log(`Loaded ${Object.keys(savedGroupsData).length} groups from storage.`);
              window.renderGroups(savedGroupsData);
          } else {
               groupsContainer.innerHTML = '<p class="message">No groups saved yet.<br/>Use buttons above or right-click a page.</p>';
          }
      });
  }

  // --- Action Functions ---

  function toggleFavorite(domain, buttonElement) {
      const index = favoriteDomains.indexOf(domain);
      const isNowFavorite = index === -1;
      if (isNowFavorite) {
          favoriteDomains.push(domain);
      } else {
          favoriteDomains.splice(index, 1);
      }

      // Update button UI immediately
      buttonElement.innerHTML = starIconSvg(isNowFavorite); // Use the function
      buttonElement.classList.toggle('isFavorite', isNowFavorite);

      // Save updated favorites list
      chrome.storage.local.set({ favorites: favoriteDomains }, () => {
          // If sorting by favorites, re-render immediately using the current cached data
          if (currentSort === 'favorites') {
              window.renderGroups(savedGroupsData);
          }
      });
  }

  function deleteGroup(domainToDelete) {
      console.log("Deleting group:", domainToDelete);
      if (!savedGroupsData[domainToDelete]) return; // Already deleted?

      delete savedGroupsData[domainToDelete]; // Update local cache

      const favIndex = favoriteDomains.indexOf(domainToDelete);
      if (favIndex !== -1) {
          favoriteDomains.splice(favIndex, 1); // Update local favorites cache
      }
      // Save updated groups and favorites
      chrome.storage.local.set({ savedGroups: savedGroupsData, favorites: favoriteDomains }, () => {
          window.renderGroups(savedGroupsData); // Re-render the list from cache
      });
  }

  function deleteUrlFromGroup(domain, urlToDelete, listItemElement) {
      // Operate on the local cache
      if (!savedGroupsData[domain] || !savedGroupsData[domain].tabs) return;

      const initialCount = savedGroupsData[domain].tabs.length;
      savedGroupsData[domain].tabs = savedGroupsData[domain].tabs.filter(tab => tab.url !== urlToDelete);
      const newCount = savedGroupsData[domain].tabs.length;

      if (newCount < initialCount) { // Check if deletion happened
          console.log(`Removed URL: ${urlToDelete} from domain ${domain}`);

          // If the group becomes empty, remove the group itself (calls save)
          if (newCount === 0) {
              console.log(`Group ${domain} became empty, deleting group.`);
              deleteGroup(domain); // This handles saving and re-rendering
          } else {
              // Group not empty, just update storage and UI for the single item
              chrome.storage.local.set({ savedGroups: savedGroupsData }, () => {
                  listItemElement.remove(); // Visually remove list item
                  // Update header count title in the DOM
                  const headerText = listItemElement.closest('.domainGroup')?.querySelector('.domain-name');
                  if(headerText) {
                      headerText.title = `${domain} (${newCount} URLs)`;
                  }
              });
          }
      } else {
           console.warn(`URL not found in cache for deletion: ${urlToDelete} in domain ${domain}`);
      }
  }

  function applySearchFilter() {
      const filter = searchInput.value.toLowerCase().trim();
      let visibleCount = 0;
      let groupsExist = false; // Check if there are any groups to filter at all

      document.querySelectorAll('.domainGroup').forEach(groupDiv => {
          groupsExist = true; // Mark that we found at least one group element
          const domain = groupDiv.dataset.domain.toLowerCase();
          let groupVisible = domain.includes(filter);

          if (!groupVisible && filter) {
              const links = groupDiv.querySelectorAll('ul li');
              links.forEach(li => {
                  const title = li.dataset.title || ''; // Already lowercased
                  const url = li.dataset.url ? li.dataset.url.toLowerCase() : '';
                  const notes = li.dataset.notes ? li.dataset.notes.toLowerCase() : '';
                  if (title.includes(filter) || url.includes(filter) || notes.includes(filter)) {
                      groupVisible = true;
                  }
              });
          }

          groupDiv.style.display = groupVisible ? "" : "none";
          if(groupVisible) visibleCount++;
      });

      // Handle messages based on whether groups existed *before* filtering
       const existingMessage = groupsContainer.querySelector('.message');
       if (existingMessage) existingMessage.remove();

       if (groupsExist && visibleCount === 0 && filter) {
            groupsContainer.insertAdjacentHTML('beforeend', '<p class="message">No groups match your search.</p>');
       } else if (!groupsExist && !filter) {
           // Initial empty state message handled by renderGroups/loadAndRenderGroups
       }
  }


  // --- Event Listeners ---

  gridSelect.addEventListener('change', () => {
      currentGrid = gridSelect.value;
      applyGridStyle(currentGrid);
      chrome.storage.local.set({ defaultGrid: currentGrid });
  });

  sortSelect.addEventListener('change', () => {
      currentSort = sortSelect.value;
      chrome.storage.local.set({ defaultSort: currentSort });
      if (Object.keys(savedGroupsData).length > 0) {
        window.renderGroups(savedGroupsData); // Re-render with new sort using cached data
      }
  });

  searchInput.addEventListener('input', applySearchFilter);

  // Add Tabs from This Window (Non-destructive merge) - CORRECTED LOGIC
  addCurrentBtn.addEventListener('click', () => {
      addCurrentBtn.textContent = 'Adding...';
      addCurrentBtn.disabled = true;
      console.log("Add Current: Querying tabs...");
      // Query tabs from the current window
      chrome.tabs.query({ currentWindow: true }, (tabs) => {
          if (tabs.length === 0) {
             console.log("Add Current: No tabs found in current window.");
             addCurrentBtn.textContent = 'Add Window Tabs';
             addCurrentBtn.disabled = false;
             return;
          }
          console.log(`Add Current: Found ${tabs.length} tabs. Grouping...`);
          const currentTabsGroups = groupTabsByDomain(tabs);

          console.log("Add Current: Fetching latest saved groups from storage...");
          // Fetch the ABSOLUTE LATEST saved groups before merging
          chrome.storage.local.get('savedGroups', (data) => {
              const latestSavedGroups = data.savedGroups || {}; // Use this for the merge base
              let groupsModified = false;

              console.log(`Add Current: Merging ${Object.keys(currentTabsGroups).length} new groups into ${Object.keys(latestSavedGroups).length} saved groups.`);

              // Merge current tabs into the LATEST saved groups data
              for (const domain in currentTabsGroups) {
                  if (!latestSavedGroups[domain]) {
                      // Domain is entirely new, add it
                      latestSavedGroups[domain] = currentTabsGroups[domain];
                      console.log(`  - Added new domain: ${domain} with ${currentTabsGroups[domain].tabs.length} tabs.`);
                      groupsModified = true;
                  } else {
                      // Domain exists, merge tabs carefully
                      const existingGroup = latestSavedGroups[domain];
                      const existingUrls = new Set(existingGroup.tabs.map(t => t.url));
                      let addedCount = 0;

                      currentTabsGroups[domain].tabs.forEach(newTab => {
                          if (!existingUrls.has(newTab.url)) {
                              existingGroup.tabs.push(newTab);
                              existingUrls.add(newTab.url); // Add to set to avoid duplicates from same batch
                              addedCount++;
                              groupsModified = true;
                          }
                      });

                      if (addedCount > 0) {
                         console.log(`  - Merged ${addedCount} new tabs into existing domain: ${domain}. Total now: ${existingGroup.tabs.length}`);
                      }

                      // Update favicon if the current group had a better/different one
                      const currentFavicon = currentTabsGroups[domain].favicon;
                      if (currentFavicon && currentFavicon !== existingGroup.favicon) {
                         existingGroup.favicon = currentFavicon;
                         groupsModified = true;
                         console.log(`  - Updated favicon for domain: ${domain}`);
                      } else if (!existingGroup.favicon && currentFavicon) {
                          existingGroup.favicon = currentFavicon;
                          groupsModified = true;
                         console.log(`  - Set initial favicon for domain: ${domain}`);
                      }
                  }
              } // End of merge loop

              if (groupsModified) {
                  console.log("Add Current: Saving merged groups to storage...");
                  chrome.storage.local.set({ savedGroups: latestSavedGroups }, () => {
                      console.log("Add Current: Save successful. Updating cache and rendering.");
                      savedGroupsData = latestSavedGroups; // IMPORTANT: Update local cache *after* successful save
                      window.renderGroups(savedGroupsData); // Re-render with the truly updated data
                      addCurrentBtn.textContent = 'Add Window Tabs';
                      addCurrentBtn.disabled = false;
                  });
              } else {
                  console.log("Add Current: No new tabs found to add.");
          window.renderGroups(savedGroupsData);
                  addCurrentBtn.textContent = 'Add Window Tabs';
                  addCurrentBtn.disabled = false;
              }
          }); // End storage.get callback
      }); // End tabs.query callback
  });


  // Move All Tabs (Save current & close) - Uses similar corrected merge logic
  moveAllBtn.addEventListener('click', () => {
      moveAllBtn.textContent = 'Moving...';
      moveAllBtn.disabled = true;
      console.log("Move All: Querying tabs...");
      chrome.tabs.query({ currentWindow: true }, (tabs) => {
          if (tabs.length <= 1) {
                console.log("Move All: Only 1 or 0 tabs open, nothing to move.");
                moveAllBtn.textContent = 'Move Window Tabs';
                moveAllBtn.disabled = false;
                // Optionally still add the single tab if needed (simulate Add click)
                if (tabs.length === 1) {
                    console.log("Move All: Triggering Add for single tab.");
                    addCurrentBtn.click();
                }
                return;
            }
          console.log(`Move All: Found ${tabs.length} tabs. Grouping...`);
          const currentTabsGroups = groupTabsByDomain(tabs);

          console.log("Move All: Fetching latest saved groups from storage...");
          chrome.storage.local.get('savedGroups', (data) => {
              const latestSavedGroups = data.savedGroups || {};
              let groupsModified = false; // Track if actual changes occurred for saving

              console.log(`Move All: Merging ${Object.keys(currentTabsGroups).length} new groups into ${Object.keys(latestSavedGroups).length} saved groups.`);
              // Merge current tabs into the latest saved groups data
              for (const domain in currentTabsGroups) {
                  if (!latestSavedGroups[domain]) {
                      latestSavedGroups[domain] = currentTabsGroups[domain];
                      groupsModified = true;
                  } else {
                      const existingGroup = latestSavedGroups[domain];
                      const existingUrls = new Set(existingGroup.tabs.map(t => t.url));
                      let added = false;
                      currentTabsGroups[domain].tabs.forEach(newTab => {
                          if (!existingUrls.has(newTab.url)) {
                              existingGroup.tabs.push(newTab);
                              existingUrls.add(newTab.url);
                              added = true;
                          }
                      });
                      if (added) groupsModified = true; // Mark modified if tabs were added

                      const currentFavicon = currentTabsGroups[domain].favicon;
                       if (currentFavicon && currentFavicon !== existingGroup.favicon) {
                         existingGroup.favicon = currentFavicon;
                         groupsModified = true; // Mark modified if favicon changed
                      } else if (!existingGroup.favicon && currentFavicon){
                          existingGroup.favicon = currentFavicon;
                          groupsModified = true;
                      }
                  }
              } // End merge loop

              console.log("Move All: Saving merged groups to storage...");
              // Save the merged data (even if not modified, ensures consistency before closing tabs)
              chrome.storage.local.set({ savedGroups: latestSavedGroups }, () => {
                  console.log("Move All: Save successful. Updating cache and rendering.");
                  savedGroupsData = latestSavedGroups; // Update local cache
                  window.renderGroups(savedGroupsData); // Update UI immediately

                  // Close tabs (except the first one)
                  const tabIdsToClose = tabs.slice(1).map(t => t.id).filter(id => id != null); // Filter out null IDs just in case
                  if (tabIdsToClose.length > 0) {
                      console.log(`Move All: Closing ${tabIdsToClose.length} tabs...`);
                      chrome.tabs.remove(tabIdsToClose, () => {
                          if (chrome.runtime.lastError) {
                              console.error("Error closing tabs:", chrome.runtime.lastError.message);
                          } else {
                              console.log("Move All: Tabs closed successfully.");
                          }
                          // Ensure the first tab is active after others close
                          chrome.tabs.update(tabs[0].id, { active: true });
                          moveAllBtn.textContent = 'Move Window Tabs';
                          moveAllBtn.disabled = false;
                      });
                  } else {
                     console.log("Move All: No tabs to close (only first tab remained).");
                     moveAllBtn.textContent = 'Move Window Tabs';
                     moveAllBtn.disabled = false;
                  }
              }); // End storage.set callback
          }); // End storage.get callback
      }); // End tabs.query callback
  });

  // Clear Saved & Load Current (Destructive replace)
  clearAndLoadBtn.addEventListener('click', () => {
      // Confirmation dialog for clearing all saved data
      if (confirm("DELETE ALL saved groups?\n\nThis will replace them with your currently open window tabs.")) {
          clearAndLoadBtn.textContent = 'Clearing...';
          clearAndLoadBtn.disabled = true;
          console.log("Clear & Load: Querying current window tabs...");
          chrome.tabs.query({ currentWindow: true }, (tabs) => {
              console.log(`Clear & Load: Found ${tabs.length} tabs. Grouping...`);
              const currentTabsGroups = groupTabsByDomain(tabs);
              console.log("Clear & Load: Replacing stored data...");
              // Replace saved data directly & clear favorites
              chrome.storage.local.set({ savedGroups: currentTabsGroups, favorites: [] }, () => {
                  console.log("Clear & Load: Storage updated. Updating cache and rendering.");
                  savedGroupsData = currentTabsGroups; // Update local cache
                  favoriteDomains = []; // Reset local favorites cache
                  window.renderGroups(savedGroupsData); // Render the new (current) groups
                  clearAndLoadBtn.textContent = 'Clear Saved & Load Window';
                  clearAndLoadBtn.disabled = false;
              });
          });
      }
  });

  // Open Full View
  fullViewBtn.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('fullscreen.html') + '?t=' + Date.now() });
      window.close(); // Close the popup after opening the full view
  });

  // --- Keyboard Shortcut Listener ---
  chrome.commands.onCommand.addListener((command) => {
      if (command === "open-popup") {
          // If the popup is already open, focus it.
          window.focus();
      } else if (command === "open-fullscreen") {
          chrome.tabs.create({ url: chrome.runtime.getURL('fullscreen.html') });
          window.close(); // Close the popup after opening the full view
      }
  });

  // --- Initial Load ---
  console.log("Popup loading...");
  loadPreferences(loadAndRenderGroups); // Load prefs first, then load groups



// --- Thumbnail Manager ---

});


function openThumbnailEditor(domain, previewImg){
    const dlg = document.createElement('dialog');
    dlg.style.padding = '0';
    dlg.innerHTML = `
      <form method="dialog" style="min-width:260px;padding:16px 14px;">
        <h3 style="margin-top:0;font-size:16px;">Thumbnail rule for ${domain}</h3>
        <p style="font-size:12px;margin:0 0 8px;">Choose how to pick a thumbnail for pages on this domain.</p>
        <label style="display:block;font-size:12px;margin-bottom:6px;">
          <input type="radio" name="thumbMode" value="static" checked style="margin-right:4px;"> Static image URL
        </label>
        <input type="url" id="thumbUrl" placeholder="https://…" style="width:100%;margin-bottom:10px;padding:4px 6px;font-size:12px;">
        <label style="display:block;font-size:12px;margin-bottom:6px;">
          <input type="radio" name="thumbMode" value="selector" style="margin-right:4px;"> CSS selector for an IMG element
        </label>
        <input type="text" id="thumbSelector" placeholder="e.g. main img.feature" style="width:100%;margin-bottom:12px;padding:4px 6px;font-size:12px;" disabled>
        <label style="font-size:12px;display:block;margin-bottom:8px;"><input type="checkbox" id="propagate" checked> Apply to existing saved URLs</label>
        <menu style="display:flex;gap:6px;justify-content:flex-end;margin:0;">
          <button value="cancel" style="padding:4px 10px;">Cancel</button>
          <button id="saveBtn" value="default" autofocus style="padding:4px 14px;">Save</button>
        </menu>
      </form>`;
    document.body.appendChild(dlg);
    dlg.showModal();

    // Mode toggling
    const modeInputs = dlg.querySelectorAll('input[name="thumbMode"]');
    const urlInput = dlg.querySelector('#thumbUrl');
    const selInput = dlg.querySelector('#thumbSelector');
    modeInputs.forEach(r => r.addEventListener('change', () => {
        if(r.checked && r.value === 'static'){
            urlInput.disabled = false;
            selInput.disabled = true;
        }else if(r.checked && r.value === 'selector'){
            urlInput.disabled = true;
            selInput.disabled = false;
        }
    }));

    dlg.querySelector('#saveBtn').addEventListener('click', async () => {
        const chosenMode = [...modeInputs].find(r => r.checked).value;
        const urlVal = urlInput.value.trim();
        const selectorVal = selInput.value.trim();

        if(chosenMode === 'static' && !urlVal){
            alert('Please enter an image URL.');
            return;
        }
        if(chosenMode === 'selector' && !selectorVal){
            alert('Please enter a CSS selector.');
            return;
        }

        chrome.storage.local.get(['domainThumbnails','domainThumbnailSelectors','savedGroups'], data=>{
            const dThumbs = data.domainThumbnails || {};
            const dSelectors = data.domainThumbnailSelectors || {};
            const groups = data.savedGroups || {};

            if(chosenMode === 'static'){
                dThumbs[domain] = urlVal;
                delete dSelectors[domain];
            }else{
                dSelectors[domain] = selectorVal;
                delete dThumbs[domain];
            }

            // propagate affects only static thumbnails; selectors will auto-resolve per page
            if(chosenMode === 'static' && dlg.querySelector('#propagate').checked && groups[domain]){
                groups[domain].tabs.forEach(t=>t.thumbnail = urlVal);
            }else if(chosenMode === 'selector' && dlg.querySelector('#propagate').checked && groups[domain]){
                groups[domain].tabs.forEach(t=>t.thumbnail = null); // clear static thumbnails
            }

            chrome.storage.local.set({
                domainThumbnails: dThumbs,
                domainThumbnailSelectors: dSelectors,
                savedGroups: groups
            }, ()=>{
                domainThumbs = dThumbs;
                domainSelectors = dSelectors;
                savedGroupsData = groups;
                previewImg.src = (dThumbs[domain] || '');
                dlg.close(); dlg.remove();
                window.renderGroups(savedGroupsData);
            });
        });
    });
}

