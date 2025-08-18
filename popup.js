// Popup script to show extension status

chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
  const currentTab = tabs[0];
  const statusElement = document.getElementById('status');
  
  if (currentTab.url && currentTab.url.includes('katapultpro.com')) {
    statusElement.textContent = 'Active on Katapult Pro';
    statusElement.classList.add('active');
  } else {
    statusElement.textContent = 'Navigate to katapultpro.com to use';
  }
});