// Background script for Chrome extension
let dataToTransfer = null;

// Listen for web requests to catch model data
chrome.webRequest.onCompleted.addListener(
  function(details) {
    // Look for API endpoints that might contain model data
    if (details.method === 'GET' && 
        (details.url.includes('/api/') || 
         details.url.includes('/model') || 
         details.url.includes('.json'))) {
      
      console.log('Potential model API call:', details.url);
      
      // Store the URL pattern for later reference
      if (chrome.storage) {
        chrome.storage.local.set({
          lastModelUrl: details.url,
          timestamp: Date.now()
        });
      }
    }
  },
  { urls: ["https://katapultpro.com/*", "https://*.katapultpro.com/*"] }
);

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Legacy support for existing functionality
  if (message.action === 'getModelUrls') {
    chrome.storage.local.get(['lastModelUrl'], (result) => {
      sendResponse(result);
    });
    return true;
  }

});