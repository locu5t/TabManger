// --- background.js ---

// --- Helper Functions ---
function getDomainFromUrl(url) {
  try {
    // Handle edge cases like chrome://, file:// etc. gracefully
    if (!url || (!url.startsWith('http:') && !url.startsWith('https:'))) {
        return null; // Cannot extract domain from non-http(s) URLs
    }
    return new URL(url).hostname;
  } catch (e) {
    console.error("Could not parse URL:", url, e);
    return null; // Or a placeholder like 'invalid_url'
  }
}

// Function to add a single tab to saved groups
function addTabToSavedGroups(tabInfo, callback) {
  if (!tabInfo || !tabInfo.url || !tabInfo.id) {
     console.warn("Invalid tab info provided to addTabToSavedGroups:", tabInfo);
     if(callback) callback(false, "Invalid tab data");
     return;
  }

  const domain = getDomainFromUrl(tabInfo.url);
  if (!domain) {
      console.log("Ignoring tab with invalid or non-HTTP(S) URL:", tabInfo.url);
      if(callback) callback(false, "Invalid URL or domain");
      return; // Don't save if domain extraction failed or not http(s)
  }

  // Fetch the latest data right before modifying
  chrome.storage.local.get(['savedGroups', 'favorites', 'domainThumbnails'], (data) => {
    const savedGroups = data.savedGroups || {};
    const favorites = data.favorites || []; // Needed if removing empty group from favorites
    const domainThumbs = data.domainThumbnails || {};
    const newTab = {
      // We store the ID, but it's mainly for reference as tabs might close.
      // The URL is the primary identifier for uniqueness within a group.
      id: tabInfo.id,
      title: tabInfo.title || tabInfo.url, // Use URL as fallback title
      url: tabInfo.url,
          thumbnail: domainThumbs[domain] || null,
      selectorThumb: null,
      autoThumb: null,
      };

    if (!savedGroups[domain]) {
      // Create new group for this domain
      savedGroups[domain] = {
        favicon: tabInfo.favIconUrl || null, // Store real favicon if available, null otherwise
        tabs: [newTab],
      };
    } else {
      // Add to existing group, checking for duplicates by URL
      const exists = savedGroups[domain].tabs.some(t => t.url === newTab.url);
      if (!exists) {
        savedGroups[domain].tabs.push(newTab);
        // Update favicon only if the new one is valid and different
        if (tabInfo.favIconUrl && tabInfo.favIconUrl !== savedGroups[domain].favicon) {
            savedGroups[domain].favicon = tabInfo.favIconUrl;
        } else if (!savedGroups[domain].favicon && tabInfo.favIconUrl) {
             // If existing favicon was null/placeholder, use the new one
             savedGroups[domain].favicon = tabInfo.favIconUrl;
        }
      } else {
         console.log("URL already saved, not adding duplicate:", newTab.url);
         if(callback) callback(false, "URL already saved"); // Indicate no save occurred (duplicate)
         return;
      }
    }

    chrome.storage.local.set({ savedGroups: savedGroups }, () => {
      console.log("Tab saved:", newTab.url);
      if (callback) callback(true, "Tab saved successfully"); // Indicate save was successful
    });
  });
}


// --- Event Listeners ---

// Create Context Menu on install/update
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "saveTabToOrganizer",
    title: "Save Tab to Organizer",
    contexts: ["page"] // Show only when right-clicking on a page
  });
  console.log("Tab Organizer: Context menu created/updated.");
});

// Listener for context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "saveTabToOrganizer") {
    // Ensure we have the full tab object, especially URL
    if (!tab || !tab.url) {
        // If the tab object is incomplete, try querying it by ID
        if (info.pageUrl) { // Use pageUrl as a fallback if tab.url is missing
             console.log("Context menu clicked, tab info incomplete, using pageUrl:", info.pageUrl);
             // Create a temporary tab-like object
             const tempTabInfo = { id: tab ? tab.id : null, url: info.pageUrl, title: tab ? tab.title : info.pageUrl, favIconUrl: tab? tab.favIconUrl : null };
             addTabToSavedGroups(tempTabInfo, handleSaveCallback(tab ? tab.id : null));
        } else {
            console.warn("Context menu clicked, but couldn't get URL.");
            handleSaveCallback(tab ? tab.id : null)(false, "Missing URL");
        }
    } else {
        console.log("Context menu clicked for tab:", tab);
        addTabToSavedGroups(tab, handleSaveCallback(tab.id));
    }
  }
});

// Helper function to handle the callback and badge setting
function handleSaveCallback(tabId) {
    return (saved, message) => {
        if (!tabId) return; // Can't set badge without tabId

        if (saved) {
           chrome.action.setBadgeText({ text: 'OK', tabId: tabId });
           chrome.action.setBadgeBackgroundColor({ color: '#4CAF50', tabId: tabId }); // Green
           setTimeout(() => {
               chrome.action.setBadgeText({ text: '', tabId: tabId });
           }, 1500); // Clear badge
           console.log("Successfully saved tab via context menu:", message);
        } else {
           chrome.action.setBadgeText({ text: '!', tabId: tabId });
           chrome.action.setBadgeBackgroundColor({ color: '#F44336', tabId: tabId }); // Red
            setTimeout(() => {
               chrome.action.setBadgeText({ text: '', tabId: tabId });
           }, 2500); // Clear badge
           console.warn("Failed to save tab via context menu:", message);
        }
    };
}


// Optional: Listen for tab updates to potentially update favicons in storage
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    // Only update if favicon changes, tab is loaded, has a valid URL and domain
    if (changeInfo.favIconUrl && tab.status === 'complete') {
        const domain = getDomainFromUrl(tab.url);
        if (!domain) return;

        chrome.storage.local.get('savedGroups', (data) => {
            const savedGroups = data.savedGroups || {};
            // Update favicon if the domain exists in saved groups and the new favicon is different
            // Also update if the saved favicon was null/placeholder
            if (savedGroups[domain] && (savedGroups[domain].favicon !== changeInfo.favIconUrl || !savedGroups[domain].favicon)) {
                 // Ensure the group isn't empty before updating (might have been cleared)
                 if(savedGroups[domain].tabs && savedGroups[domain].tabs.length > 0){
                     console.log(`Updating favicon for domain ${domain} to ${changeInfo.favIconUrl}`);
                     savedGroups[domain].favicon = changeInfo.favIconUrl;
                     // Use set directly, avoid potential race conditions with get/modify/set if multiple updates happen quickly
                     chrome.storage.local.set({ savedGroups: savedGroups });
                 }
            }
        });
    }
});

console.log("Tab Organizer: Background script loaded.");
