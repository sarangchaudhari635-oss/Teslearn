(() => {
  const params = new URLSearchParams(location.search);
  const mode = params.get('mode') || Store.result?.liveMode || 'viva';
  const isViva = mode === 'viva';
  const topic = Store.topic;
  if (!topic) location.href = 'index.html';

  document.getElementById('title').textContent = topic;
  document.getElementById('kicker').textContent =
    mode === 'screen' ? 'Screen Reader' : 'Live Viva';

  const vivaPanel = document.getElementById('vivaPanel');
  const screenPanel = document.getElementById('screenPanel');
  const statusEl = document.getElementById(isViva ? 'status' : 'statusScreen');
  const subEl = document.getElementById(isViva ? 'sub' : 'subScreen');
  const errEl = document.getElementById(isViva ? 'err' : 'errScreen');
  const sessionBtn = document.getElementById('sessionBtn');
  const hintEl = document.getElementById(isViva ? 'hint' : 'hintScreen');
  const liveStage = document.getElementById('liveStage');
  const liveFsBtn = document.getElementById('liveFsBtn');
  const vizEl = document.getElementById(isViva ? 'viz' : 'vizScreen');

  if (isViva) {
    vivaPanel?.classList.remove('hidden');
    screenPanel?.classList.add('hidden');
  } else {
    vivaPanel?.classList.add('hidden');
    screenPanel?.classList.remove('hidden');
  }

  const api = isViva ? '/api/viva' : '/api/screen';
  let running = false;
  let pollTimer = null;

  async function post(path, body) {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || data.error || `${path} failed (${res.status})`);
    return data;
  }

  async function getStatus() {
    const res = await fetch(`${API_BASE}${api}/status`);
    if (!res.ok) throw new Error('Status check failed');
    return res.json();
  }

  function setSubtitle(text) {
    if (!text) return;
    subEl.innerHTML = `<p>${String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`;
  }

  function showErr(msg) {
    errEl.textContent = msg;
    errEl.classList.remove('hidden');
    sessionBtn?.classList.remove('hidden');
  }

  function setLiveUi(live) {
    running = live;
    statusEl.textContent = live ? 'Live' : 'Offline';
    statusEl.classList.toggle('ready', live);
    statusEl.classList.toggle('live', live);
    vizEl?.classList.toggle('active', live);
    sessionBtn?.classList.toggle('hidden', live);

    if (isViva) {
      hintEl.textContent = live
        ? 'Speak naturally — the examiner listens and replies through your speakers'
        : 'Tap Reconnect to start again';
    } else {
      hintEl.textContent = live
        ? 'Server is watching your screen and listening — replies play on your speakers'
        : 'Tap Reconnect to start again';
    }
  }

  function startPolling() {
    stopPolling();
    pollTimer = setInterval(async () => {
      try {
        const st = await getStatus();
        setLiveUi(!!st.running);
        if (st.last_text) setSubtitle(st.last_text);
      } catch (_) { /* ignore transient poll errors */ }
    }, 1500);
  }

  function stopPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
  }

  async function startSession() {
    errEl.classList.add('hidden');
    statusEl.textContent = 'Starting…';
    statusEl.classList.remove('ready', 'live');
    vizEl?.classList.remove('active');
    hintEl.textContent = 'Launching backend session…';

    try {
      if (isViva) {
        await post(`${api}/start`, { topic });
      } else {
        await post(`${api}/start?mode=screen`);
      }
      setLiveUi(true);
      startPolling();
    } catch (e) {
      showErr(e.message || String(e));
      setLiveUi(false);
    }
  }

  async function stopSession() {
    try {
      await post(`${api}/stop`);
    } catch (_) { /* best effort */ }
    stopPolling();
    setLiveUi(false);
  }

  function setupFullscreen() {
    if (!liveStage || !liveFsBtn) return;
    const isFs = () =>
      document.fullscreenElement === liveStage ||
      document.webkitFullscreenElement === liveStage;

    liveFsBtn.addEventListener('click', () => {
      if (isFs()) {
        if (document.exitFullscreen) document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      } else if (liveStage.requestFullscreen) {
        liveStage.requestFullscreen();
      } else if (liveStage.webkitRequestFullscreen) {
        liveStage.webkitRequestFullscreen();
      }
    });

    const sync = () => {
      liveFsBtn.textContent = isFs() ? '⛶ Exit fullscreen' : '⛶ Fullscreen';
    };
    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('webkitfullscreenchange', sync);
  }

  setupFullscreen();
  sessionBtn?.addEventListener('click', startSession);
  setLiveUi(false);
  startSession();

  window.addEventListener('beforeunload', () => {
    if (running) {
      fetch(`${API_BASE}${api}/stop`, { method: 'POST', keepalive: true }).catch(() => {});
    }
  });
})();
