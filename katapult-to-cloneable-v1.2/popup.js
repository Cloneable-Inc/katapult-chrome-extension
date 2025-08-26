// Popup script to show extension status

chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
  const currentTab = tabs[0];
  const statusElement = document.getElementById('status');
  const debugBtn = document.getElementById('dump-websocket-btn');
  
  if (currentTab.url && currentTab.url.includes('katapultpro.com')) {
    statusElement.textContent = 'Active on Katapult Pro';
    statusElement.classList.add('active');
    debugBtn.disabled = false;
  } else {
    statusElement.textContent = 'Navigate to katapultpro.com to use';
    debugBtn.disabled = true;
  }
});

// Debug button to dump raw WebSocket data
document.getElementById('dump-websocket-btn').addEventListener('click', () => {
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    const currentTab = tabs[0];
    
    // Send message to content script to dump WebSocket data
    chrome.tabs.sendMessage(currentTab.id, {
      type: 'DUMP_WEBSOCKET_DATA'
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Error sending message:', chrome.runtime.lastError);
        return;
      }
      
      if (response && response.success) {
        // Show feedback
        const btn = document.getElementById('dump-websocket-btn');
        const originalText = btn.textContent;
        btn.textContent = '✓ Downloaded!';
        btn.style.background = '#4CAF50';
        
        setTimeout(() => {
          btn.textContent = originalText;
          btn.style.background = '#f44336';
        }, 2000);
      } else {
        console.error('Failed to dump WebSocket data');
      }
    });
  });
});