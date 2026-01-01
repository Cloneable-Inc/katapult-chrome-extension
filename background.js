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

// Web accessible resources that need to be available
const WEB_RESOURCES = [
  'inject.js',
  'inject-reconstructor.js',
  'import-interface-content.js',
  'import-interface.css',
  'fallback-data.js'
];

// Track registered content script IDs for cleanup
const registeredScriptIds = new Map(); // domain -> scriptId

/**
 * Register content scripts for a specific domain
 */
async function registerContentScriptsForDomain(domain) {
  try {
    const scriptId = `content-script-${domain.replace(/[^a-zA-Z0-9]/g, '-')}`;

    // Check if already registered
    if (registeredScriptIds.has(domain)) {
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

    registeredScriptIds.set(domain, scriptId);
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
    const scriptId = registeredScriptIds.get(domain);

    if (!scriptId) {
      console.log(`No content scripts registered for ${domain}`);
      return { success: true };
    }

    // Unregister content scripts
    await chrome.scripting.unregisterContentScripts({ ids: [scriptId] });

    registeredScriptIds.delete(domain);
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

  // Handle requests to check if domain is allowed
  if (message.type === 'CHECK_DOMAIN') {
    isDomainAllowed(message.domain).then(isAllowed => {
      sendResponse({ allowed: isAllowed });
    });
    return true;
  }
});

console.log('Background script loaded and ready');
