(function () {
  'use strict';

  var $ = function (sel) { return document.querySelector(sel); };
  var stage = $('#stage');
  var bed = $('#snd-bed');
  var fx = $('#snd-fx');
  var gate = $('#audio-gate');
  var state = null;
  var lastSeq = null;
  var phoneTimer = null;
  var muted = /[?&]preview=1/.test(location.search);

  function fit() {
    var s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    stage.style.transform = 'scale(' + s + ')';
    stage.style.left = ((window.innerWidth - 1920 * s) / 2) + 'px';
    stage.style.top = ((window.innerHeight - 1080 * s) / 2) + 'px';
  }
  window.addEventListener('resize', fit);
  fit();

  function bedFor(tier) {
    if (tier >= 19) return 'hard_million';
    if (tier >= 10) return 'hard';
    if (tier >= 5) return 'medium';
    return 'easy';
  }

  function play(el, name, loop) {
    if (muted || !state.sound) return;
    el.src = '/sounds/' + name + '.mp3';
    el.loop = Boolean(loop);
    var p = el.play();
    if (p && p.catch) p.catch(function () { gate.classList.add('show'); });
  }
  function stopBed() { bed.pause(); bed.removeAttribute('src'); }

  gate.addEventListener('click', function () {
    gate.classList.remove('show');
    if (state) handleCue(state.cue, true);
  });

  function handleCue(c, force) {
    if (!c || (!force && c.seq === lastSeq)) return;
    lastSeq = c.seq;
    if (!c.name) return;
    switch (c.name) {
      case 'question': play(bed, bedFor(state.tier), true); break;
      case 'lets_play': stopBed(); play(fx, 'lets_play'); break;
      case 'final_answer': play(fx, 'final_answer'); break;
      case 'correct_answer': stopBed(); play(fx, 'correct_answer'); break;
      case 'wrong_answer': stopBed(); play(fx, 'wrong_answer'); break;
      case 'you_won_million': stopBed(); play(fx, 'you_won_million'); break;
      case 'winning_theme': stopBed(); play(fx, 'winning_theme'); break;
      case 'audience': play(fx, 'audience'); break;
      case 'paf': play(fx, 'paf'); break;
      case 'lifelines': play(fx, 'lifelines'); break;
      case 'next': stopBed(); play(fx, 'next'); break;
      case 'resign': stopBed(); play(fx, 'resign'); break;
      case 'main_theme': play(bed, 'main_theme', true); break;
      case 'stop': stopBed(); fx.pause(); break;
      default: play(fx, c.name);
    }
    if (!state.sound) { stopBed(); fx.pause(); }
  }

  function renderLadder() {
    var el = $('#ladder');
    el.innerHTML = '';
    state.ladder.forEach(function (t, i) {
      var row = document.createElement('div');
      row.className = 'tier' + (t.milestone ? ' milestone' : '') + (i === 19 ? ' top' : '');
      if (i === state.tier && state.phase !== 'won') row.classList.add('current');
      if (i < state.tier || state.phase === 'won') row.classList.add('won');
      row.innerHTML = '<span class="num">' + (i + 1) + '</span><span class="label"></span>' + (t.note ? '<span class="note"></span>' : '');
      row.querySelector('.label').textContent = t.label;
      if (t.note) row.querySelector('.note').textContent = t.note;
      el.appendChild(row);
    });
  }

  function showOverlay(id) {
    ['idle', 'intro', 'poll', 'phone', 'won'].forEach(function (k) {
      document.getElementById(k).classList.toggle('show', k === id);
    });
  }

  function renderPhone() {
    clearInterval(phoneTimer);
    var ring = $('#phone .ring');
    if (!state.phoneEndsAt) { ring.textContent = '...'; ring.classList.remove('urgent'); return; }
    var tick = function () {
      var left = Math.max(0, Math.ceil((state.phoneEndsAt - Date.now()) / 1000));
      ring.textContent = left;
      ring.classList.toggle('urgent', left <= 5);
      if (left === 0) clearInterval(phoneTimer);
    };
    tick();
    phoneTimer = setInterval(tick, 250);
  }

  function render() {
    var q = state.questions[state.tier] || { text: '', answers: ['', '', '', ''], correct: 0 };
    var phase = state.phase;
    var boardVisible = ['question', 'answers', 'locked', 'correct', 'wrong'].indexOf(phase) >= 0;

    $('#board').style.visibility = boardVisible ? 'visible' : 'hidden';
    $('#question-text').textContent = q.text;
    for (var i = 0; i < 4; i++) {
      var a = document.getElementById('a' + i);
      a.querySelector('.text').textContent = q.answers[i];
      a.className = 'hex answer';
      if (i >= state.revealed) a.classList.add('unrevealed');
      if (state.eliminated[i] && !(phase === 'wrong' && state.selected === i)) a.classList.add('eliminated');
      if (phase === 'locked' && state.selected === i) a.classList.add('selected');
      if ((phase === 'correct' || phase === 'wrong') && i === q.correct) a.classList.add('correct', 'flash');
      if (phase === 'wrong' && state.selected === i) a.classList.add('wrong');
    }

    var hasContestant = Boolean(state.contestant);
    $('#contestant').style.visibility = hasContestant ? 'visible' : 'hidden';
    $('#contestant-name').textContent = state.contestant;
    $('#playing-for').innerHTML = hasContestant ? 'Question <b>' + (state.tier + 1) + '</b> for <b></b>' : '';
    if (hasContestant) $('#playing-for b:last-child').textContent = state.ladder[state.tier].label;

    document.querySelectorAll('.lifeline').forEach(function (el) {
      var k = el.dataset.ll;
      el.classList.toggle('used', Boolean(state.lifelines[k]));
      el.classList.toggle('active', state.activeLifeline === k);
    });

    var winners = state.winners.slice(-4).reverse();
    $('#winners').innerHTML = winners.map(function (w) {
      return '<div><b></b> cleared Q' + (w.tier + 1) + ' (' + w.label + ')</div>';
    }).join('');
    document.querySelectorAll('#winners b').forEach(function (b, i) { b.textContent = winners[i].name; });

    renderLadder();

    if (phase === 'idle') showOverlay('idle');
    else if (phase === 'intro') {
      $('#intro .name').textContent = state.contestant;
      $('#intro .for').textContent = 'Playing for ' + state.ladder[state.tier].label;
      showOverlay('intro');
    } else if (phase === 'won') {
      var last = state.winners[state.winners.length - 1];
      $('#won .amount').textContent = state.ladder[19].label;
      $('#won .note').textContent = state.ladder[19].note || '';
      $('#won .who').textContent = last ? last.name + ' took it home' : '';
      showOverlay('won');
    } else if (state.activeLifeline === 'chat') {
      var bars = document.querySelectorAll('#poll .bar');
      bars.forEach(function (bar, i) {
        var pct = state.poll ? state.poll[i] : 0;
        bar.querySelector('.pct').textContent = pct + '%';
        bar.querySelector('.fill').style.height = Math.max(2, pct * 2.4) + 'px';
      });
      showOverlay('poll');
    } else if (state.activeLifeline === 'phone') {
      renderPhone();
      showOverlay('phone');
    } else showOverlay(null);

    handleCue(state.cue);
  }

  MillionaireClient.connect({
    onState: function (s) { state = s; render(); },
  });
})();
