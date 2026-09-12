const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

const source = name => readFileSync(join(__dirname, '..', name), 'utf8');
const content = source('content.js');
const injected = source('inject.js');

function createWorld(code) {
  const listeners = [];
  const sent = [];
  const window = {
    WebSocket: function () {},
    addEventListener(type, handler) {
      if (type === 'message') listeners.push(handler);
    },
    postMessage(data) {
      // Reproduce Katapult's unconditional JSON.parse of window messages.
      sent.push(JSON.parse(data));
    },
  };
  const context = vm.createContext({
    window,
    document: {
      createElement: () => ({}),
      head: { appendChild() {} },
      getElementById: () => null,
    },
    setTimeout() {}, setInterval() {}, clearTimeout() {}, clearInterval() {},
    updateButtonStatus() {}, importInterface: null,
  });
  vm.runInContext(code, context);
  return {
    context, window, sent,
    receive(data, sender = window) {
      for (const listener of listeners) listener({ data, source: sender });
    },
  };
}

// Load the real transport functions in each isolated world without starting UI timers.
function transport(code) {
  return code.slice(0, code.indexOf('\n// ', code.indexOf('function readCloneableMessage')));
}

for (const [name, code] of [['content', content], ['injected', injected]]) {
  test(`${name}: messages survive Katapult JSON parsing with nested data intact`, () => {
    const world = createWorld(transport(code));
    const payload = {
      type: 'cloneable-data-updated', requestId: 123,
      attributes: { label: 'Pole "A" | (20 ft)\n新', enabled: false, height: 0 },
      samples: [{ nodeId: 'node-1' }], selectedModelKey: null,
    };
    world.context.postCloneableMessage(payload);
    assert.deepEqual(world.sent, [payload]);
    const decoded = world.context.readCloneableMessage({
      data: JSON.stringify(payload), source: world.window,
    });
    assert.deepEqual(JSON.parse(JSON.stringify(decoded)), payload);
    assert.equal(world.context.readCloneableMessage({ data: payload, source: world.window }), payload);
  });

  test(`${name}: ignores malformed, unrelated, and foreign-window messages`, () => {
    const world = createWorld(transport(code));
    for (const data of ['not JSON', '{', 'null', '1', '[]', '{}', null, { type: 'other' }]) {
      assert.equal(world.context.readCloneableMessage({ data, source: world.window }), null);
    }
    assert.equal(world.context.readCloneableMessage({
      data: '{"type":"cloneable-auto-star"}', source: {},
    }), null);
  });
}

test('injected request handler returns captured websocket data as valid JSON', () => {
  const world = createWorld(injected);
  const messages = [{ raw: '{"t":"d","d":{"b":{"p":"models/attributes"}}}', messageIndex: 0 }];
  world.window.katapultWebSocketMessages = messages;
  world.receive(JSON.stringify({ type: 'cloneable-get-websocket-data-dump' }));
  assert.equal(world.sent.length, 1);
  assert.equal(world.sent[0].type, 'cloneable-websocket-data-response');
  assert.equal(world.sent[0].messageCount, 1);
  assert.deepEqual(world.sent[0].messages, messages);
});

test('content listener still applies serialized model data updates', () => {
  const start = content.indexOf('// Add message listener to receive data from injected script');
  const end = content.indexOf('// Update button to show capture status', start);
  const world = createWorld(transport(content) + content.slice(start, end));
  const payload = {
    type: 'cloneable-data-updated',
    nodeTypes: [{ cleanName: 'Pole' }], connectionTypes: [{ cleanName: 'Cable' }],
    attributes: { height: { gui_element: 'textbox' } },
    imageClassifications: ['pole'], selectedModelKey: 'example-model',
  };
  world.receive(JSON.stringify(payload));
  assert.deepEqual(JSON.parse(JSON.stringify(world.window.contentScriptAttributes)), payload.attributes);
  assert.equal(world.window.contentScriptNodeTypes[0].cleanName, 'Pole');
  assert.equal(world.window.contentScriptConnectionTypes[0].cleanName, 'Cable');
  assert.equal(world.window.contentScriptSelectedModelKey, 'example-model');
});

test('calibration requests preserve options and correlate serialized responses', () => {
  const world = createWorld(injected);
  let options;
  world.context.autoCalibratePurpleMarkers = value => {
    options = value;
    return { applied: true, message: 'Calibrated' };
  };
  world.receive(JSON.stringify({
    type: 'cloneable-auto-calibrate', requestId: 42, autoConfirm: false,
  }));
  assert.equal(options.autoConfirm, false);
  assert.deepEqual(world.sent, [{
    type: 'cloneable-auto-calibrate-result', requestId: 42,
    result: { applied: true, message: 'Calibrated' },
  }]);
});
