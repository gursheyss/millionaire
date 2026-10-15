(function () {
  'use strict';

  function connect(handlers) {
    var ws = null;
    var pending = {};
    var nextId = 1;
    var retry = 1000;
    var key = localStorage.getItem('controlKey') || '';

    function open() {
      var proto = location.protocol === 'https:' ? 'wss://' : 'ws://';
      ws = new WebSocket(proto + location.host + '/game');
      ws.onopen = function () { retry = 1000; if (handlers.onOpen) handlers.onOpen(); };
      ws.onmessage = function (ev) {
        var msg = JSON.parse(ev.data);
        if (msg.type === 'state') { if (handlers.onState) handlers.onState(msg.state, msg); return; }
        var p = pending[msg.id];
        if (!p) return;
        delete pending[msg.id];
        if (msg.type === 'ok') p.resolve(); else p.reject(new Error(msg.error));
      };
      ws.onclose = function () {
        if (handlers.onClose) handlers.onClose();
        setTimeout(open, retry);
        retry = Math.min(retry * 2, 10000);
      };
      ws.onerror = function () { ws.close(); };
    }

    open();

    return {
      send: function (name, payload) {
        return new Promise(function (resolve, reject) {
          if (!ws || ws.readyState !== 1) return reject(new Error('Not connected'));
          var id = nextId++;
          pending[id] = { resolve: resolve, reject: reject };
          ws.send(JSON.stringify({ type: 'action', id: id, name: name, payload: payload || {}, key: key }));
        });
      },
      setKey: function (k) { key = k; localStorage.setItem('controlKey', k); },
      getKey: function () { return key; },
    };
  }

  window.MillionaireClient = { connect: connect };
})();
