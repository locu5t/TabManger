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

// Additional helpers for picker and domain rules
function getHost(url){
  try { return new URL(url).hostname; } catch { return null; }
}
async function getRules(){
  return new Promise(r=>chrome.storage.local.get(['thumbnailRules'], d=>r(d.thumbnailRules||{})));
}
async function setRules(rules){
  return new Promise(r=>chrome.storage.local.set({ thumbnailRules: rules }, r));
}

async function applyRuleInTab(tabId, rule) {
  if (!rule) return { imageSrc:null, text:null };
  const [{ result } = {}] = await chrome.scripting.executeScript({
    target: { tabId },
    func: (rule) => {
      function q(sel){ try { return document.querySelector(sel); } catch { return null; } }
      const out = { imageSrc:null, text:null };
      if (rule.imageSelector) {
        const el = q(rule.imageSelector);
        const img = el && (el.tagName === 'IMG' ? el : el.querySelector('img'));
        out.imageSrc = img ? (img.currentSrc || img.src || null) : null;
      }
      if (rule.textSelector) {
        const el = q(rule.textSelector);
        if (el) {
          const clone = el.cloneNode(true);
          clone.querySelectorAll('script,style,noscript,svg,canvas,video,audio,iframe,input,select,textarea').forEach(n=>n.remove());
          clone.querySelectorAll('br').forEach(br=>br.replaceWith('\n'));
          out.text = (clone.textContent||'').replace(/\s+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
        }
      }
      return out;
    },
    args: [rule]
  });
  return result || { imageSrc:null, text:null };
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
      thumb: null,
      description: ''
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

    // attempt to auto-fill thumbnail/description based on domain rule
    (async () => {
      const rules = await getRules();
      const rule = rules[domain];
      if (rule && tabInfo.id) {
        try {
          const data = await applyRuleInTab(tabInfo.id, rule);
          if (data.imageSrc) newTab.thumb = data.imageSrc;
          if (data.text) newTab.description = data.text.slice(0, 1200);
          chrome.storage.local.set({ savedGroups });
        } catch(e){ console.warn('Auto rule failed', e); }
      }
    })();

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

// === Picker Orchestration ===
async function ensureTabForUrl(url) {
  const tabs = await chrome.tabs.query({});
  const found = tabs.find(t => t.url === url);
  if (found) return found;
  return await new Promise(resolve => {
    chrome.tabs.create({ url, active: true }, (tab) => {
      const id = tab.id;
      const listener = (tabId, info) => {
        if (tabId === id && info.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve(tab);
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
    });
  });
}
function uid(){ return Math.random().toString(36).slice(2); }

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'START_PICK_FOR_URL') {
    (async () => {
      const { url, mode, saveAsDomainDefault } = msg;
      const requestId = uid();
      const tab = await ensureTabForUrl(url);
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['selector/picker.js']
      });
      chrome.tabs.sendMessage(tab.id, { type: 'PICKER_INIT', mode, requestId });

      const onReply = async (reply) => {
        if (reply?.type === 'PICKER_DONE' && reply.requestId === requestId) {
          chrome.runtime.onMessage.removeListener(onReply);
          const domain = getHost(url);
          chrome.storage.local.get(['savedGroups','thumbnailRules'], (data) => {
            const savedGroups = data.savedGroups || {};
            const rules = data.thumbnailRules || {};
            if (domain && savedGroups[domain]?.tabs) {
              const rec = savedGroups[domain].tabs.find(t => t.url === url);
              if (rec) {
                if (reply.mode === 'image' && reply.imageSrc) rec.thumb = reply.imageSrc;
                if (reply.mode === 'text' && reply.text) rec.description = reply.text.slice(0, 1200);
              }
            }
            if (domain && saveAsDomainDefault) {
              const rule = rules[domain] || {};
              if (reply.mode === 'image') rule.imageSelector = reply.selector;
              if (reply.mode === 'text') rule.textSelector = reply.selector;
              rules[domain] = rule;
            }
            chrome.storage.local.set({ savedGroups, thumbnailRules: rules }, () => {
              sendResponse({ ok: true, data: reply });
            });
          });
        } else if (reply?.type === 'PICKER_CANCEL' && reply.requestId === requestId) {
          chrome.runtime.onMessage.removeListener(onReply);
          sendResponse({ ok:false, cancelled:true });
        }
      };
      chrome.runtime.onMessage.addListener(onReply);
    })();
    return true; // keep sendResponse alive
  }
});

console.log("Tab Organizer: Background script loaded.");
