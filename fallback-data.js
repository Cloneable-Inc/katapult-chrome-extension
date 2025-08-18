// Fallback node types data based on previous captures
// This is used when WebSocket data isn't available

window.fallbackNodeTypes = [
  // OSP category
  { category: 'osp', type: 'pole' },
  { category: 'osp', type: 'guy' },
  { category: 'osp', type: 'slack_span' },
  { category: 'osp', type: 'riser' },
  { category: 'osp', type: 'h_frame' },
  { category: 'osp', type: 'crossarm' },
  { category: 'osp', type: 'extension' },
  { category: 'osp', type: 'down_guy' },
  { category: 'osp', type: 'span_guy' },
  { category: 'osp', type: 'head_guy' },
  { category: 'osp', type: 'push_brace' },
  
  // Anchor category
  { category: 'anchor', type: 'anchor' },
  { category: 'anchor', type: 'virtual_anchor' },
  
  // Fiber callouts category
  { category: 'fiber_callouts', type: 'splitter' },
  { category: 'fiber_callouts', type: 'slack_storage' },
  { category: 'fiber_callouts', type: 'terminal' },
  { category: 'fiber_callouts', type: 'splice_closure' },
  
  // Note category
  { category: 'note', type: 'note' },
  
  // Underground category
  { category: 'underground', type: 'vault' },
  { category: 'underground', type: 'handhole' },
  { category: 'underground', type: 'cabinet' },
  { category: 'underground', type: 'marker' },
  { category: 'underground', type: 'transformer' }
];

console.log('[Cloneable Extension] Fallback data loaded with', window.fallbackNodeTypes.length, 'node types');