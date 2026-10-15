(function () {
  'use strict';

  var $ = function (sel) { return document.querySelector(sel); };
  var state = null;
  var editing = { questions: null, ladder: null };
  var LETTERS = ['A', 'B', 'C', 'D'];

  var client = MillionaireClient.connect({
    onOpen: function () { $('#conn').textContent = 'connected'; $('#conn').className = 'pill on'; },
    onClose: function () { $('#conn').textContent = 'reconnecting'; $('#conn').className = 'pill off'; },
    onState: function (s, msg) {
      var first = !state;
      state = s;
      $('#clients').textContent = msg.clients;
      if (msg.needsKey && !client.getKey()) toast('Enter the control key (top right) before using the controls');
      render(first);
    },
  });

  function toast(text) {
    var el = $('#toast');
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(toast.t);
    toast.t = setTimeout(function () { el.classList.remove('show'); }, 3000);
  }

  function act(name, payload) {
    return client.send(name, payload).catch(function (e) {
      $('#key').classList.toggle('bad', /control key/i.test(e.message));
      toast(e.message);
    });
  }

  $('#key').value = client.getKey();
  $('#key').addEventListener('input', function () {
    client.setKey($('#key').value.trim());
    $('#key').classList.remove('bad');
  });

  function fitPreview() {
    var w = $('#preview-wrap').clientWidth;
    $('#preview').style.transform = 'scale(' + (w / 1920) + ')';
  }
  window.addEventListener('resize', fitPreview);
  fitPreview();

  var PHASE_HINT = {
    idle: 'Seat the next contestant',
    intro: 'Name card is up. Show the question when ready',
    question: 'Reveal the answers',
    answers: 'Wait for their final answer, then click it',
    locked: 'Locked in. Reveal the result',
    correct: 'Correct! Next sends them out and climbs the ladder',
    wrong: 'Wrong. Next lets the same contestant try again',
    won: 'Someone hit the top. Reset to play again',
  };

  function renderAnswers() {
    var q = state.questions[state.tier] || { text: '(no question at this tier)', answers: ['', '', '', ''], correct: 0 };
    $('#q-num').textContent = '#' + (state.tier + 1) + ' for ' + state.ladder[state.tier].label;
    $('#q-text').textContent = q.text;
    var wrap = $('#q-answers');
    wrap.innerHTML = '';
    q.answers.forEach(function (a, i) {
      var b = document.createElement('button');
      b.className = 'ans';
      if (i === q.correct) b.classList.add('iscorrect');
      if (i >= state.revealed) b.classList.add('hiddenA');
      if (state.eliminated[i]) b.classList.add('eliminated');
      if (state.phase === 'locked' && state.selected === i) b.classList.add('selected');
      if ((state.phase === 'correct' || state.phase === 'wrong') && i === q.correct) b.classList.add('correct');
      if (state.phase === 'wrong' && state.selected === i) b.classList.add('wrong');
      b.innerHTML = '<span class="ltr">' + LETTERS[i] + '</span><span class="txt"></span><span class="mark"></span>';
      b.querySelector('.txt').textContent = a;
      b.querySelector('.mark').textContent = i === q.correct ? 'correct' : (i >= state.revealed ? 'hidden' : '');
      b.disabled = !(state.phase === 'answers' || state.phase === 'locked') || state.eliminated[i];
      b.onclick = function () { act('select', { index: i }); };
      wrap.appendChild(b);
    });
  }

  function renderButtons() {
    var p = state.phase;
    $('#phase-text').textContent = p.toUpperCase() + (state.contestant ? '  -  ' + state.contestant : '');
    $('#phase-hint').textContent = PHASE_HINT[p] || '';
    $('#tier-pill').textContent = state.tier + 1;
    $('#sound').checked = state.sound;
    $('#seat').disabled = p === 'won';
    $('#remove').disabled = !state.contestant;
    $('#show-q').disabled = !state.contestant || p === 'won' || p === 'locked';
    $('#reveal-one').disabled = !(p === 'question' || (p === 'answers' && state.revealed < 4));
    $('#reveal-all').disabled = !(p === 'question' || (p === 'answers' && state.revealed < 4));
    $('#reveal').disabled = p !== 'locked';
    $('#deselect').disabled = p !== 'locked';
    $('#next').disabled = !(p === 'correct' || p === 'wrong' || p === 'intro');
    $('#next').textContent = p === 'wrong' ? 'Same contestant, try again' : p === 'correct' ? (state.tier >= 19 ? 'Crown the millionaire' : 'Contestant out, ladder up') : p === 'intro' ? 'Show question' : 'Next';

    var canLL = p === 'answers';
    ['fifty', 'chat', 'phone', 'swap'].forEach(function (k) {
      var b = $('#ll-' + k);
      b.classList.toggle('used', state.lifelines[k]);
      b.classList.toggle('active', state.activeLifeline === k);
      b.disabled = state.lifelines[k] || (k === 'swap' ? !(p === 'question' || p === 'answers') : !canLL);
    });
    $('#panel-chat').classList.toggle('show', state.activeLifeline === 'chat');
    $('#panel-phone').classList.toggle('show', state.activeLifeline === 'phone');
    $('#phone-start').disabled = Boolean(state.phoneEndsAt);
  }

  function renderLadderEditor() {
    if (editing.ladder) return;
    var tb = $('#ladder-table tbody');
    tb.innerHTML = '';
    state.ladder.forEach(function (t, i) {
      var tr = document.createElement('tr');
      tr.innerHTML = '<td>' + (i + 1) + '</td><td><input type="text" class="label"></td><td>' + (i === 19 ? '<input type="text" class="note">' : '') + '</td><td><input type="checkbox" class="ms"></td>';
      tr.querySelector('.label').value = t.label;
      if (i === 19) tr.querySelector('.note').value = t.note || '';
      tr.querySelector('.ms').checked = Boolean(t.milestone);
      tb.appendChild(tr);
    });
    var sel = $('#tier-select');
    sel.innerHTML = '';
    state.ladder.forEach(function (t, i) {
      var o = document.createElement('option');
      o.value = i; o.textContent = (i + 1) + ' - ' + t.label;
      sel.appendChild(o);
    });
    sel.value = state.tier;
  }

  function readLadder() {
    return Array.prototype.map.call(document.querySelectorAll('#ladder-table tbody tr'), function (tr, i) {
      var note = tr.querySelector('.note');
      return { label: tr.querySelector('.label').value, milestone: tr.querySelector('.ms').checked, note: note ? note.value : undefined };
    });
  }

  function renderQuestionEditor(questions) {
    var tb = $('#q-table tbody');
    tb.innerHTML = '';
    questions.forEach(function (q, i) {
      var tr = document.createElement('tr');
      tr.className = (i >= 20 ? 'spare' : '') + (i === state.tier ? ' current' : '');
      var cells = '<td class="idx">' + (i >= 20 ? 'S' + (i - 19) : i + 1) + '</td><td><input type="text" class="qt"></td>';
      for (var k = 0; k < 4; k++) cells += '<td><label class="row" style="gap:4px;flex-wrap:nowrap;"><input type="radio" name="c' + i + '" value="' + k + '"><input type="text" class="a' + k + '"></label></td>';
      cells += '<td class="ctl"><button class="up" title="Move up">&uarr;</button> <button class="down" title="Move down">&darr;</button> <button class="del" title="Delete">&times;</button></td>';
      tr.innerHTML = cells;
      tr.querySelector('.qt').value = q.text;
      for (var j = 0; j < 4; j++) tr.querySelector('.a' + j).value = q.answers[j];
      tr.querySelector('input[value="' + q.correct + '"]').checked = true;
      tr.querySelector('.up').onclick = function () { var qs = readQuestions(); if (i > 0) { qs.splice(i - 1, 0, qs.splice(i, 1)[0]); setEditing(qs); } };
      tr.querySelector('.down').onclick = function () { var qs = readQuestions(); if (i < qs.length - 1) { qs.splice(i + 1, 0, qs.splice(i, 1)[0]); setEditing(qs); } };
      tr.querySelector('.del').onclick = function () { var qs = readQuestions(); qs.splice(i, 1); setEditing(qs); };
      tb.appendChild(tr);
    });
    $('#q-count').textContent = questions.length + ' questions (' + Math.max(0, questions.length - 20) + ' spare)';
  }

  function readQuestions() {
    return Array.prototype.map.call(document.querySelectorAll('#q-table tbody tr'), function (tr) {
      var checked = tr.querySelector('input[type=radio]:checked');
      return {
        text: tr.querySelector('.qt').value,
        answers: [0, 1, 2, 3].map(function (k) { return tr.querySelector('.a' + k).value; }),
        correct: checked ? Number(checked.value) : 0,
      };
    });
  }

  function setEditing(qs) { editing.questions = qs; renderQuestionEditor(qs); }

  $('#q-table').addEventListener('input', function () { editing.questions = readQuestions(); });
  $('#ladder-table').addEventListener('input', function () { editing.ladder = readLadder(); });

  function render(first) {
    renderAnswers();
    renderButtons();
    renderLadderEditor();
    if (!editing.questions) renderQuestionEditor(state.questions);
    if (first) $('#name').focus();
  }

  $('#seat').onclick = function () { act('seat', { name: $('#name').value }).then(function () { $('#name').value = ''; }); };
  $('#name').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('#seat').click(); });
  $('#remove').onclick = function () { act('remove'); };
  $('#show-q').onclick = function () { act('showQuestion'); };
  $('#reveal-one').onclick = function () { act('revealAnswer'); };
  $('#reveal-all').onclick = function () { act('revealAll'); };
  $('#reveal').onclick = function () { act('reveal'); };
  $('#deselect').onclick = function () { act('deselect'); };
  $('#next').onclick = function () { act('next'); };
  $('#undo').onclick = function () { act('undo'); };
  $('#sound').onchange = function () { act('setSound', { enabled: $('#sound').checked }); };
  $('#cue-theme').onclick = function () { act('playCue', { name: 'main_theme' }); };
  $('#cue-stop').onclick = function () { act('playCue', { name: 'stop' }); };
  $('#reset').onclick = function () { if (confirm('Reset the whole game? Questions and ladder are kept; contestant, tier and winners are cleared.')) act('resetGame'); };

  $('#ll-fifty').onclick = function () { act('lifelineFifty'); };
  $('#ll-chat').onclick = function () { act('lifelineChat'); };
  $('#ll-phone').onclick = function () { act('lifelinePhone'); };
  $('#ll-swap').onclick = function () { if (confirm('Swap this question for the next spare?')) act('lifelineSwap'); };
  $('#poll-show').onclick = function () { act('setPoll', { votes: [0, 1, 2, 3].map(function (i) { return Number($('#poll-' + i).value); }) }); };
  $('#ll-close-chat').onclick = function () { act('closeLifeline'); };
  $('#phone-start').onclick = function () { act('startPhoneTimer'); };
  $('#ll-close-phone').onclick = function () { act('closeLifeline'); };

  $('#ladder-save').onclick = function () { act('setLadder', { ladder: readLadder() }).then(function () { editing.ladder = null; toast('Ladder saved'); }); };
  $('#tier-set').onclick = function () { act('setTier', { tier: Number($('#tier-select').value) }); };

  $('#q-add').onclick = function () { var qs = readQuestions(); qs.push({ text: '', answers: ['', '', '', ''], correct: 0 }); setEditing(qs); };
  $('#q-save').onclick = function () {
    act('setQuestions', { questions: readQuestions() }).then(function () { editing.questions = null; toast('Questions saved'); });
  };

  function importQuestions(url, body) {
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-control-key': client.getKey() }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || r.statusText); return j; }); })
      .then(function (j) {
        if (!j.questions.length) throw new Error('No questions found');
        setEditing(j.questions);
        toast('Loaded ' + j.questions.length + ' questions. Check the correct answers, then Save.');
      })
      .catch(function (e) { toast(e.message); });
  }
  $('#sheet-import').onclick = function () { importQuestions('/api/import-sheet', { url: $('#sheet-url').value }); };
  $('#csv-import').onclick = function () { importQuestions('/api/parse-csv', { csv: $('#csv-text').value }); };

  document.addEventListener('keydown', function (e) {
    var tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.metaKey || e.ctrlKey) return;
    var k = e.key.toLowerCase();
    if (k >= '1' && k <= '4') { var b = document.querySelectorAll('#q-answers .ans')[Number(k) - 1]; if (b && !b.disabled) b.click(); }
    else if (k === 'q') $('#show-q').click();
    else if (k === 'r') $('#reveal-one').click();
    else if (k === 'a') $('#reveal-all').click();
    else if (k === 'enter') $('#reveal').click();
    else if (k === 'escape') $('#deselect').click();
    else if (k === 'n') $('#next').click();
    else if (k === 'z') $('#undo').click();
    else return;
    e.preventDefault();
  });
})();
