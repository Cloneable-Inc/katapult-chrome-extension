// Background script for Chrome extension

// Import domain manager utilities
importScripts('domain-manager.js');

let dataToTransfer = null;

// Content script configuration
const CONTENT_SCRIPT_CONFIG = {
  js: ['content.js'],
  css: ['styles.css'],
  runAt: 'document_start',
  allFrames: false
};

// Cloneable bridge script configuration (for custom Cloneable domains)
const BRIDGE_SCRIPT_CONFIG = {
  js: ['cloneable-bridge.js'],
  runAt: 'document_idle',
  allFrames: false
};

// Web accessible resources that need to be available
const WEB_RESOURCES = [
  'inject.js',
  'inject-reconstructor.js',
  'import-interface-content.js',
  'import-interface.css',
  'fallback-data.js',
  'cloneable-bridge.js'
];

/**
 * Generate a consistent script ID for a domain
 */
function getScriptIdForDomain(domain) {
  return `content-script-${domain.replace(/[^a-zA-Z0-9]/g, '-')}`;
}

/**
 * Check if a content script is already registered for a domain
 */
async function isScriptRegistered(domain) {
  try {
    const scriptId = getScriptIdForDomain(domain);
    const registered = await chrome.scripting.getRegisteredContentScripts({ ids: [scriptId] });
    return registered.length > 0;
  } catch (error) {
    return false;
  }
}

/**
 * Register content scripts for a specific domain
 */
async function registerContentScriptsForDomain(domain) {
  try {
    const scriptId = getScriptIdForDomain(domain);

    // Check if already registered using the API (persists across service worker restarts)
    if (await isScriptRegistered(domain)) {
      console.log(`Content scripts already registered for ${domain}`);
      return { success: true };
    }

    // Register content scripts
    await chrome.scripting.registerContentScripts([{
      id: scriptId,
      matches: [`https://${domain}/*`],
      js: CONTENT_SCRIPT_CONFIG.js,
      css: CONTENT_SCRIPT_CONFIG.css,
      runAt: CONTENT_SCRIPT_CONFIG.runAt,
      allFrames: CONTENT_SCRIPT_CONFIG.allFrames
    }]);

    console.log(`Registered content scripts for ${domain} with ID ${scriptId}`);
    return { success: true };

  } catch (error) {
    console.error(`Error registering content scripts for ${domain}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Unregister content scripts for a specific domain
 */
async function unregisterContentScriptsForDomain(domain) {
  try {
    const scriptId = getScriptIdForDomain(domain);

    // Check if actually registered before trying to unregister
    if (!(await isScriptRegistered(domain))) {
      console.log(`No content scripts registered for ${domain}`);
      return { success: true };
    }

    // Unregister content scripts
    await chrome.scripting.unregisterContentScripts({ ids: [scriptId] });
    console.log(`Unregistered content scripts for ${domain}`);

    return { success: true };

  } catch (error) {
    console.error(`Error unregistering content scripts for ${domain}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Initialize and register content scripts for all custom domains
 */
async function initializeCustomDomains() {
  try {
    const customDomains = await getCustomDomains();
    console.log(`Initializing content scripts for ${customDomains.length} custom domains`);

    for (const domain of customDomains) {
      await registerContentScriptsForDomain(domain);
    }

  } catch (error) {
    console.error('Error initializing custom domains:', error);
  }
}

/**
 * Get all URLs to monitor for webRequest
 */
async function getWebRequestUrls() {
  const allDomains = await getAllowedDomains();
  const urls = [];

  for (const domain of allDomains) {
    if (domain.startsWith('*.')) {
      // Wildcard subdomain
      const baseDomain = domain.substring(2);
      urls.push(`https://*.${baseDomain}/*`);
    } else {
      urls.push(`https://${domain}/*`);
    }
  }

  return urls;
}

// Initialize on install or update
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('Extension installed/updated:', details.reason);
  await initializeCustomDomains();
});

// Initialize on startup (browser restart)
chrome.runtime.onStartup.addListener(async () => {
  console.log('Browser started, reinitializing custom domains');
  await initializeCustomDomains();
});

// Also initialize immediately when service worker loads
initializeCustomDomains();

/**
 * Convert a host-permission origin pattern (e.g. "https://maps.example.com/*")
 * into a bare domain ("maps.example.com"). Returns null for patterns we don't
 * want to auto-register (broad wildcards, non-https, unparseable).
 */
function originPatternToDomain(origin) {
  const match = /^https:\/\/([^/*]+)\/\*?$/.exec(origin);
  if (!match) return null;
  return match[1];
}

// Finalize custom-domain adds in the background. Calling
// chrome.permissions.request() from the action popup tears down the popup's JS
// context, so the storage write + content-script registration that used to live
// after the await in popup.js never ran. Doing it here makes it reliable even
// when the popup closes the instant the permission prompt appears.
chrome.permissions.onAdded.addListener(async (permissions) => {
  const origins = (permissions && permissions.origins) || [];
  for (const origin of origins) {
    const domain = originPatternToDomain(origin);
    if (!domain) continue;
    const result = await addDomain(domain);
    await registerContentScriptsForDomain(domain);
    console.log(`permissions.onAdded → finalized custom domain ${domain}`, result);
  }
});

// Mirror removals: when a host permission is revoked, drop the domain from
// storage and unregister its content scripts. Idempotent with the popup's own
// remove flow.
chrome.permissions.onRemoved.addListener(async (permissions) => {
  const origins = (permissions && permissions.origins) || [];
  for (const origin of origins) {
    const domain = originPatternToDomain(origin);
    if (!domain) continue;
    await removeDomain(domain);
    await unregisterContentScriptsForDomain(domain);
    console.log(`permissions.onRemoved → removed custom domain ${domain}`);
  }
});

// Listen for web requests to catch model data
// Note: webRequest filters are static, but we'll still log all activity
chrome.webRequest.onCompleted.addListener(
  function(details) {
    // Look for API endpoints that might contain model data
    if (details.method === 'GET' &&
        (details.url.includes('/api/') ||
         details.url.includes('/model') ||
         details.url.includes('.json'))) {

      // Store the URL pattern for later reference
      if (chrome.storage) {
        chrome.storage.local.set({
          lastModelUrl: details.url,
          timestamp: Date.now()
        });
      }
    }
  },
  { urls: ["<all_urls>"] } // Monitor all URLs, content scripts will be domain-specific
);

// Listen for messages from content script and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Handle domain registration
  if (message.type === 'REGISTER_DOMAIN') {
    registerContentScriptsForDomain(message.domain).then(result => {
      sendResponse(result);
    });
    return true; // Keep channel open for async response
  }

  // Handle domain unregistration
  if (message.type === 'UNREGISTER_DOMAIN') {
    unregisterContentScriptsForDomain(message.domain).then(result => {
      sendResponse(result);
    });
    return true; // Keep channel open for async response
  }

  // Legacy support for existing functionality
  if (message.action === 'getModelUrls') {
    chrome.storage.local.get(['lastModelUrl'], (result) => {
      sendResponse(result);
    });
    return true;
  }

  // Handle bridge script registration for custom Cloneable domains
  if (message.type === 'REGISTER_BRIDGE') {
    const domain = message.domain;
    const scriptId = `bridge-script-${domain.replace(/[^a-zA-Z0-9]/g, '-')}`;
    (async () => {
      try {
        const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [scriptId] });
        if (existing.length > 0) {
          sendResponse({ success: true });
          return;
        }
        await chrome.scripting.registerContentScripts([{
          id: scriptId,
          matches: [`https://${domain}/*`],
          js: BRIDGE_SCRIPT_CONFIG.js,
          runAt: BRIDGE_SCRIPT_CONFIG.runAt,
          allFrames: BRIDGE_SCRIPT_CONFIG.allFrames
        }]);
        sendResponse({ success: true });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  // Handle requests to check if domain is allowed
  if (message.type === 'CHECK_DOMAIN') {
    isDomainAllowed(message.domain).then(isAllowed => {
      sendResponse({ allowed: isAllowed });
    });
    return true;
  }
});

console.log('Background script loaded and ready');
