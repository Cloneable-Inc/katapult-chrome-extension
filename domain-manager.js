// Domain Manager - Handles storage and management of allowed domains

const DEFAULT_DOMAINS = [
  'katapultpro.com',
  '*.katapultpro.com'
];

const STORAGE_KEY = 'customDomains';

/**
 * Get all allowed domains (default + custom)
 * @returns {Promise<string[]>} Array of allowed domain patterns
 */
async function getAllowedDomains() {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEY], (result) => {
      const customDomains = result[STORAGE_KEY] || [];
      const allDomains = [...DEFAULT_DOMAINS, ...customDomains];
      resolve(allDomains);
    });
  });
}

/**
 * Get only custom domains (excludes defaults)
 * @returns {Promise<string[]>} Array of custom domain patterns
 */
async function getCustomDomains() {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEY], (result) => {
      resolve(result[STORAGE_KEY] || []);
    });
  });
}

/**
 * Extract domain from URL
 * @param {string} url - Full URL
 * @returns {string|null} Domain or null if invalid
 */
function extractDomain(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch (e) {
    return null;
  }
}

/**
 * Check if URL matches the model editor pattern
 * @param {string} url - URL to check
 * @returns {boolean} True if it's a model editor page
 */
function isModelEditorUrl(url) {
  return url.includes('/model-editor/') && url.includes('#');
}

/**
 * Add a new custom domain
 * @param {string} domain - Domain to add
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function addDomain(domain) {
  // Check if domain is already in defaults
  if (DEFAULT_DOMAINS.includes(domain)) {
    return { success: false, error: 'Domain is already included by default' };
  }

  // Get current custom domains
  const customDomains = await getCustomDomains();

  // Check if already added
  if (customDomains.includes(domain)) {
    return { success: false, error: 'Domain already added' };
  }

  // Add to storage
  customDomains.push(domain);
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEY]: customDomains }, () => {
      resolve({ success: true });
    });
  });
}

/**
 * Remove a custom domain
 * @param {string} domain - Domain to remove
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function removeDomain(domain) {
  // Can't remove default domains
  if (DEFAULT_DOMAINS.includes(domain)) {
    return { success: false, error: 'Cannot remove default domain' };
  }

  const customDomains = await getCustomDomains();
  const filtered = customDomains.filter(d => d !== domain);

  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEY]: filtered }, () => {
      resolve({ success: true });
    });
  });
}

/**
 * Check if a domain is allowed
 * @param {string} domain - Domain to check
 * @returns {Promise<boolean>}
 */
async function isDomainAllowed(domain) {
  const allowedDomains = await getAllowedDomains();

  // Check exact match
  if (allowedDomains.includes(domain)) {
    return true;
  }

  // Check wildcard patterns
  for (const pattern of allowedDomains) {
    if (pattern.startsWith('*.')) {
      const baseDomain = pattern.substring(2);
      if (domain === baseDomain || domain.endsWith('.' + baseDomain)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Check if URL is on an allowed domain
 * @param {string} url - URL to check
 * @returns {Promise<boolean>}
 */
async function isUrlAllowed(url) {
  const domain = extractDomain(url);
  if (!domain) return false;
  return await isDomainAllowed(domain);
}

// Export functions for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getAllowedDomains,
    getCustomDomains,
    extractDomain,
    isModelEditorUrl,
    addDomain,
    removeDomain,
    isDomainAllowed,
    isUrlAllowed,
    DEFAULT_DOMAINS
  };
}
