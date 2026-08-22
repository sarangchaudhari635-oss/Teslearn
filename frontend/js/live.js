(() => {
  class PcmPlayer {
    constructor(sampleRate = 24000) {
      this.sampleRate = sampleRate;
      this.ctx = null;
      this.nextTime = 0;
    }

    async init() {
      if (!this.ctx) {
        this.ctx = new AudioContext({ sampleRate: this.sampleRate });
        this.nextTime = this.ctx.currentTime;
      }
      if (this.ctx.state === 'suspended') await this.ctx.resume();
    }

    play(base64Data) {
      if (!this.ctx || !base64Data) return;
      const binary = atob(base64Data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const pcm = new Int16Array(bytes.buffer);
      const floats = new Float32Array(pcm.length);
      for (let i = 0; i < pcm.length; i++) floats[i] = pcm[i] / 32768;

      const buffer = this.ctx.createBuffer(1, floats.length, this.sampleRate);
      buffer.copyToChannel(floats, 0);
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(this.ctx.destination);
      const start = Math.max(this.nextTime, this.ctx.currentTime);
      source.start(start);
      this.nextTime = start + buffer.duration;
    }

    reset() {
      this.nextTime = this.ctx?.currentTime ?? 0;
    }
  }

  const params = new URLSearchParams(location.search);
  const mode = params.get('mode') || Store.result?.wsMode || 'viva';
  const isViva = mode === 'viva';
  const topic = Store.topic;
  if (!topic) location.href = 'index.html';

  document.getElementById('title').textContent = topic;
  document.getElementById('kicker').textContent =
    mode === 'screen' ? 'Screen Reader' : 'Live Viva';

  const statusEl = document.getElementById('status');
  const subEl = document.getElementById('sub');
  const errEl = document.getElementById('err');
  const micBtn = document.getElementById('mic');
  const sessionBtn = document.getElementById('sessionBtn');
  const recordBtn = document.getElementById('recordBtn');
  const hintEl = document.getElementById(isViva ? 'hint' : 'hintScreen');
  const camEl = document.getElementById('cam');
  const vizEl = document.getElementById('viz');
  const micRing = document.getElementById(isViva ? 'micRing' : 'micRingScreen');
  const vivaControls = document.getElementById('vivaControls');
  const screenControls = document.getElementById('screenControls');

  if (isViva) {
    vivaControls?.classList.remove('hidden');
    screenControls?.classList.add('hidden');
  } else {
    vivaControls?.classList.add('hidden');
    screenControls?.classList.remove('hidden');
  }

  let ws = null;
  let sessionConnected = false;
  let recording = false;
  let mediaStream = null;
  let audioCtx = null;
  let processor = null;
  let analyser = null;
  let frameTimer = null;
  let vizTimer = null;
  const pcmOut = new PcmPlayer(24000);

  function sendCtrl(type) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type }));
  }

  function setVivaUi() {
    if (!isViva) return;
    sessionBtn.disabled = sessionConnected;
    sessionBtn.textContent = sessionConnected ? 'Connected' : 'Connect session';
    recordBtn.disabled = !sessionConnected;
    recordBtn.textContent = recording ? 'Stop & send' : 'Record answer';
    recordBtn.classList.toggle('on', recording);
    micRing?.classList.toggle('live', recording);

    if (!sessionConnected) {
      statusEl.textContent = 'Connect to start viva';
      statusEl.classList.remove('on');
      hintEl.textContent = 'Connect first, then record each answer manually';
    } else if (recording) {
      statusEl.textContent = 'Recording your answer…';
      statusEl.classList.add('on');
      hintEl.textContent = 'Tap Stop when you finish speaking';
    } else {
      statusEl.textContent = 'Ready — tap Record answer';
      statusEl.classList.remove('on');
      hintEl.textContent = 'Only your recorded chunk is sent (no background noise)';
    }
  }

  function setScreenStatus(text, live = false) {
    statusEl.textContent = text;
    statusEl.classList.toggle('on', live);
    micBtn.classList.toggle('on', live);
    micRing?.classList.toggle('live', live);
    hintEl.textContent = live ? 'Tap to end session' : 'Tap to start live session';
  }

  function showErr(msg) {
    errEl.textContent = msg;
    errEl.classList.remove('hidden');
  }

  function startViz() {
    if (!analyser || !vizEl) return;
    const bars = vizEl.querySelectorAll('.viz-bar');
    vizTimer = setInterval(() => {
      const data = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(data);
      bars.forEach((bar, i) => {
        const v = data[i * 4] || 0;
        bar.style.height = `${Math.max(8, (v / 255) * 100)}%`;
      });
    }, 80);
  }

  function stopViz() {
    if (vizTimer) clearInterval(vizTimer);
    vizTimer = null;
    vizEl?.querySelectorAll('.viz-bar').forEach((b) => { b.style.height = '12%'; });
  }

  async function getScreenStream() {
    if (navigator.mediaDevices.getDisplayMedia) {
      try {
        return await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: 1 },
          audio: false,
        });
      } catch (_) { /* fall through */ }
    }
    return navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
  }

  async function setupMedia() {
    if (mode === 'screen') {
      const displayStream = await getScreenStream();
      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStream = new MediaStream([
        ...displayStream.getVideoTracks(),
        ...micStream.getAudioTracks(),
      ]);
      const videoTrack = displayStream.getVideoTracks()[0];
      if (videoTrack) {
        camEl.srcObject = displayStream;
        camEl.classList.remove('hidden');
        videoTrack.onended = () => {
          if (sessionConnected) endSession(true);
        };
      }
    } else {
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    }
  }

  function setupWsHandlers() {
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.type === 'status') {
        if (msg.status === 'connected') {
          sessionConnected = true;
          if (isViva) setVivaUi();
          else setScreenStatus('Live — speak now', true);
        } else if (!isViva) {
          setScreenStatus(msg.status, msg.status === 'connected');
        }
      } else if (msg.type === 'text') {
        subEl.textContent = msg.text;
      } else if (msg.type === 'audio') {
        pcmOut.play(msg.data);
      } else if (msg.type === 'error') {
        showErr(msg.error);
      }
    };
    ws.onerror = () => showErr('WebSocket error — is the backend running?');
    ws.onclose = () => {
      sessionConnected = false;
      recording = false;
      if (isViva) setVivaUi();
      else setScreenStatus('Disconnected');
      teardownAudio(false);
    };
  }

  async function connectSession() {
    errEl.classList.add('hidden');
    if (sessionConnected) return;

    if (isViva) {
      statusEl.textContent = 'Connecting…';
      sessionBtn.disabled = true;
    } else {
      setScreenStatus('Connecting…');
    }

    try {
      await pcmOut.init();
      await setupMedia();

      ws = new WebSocket(wsUrl(mode));
      setupWsHandlers();

      await new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('Connection timeout')), 12000);
        ws.onopen = () => { clearTimeout(t); resolve(); };
        ws.onerror = () => { clearTimeout(t); reject(new Error('WebSocket failed')); };
      });

      startMicPcm();
      if (mode === 'screen' && mediaStream.getVideoTracks().length) startVideoFrames();
    } catch (e) {
      showErr(e.message || String(e));
      endSession(false);
    }
  }

  function startMicPcm() {
    audioCtx = new AudioContext({ sampleRate: 16000 });
    const source = audioCtx.createMediaStreamSource(mediaStream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 64;
    processor = audioCtx.createScriptProcessor(4096, 1, 1);
    processor.onaudioprocess = (e) => {
      const shouldSend = isViva ? recording : sessionConnected;
      if (!shouldSend || !ws || ws.readyState !== WebSocket.OPEN) return;

      const input = e.inputBuffer.getChannelData(0);
      const pcm = new Int16Array(input.length);
      for (let i = 0; i < input.length; i++) {
        pcm[i] = Math.max(-32768, Math.min(32767, input[i] * 32768));
      }
      const bytes = new Uint8Array(pcm.buffer);
      let bin = '';
      bytes.forEach((b) => { bin += String.fromCharCode(b); });
      ws.send(JSON.stringify({
        type: 'audio',
        mime_type: 'audio/pcm',
        data: btoa(bin),
      }));
    };
    source.connect(analyser);
    analyser.connect(processor);
    processor.connect(audioCtx.destination);
    startViz();
  }

  function startVideoFrames() {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    frameTimer = setInterval(() => {
      if (!ws || ws.readyState !== WebSocket.OPEN || camEl.readyState < 2) return;
      canvas.width = camEl.videoWidth || 640;
      canvas.height = camEl.videoHeight || 480;
      ctx.drawImage(camEl, 0, 0, canvas.width, canvas.height);
      ws.send(JSON.stringify({
        type: 'image',
        mime_type: 'image/jpeg',
        data: canvas.toDataURL('image/jpeg', 0.65).split(',')[1],
      }));
    }, 1000);
  }

  function startRecording() {
    if (!sessionConnected || recording) return;
    recording = true;
    sendCtrl('activity_start');
    setVivaUi();
  }

  function stopRecording() {
    if (!recording) return;
    recording = false;
    sendCtrl('activity_end');
    setVivaUi();
  }

  function teardownAudio(closeWs) {
    stopViz();
    recording = false;
    pcmOut.reset();
    if (frameTimer) clearInterval(frameTimer);
    frameTimer = null;
    if (processor) {
      processor.disconnect();
      processor = null;
    }
    if (analyser) {
      analyser.disconnect();
      analyser = null;
    }
    if (audioCtx) {
      audioCtx.close();
      audioCtx = null;
    }
    if (mediaStream) {
      mediaStream.getTracks().forEach((t) => t.stop());
      mediaStream = null;
    }
    if (closeWs && ws) {
      ws.close();
      ws = null;
    }
    camEl.classList.add('hidden');
    camEl.srcObject = null;
    sessionConnected = false;
    if (isViva) setVivaUi();
  }

  function endSession(userInitiated = true) {
    if (recording) stopRecording();
    teardownAudio(true);
    if (!isViva && userInitiated) setScreenStatus('Tap mic to start');
  }

  if (isViva) {
    setVivaUi();
    sessionBtn?.addEventListener('click', () => connectSession());
    recordBtn?.addEventListener('click', () => {
      if (recording) stopRecording();
      else startRecording();
    });
  } else {
    micBtn.onclick = () => {
      if (sessionConnected) endSession(true);
      else connectSession();
    };
  }

  window.addEventListener('beforeunload', () => {
    if (sessionConnected) endSession(false);
  });
})();
