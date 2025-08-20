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
      chrome.storage.local.set({
        lastModelUrl: details.url,
        timestamp: Date.now()
      });
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

  // New cross-tab data transfer functionality
  if (message.type === 'OPEN_TAB_WITH_DATA') {
    // Store the data temporarily
    dataToTransfer = message.data;
    
    // Open the new tab
    chrome.tabs.create({ 
      url: message.targetUrl || 'https://app.cloneable.ai'
    }, (newTab) => {
      // Store data with the tab ID for retrieval
      const tabData = {
        data: message.data,
        sourceUrl: sender.tab?.url,
        timestamp: Date.now()
      };
      
      chrome.storage.local.set({
        [`tabData_${newTab.id}`]: tabData
      }, () => {
        sendResponse({ success: true, tabId: newTab.id });
        
        // Clean up after 5 minutes to prevent storage bloat
        setTimeout(() => {
          chrome.storage.local.remove([`tabData_${newTab.id}`]);
        }, 5 * 60 * 1000);
      });
    });
    
    return true; // Keep channel open for async response
  }
  
  if (message.type === 'GET_INITIAL_DATA') {
    // Called by the newly opened tab to get its data
    chrome.storage.local.get([`tabData_${sender.tab.id}`], (result) => {
      const tabData = result[`tabData_${sender.tab.id}`];
      if (tabData) {
        sendResponse({ 
          data: tabData.data, 
          sourceUrl: tabData.sourceUrl,
          timestamp: tabData.timestamp 
        });
        // Clean up after successful retrieval
        chrome.storage.local.remove([`tabData_${sender.tab.id}`]);
      } else {
        sendResponse({ data: null });
      }
    });
    return true;
  }
});