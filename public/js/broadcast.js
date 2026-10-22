// "Go live from this device": streams the camera and microphone straight from
// the browser, so creators can go live from a phone without installing an app.
//
// The camera is drawn onto a canvas of fixed size and the canvas is what gets
// recorded, so flipping the camera or rotating the phone never breaks the
// recording. MediaRecorder hands over half-second chunks, which are sent to
// the server (src/sockets/ingest.js) one at a time; ffmpeg there turns them
// into a normal live stream.
(() => {
  const root = document.querySelector('[data-broadcast]');
  if (!root) return;

  const channel = root.dataset.channel;
  const preview = root.querySelector('[data-preview]');
  const placeholder = root.querySelector('[data-placeholder]');
  const canvas = root.querySelector('[data-canvas]');
  const statusText = root.querySelector('[data-status]');
  const liveBadge = root.querySelector('[data-live-badge]');
  const viewersWrap = root.querySelector('[data-viewers-wrap]');
  const viewers = root.querySelector('[data-viewers]');
  const cameraButton = root.querySelector('[data-action="camera"]');
  const liveButton = root.querySelector('[data-action="live"]');
  const flipButton = root.querySelector('[data-action="flip"]');
  const muteButton = root.querySelector('[data-action="mute"]');
  const qualitySelect = root.querySelector('[data-quality]');
  const secureHelp = root.querySelector('[data-secure-help]');
  const context = canvas.getContext('2d');

  // WebM in Chrome, Edge, Firefox and on Android; MP4 in Safari on iPhone and Mac.
  const RECORDING_TYPES = [
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp9,opus',
    'video/webm',
    'video/mp4;codecs=avc1,mp4a.40.2',
    'video/mp4',
  ];
  const QUALITY = {
    hd: { long: 1280, short: 720, bitrate: 2_500_000 },
    sd: { long: 854, short: 480, bitrate: 1_000_000 },
  };
  const CHUNK_MS = 500;
  const MAX_BACKLOG_MS = 15_000;
  const FRAME_MS = 1000 / 30;

  let camera = null; // video from getUserMedia
  let audioTrack = null; // the microphone, or silence when there is none
  let facingMode = 'user';
  let recorder = null;
  let recordingQuality = null;
  let ingest = null; // Socket.IO connection that carries the video
  let wantLive = false;
  let channelLive = false; // what viewers see, from the status feed
  let queue = [];
  let sending = false;
  let wakeLock = null;
  let drawing = false;

  const canStream = Boolean(
    navigator.mediaDevices?.getUserMedia && window.MediaRecorder && canvas.captureStream && typeof window.io === 'function',
  );

  // ------------------------------------------------------------- camera

  function videoConstraints() {
    return { facingMode: { ideal: facingMode }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } };
  }

  async function turnOnCamera() {
    if (!canStream) return explainUnsupported();
    // Made while the click still counts as a user gesture, so the browser lets
    // it run. Only used when there is no microphone.
    const silence = createSilence();
    cameraButton.disabled = true;
    setStatus('Asking for camera and microphone access...');
    try {
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints(),
          audio: { echoCancellation: true, noiseSuppression: true },
        });
      } catch (error) {
        if (error.name !== 'NotFoundError' && error.name !== 'NotAllowedError') throw error;
        stream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints() }); // No microphone.
      }
      const microphone = stream.getAudioTracks()[0];
      audioTrack = microphone ?? silence.track;
      if (microphone) silence.close();
      muteButton.hidden = !microphone;
      showCamera(stream);
      cameraButton.hidden = true;
      liveButton.hidden = false;
      flipButton.hidden = !(await hasSeveralCameras());
      setStatus(microphone
        ? 'Camera ready. Press "Go live" when you are.'
        : 'Camera ready, but no microphone was found. Viewers will hear silence.');
    } catch (error) {
      silence.close();
      cameraButton.disabled = false;
      setStatus(cameraError(error), 'error');
    }
  }

  function showCamera(stream) {
    camera?.getVideoTracks().forEach((track) => track.stop());
    camera = stream;
    preview.srcObject = new MediaStream(stream.getVideoTracks());
    preview.classList.toggle('is-mirrored', facingMode === 'user');
    placeholder.hidden = true;
    preview.play().catch(() => {});
    startDrawing();
  }

  async function flipCamera() {
    const previousMode = facingMode;
    facingMode = facingMode === 'user' ? 'environment' : 'user';
    flipButton.disabled = true;
    try {
      // Some phones cannot open the second camera while the first one is on.
      camera?.getVideoTracks().forEach((track) => track.stop());
      showCamera(await navigator.mediaDevices.getUserMedia({ video: videoConstraints() }));
    } catch (error) {
      facingMode = previousMode;
      setStatus(cameraError(error), 'error');
      navigator.mediaDevices.getUserMedia({ video: videoConstraints() }).then(showCamera, () => {});
    } finally {
      flipButton.disabled = false;
    }
  }

  // A silent audio track, so streams without a microphone still have sound.
  function createSilence() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return { track: null, close() {} };
    const audio = new AudioContextClass();
    const destination = audio.createMediaStreamDestination();
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    gain.gain.value = 0;
    oscillator.connect(gain).connect(destination);
    oscillator.start();
    return { track: destination.stream.getAudioTracks()[0], close: () => audio.close().catch(() => {}) };
  }

  async function hasSeveralCameras() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter((device) => device.kind === 'videoinput').length > 1;
    } catch {
      return false;
    }
  }

  // Letterboxes the camera into the canvas, whatever way the phone is held.
  function startDrawing() {
    if (drawing) return;
    drawing = true;
    let last = 0;
    const draw = (now) => {
      if (now - last >= FRAME_MS - 2) {
        drawFrame();
        last = now;
      }
      requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);
  }

  function drawFrame() {
    const { width, height } = canvas;
    context.fillStyle = '#000';
    context.fillRect(0, 0, width, height);
    const { videoWidth, videoHeight } = preview;
    if (!videoWidth || !videoHeight) return;
    const scale = Math.min(width / videoWidth, height / videoHeight);
    const drawWidth = videoWidth * scale;
    const drawHeight = videoHeight * scale;
    context.drawImage(preview, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
  }

  // ----------------------------------------------------------- streaming

  function goLive() {
    wantLive = true;
    updateControls();
    setStatus('Connecting...');
    requestWakeLock();
    if (!ingest) connectIngest();
    else if (ingest.connected) startRecording();
  }

  function connectIngest() {
    ingest = window.io({ path: '/ingest.io' });
    ingest.on('connect', () => {
      if (wantLive) startRecording();
    });
    // After a dropped connection, a fresh recording starts on reconnect. The
    // server keeps the stream open for 30 seconds, so viewers stay.
    ingest.on('disconnect', () => {
      if (!wantLive) return;
      stopRecorder();
      setStatus('Connection lost. Reconnecting...', 'warning');
    });
    ingest.on('connect_error', (error) => {
      if (wantLive) setStatus(`Cannot reach the server (${error.message}). Retrying...`, 'warning');
    });
    ingest.on('broadcast:error', (message) => stopLocally(message, 'error'));
    ingest.on('broadcast:replaced', () => {
      stopLocally('You went live from another tab or device, so streaming stopped here.', 'warning');
    });
  }

  async function startRecording() {
    const mimeType = RECORDING_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
    if (!mimeType) return stopLocally('This browser cannot record video for streaming.', 'error');
    recordingQuality ??= sizeCanvas();

    const response = await ingest
      .timeout(15000)
      .emitWithAck('broadcast:start', { quality: qualitySelect.value })
      .catch(() => ({ ok: false, error: 'The server did not answer. Please try again.' }));
    if (!wantLive || !ingest.connected) return;
    if (!response.ok) return stopLocally(response.error, 'error');

    const tracks = [canvas.captureStream(30).getVideoTracks()[0], audioTrack].filter(Boolean);
    const current = new MediaRecorder(new MediaStream(tracks), {
      mimeType,
      videoBitsPerSecond: recordingQuality.bitrate,
      audioBitsPerSecond: 128_000,
      // A keyframe every second keeps MP4 fragments short (ignored where unsupported).
      videoKeyFrameIntervalDuration: 1000,
    });
    recorder = current;
    queue = [];
    current.ondataavailable = (event) => {
      if (recorder !== current || event.data.size === 0) return;
      queue.push(event.data);
      sendChunks();
    };
    current.onerror = () => stopLocally('Recording stopped unexpectedly. Please try again.', 'error');
    current.start(CHUNK_MS);
    // After a reconnect the channel never went offline, so no new 'live' event comes.
    if (channelLive) setStatus('You are live! Viewers can watch you now.', 'success');
    else setStatus('Starting your stream...');
  }

  // Sends recorded chunks in order, each after the server confirmed the last.
  async function sendChunks() {
    if (sending) return;
    sending = true;
    try {
      while (queue.length && ingest?.connected) {
        if (queue.length * CHUNK_MS > MAX_BACKLOG_MS) {
          stopLocally('Your upload is too slow for live video. Try Wi-Fi or SD quality.', 'error');
          return;
        }
        const data = await queue[0].arrayBuffer();
        const response = await ingest.timeout(10000).emitWithAck('broadcast:chunk', data).catch(() => null);
        if (!response) {
          restartRecording(); // No answer: start over with a fresh recording.
          return;
        }
        if (!response.ok) return;
        queue.shift();
      }
    } finally {
      sending = false;
    }
  }

  function sizeCanvas() {
    const quality = QUALITY[qualitySelect.value] ?? QUALITY.hd;
    const portrait = preview.videoHeight > preview.videoWidth;
    canvas.width = portrait ? quality.short : quality.long;
    canvas.height = portrait ? quality.long : quality.short;
    return quality;
  }

  function stopRecorder() {
    const current = recorder;
    recorder = null;
    queue = [];
    if (current && current.state !== 'inactive') current.stop();
  }

  function restartRecording() {
    stopRecorder();
    if (wantLive && ingest?.connected) startRecording();
  }

  async function endStream() {
    wantLive = false;
    liveButton.disabled = true;
    setStatus('Ending your stream...');
    await finishRecording();
    await ingest?.timeout(5000).emitWithAck('broadcast:stop').catch(() => {});
    afterStream('Stream ended. Nice work!', 'info');
  }

  // Stops the recorder and gives the last chunks up to 3 seconds to upload.
  function finishRecording() {
    const current = recorder;
    if (!current || current.state === 'inactive') return Promise.resolve();
    return new Promise((resolve) => {
      current.addEventListener('stop', () => {
        const deadline = Date.now() + 3000;
        const wait = () => (queue.length === 0 || Date.now() > deadline ? resolve() : setTimeout(wait, 100));
        wait();
      }, { once: true });
      current.stop();
    });
  }

  function stopLocally(message, tone) {
    wantLive = false;
    stopRecorder();
    afterStream(message, tone);
  }

  function afterStream(message, tone) {
    recorder = null;
    queue = [];
    recordingQuality = null;
    releaseWakeLock();
    updateControls();
    setStatus(message, tone);
  }

  // --------------------------------------------------------- page state

  function updateControls() {
    liveButton.disabled = false;
    liveButton.textContent = wantLive ? 'End stream' : 'Go live';
    liveButton.classList.toggle('btn--live', !wantLive);
    liveButton.classList.toggle('btn--secondary', wantLive);
    qualitySelect.disabled = wantLive;
  }

  function setStatus(text, tone = 'info') {
    statusText.textContent = text;
    statusText.dataset.tone = tone;
  }

  function renderLive(live) {
    channelLive = live;
    liveBadge.hidden = !live;
    viewersWrap.hidden = !live;
    if (live && wantLive) setStatus('You are live! Viewers can watch you now.', 'success');
  }

  function explainUnsupported() {
    if (!window.isSecureContext) {
      secureHelp.hidden = false;
      setStatus('The camera only works on a secure (https) page. See the steps below.', 'error');
    } else {
      setStatus('This browser cannot stream from the camera. Try the latest Chrome, Safari or Firefox.', 'error');
    }
  }

  function cameraError(error) {
    switch (error?.name) {
      case 'NotAllowedError':
        return 'Camera access is blocked. Allow the camera for this site in your browser settings, then try again.';
      case 'NotFoundError':
        return 'No camera was found on this device.';
      case 'NotReadableError':
        return 'The camera is busy. Close other apps that use it, then try again.';
      default:
        return `The camera could not start (${error?.name || 'unknown error'}).`;
    }
  }

  async function requestWakeLock() {
    try {
      wakeLock = await navigator.wakeLock?.request('screen');
    } catch {
      wakeLock = null; // Not supported, or not allowed right now.
    }
  }

  function releaseWakeLock() {
    wakeLock?.release().catch(() => {});
    wakeLock = null;
  }

  // The screen lock is dropped when the page is hidden; take it back on return.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && wantLive) requestWakeLock();
  });
  window.addEventListener('beforeunload', (event) => {
    if (!wantLive) return;
    event.preventDefault();
    event.returnValue = '';
  });

  cameraButton.addEventListener('click', turnOnCamera);
  liveButton.addEventListener('click', () => (wantLive ? endStream() : goLive()));
  flipButton.addEventListener('click', flipCamera);
  muteButton.addEventListener('click', () => {
    audioTrack.enabled = !audioTrack.enabled;
    muteButton.textContent = audioTrack.enabled ? 'Mute mic' : 'Unmute mic';
    muteButton.setAttribute('aria-pressed', String(!audioTrack.enabled));
  });

  if (!canStream) {
    explainUnsupported();
    cameraButton.disabled = true;
    return;
  }

  // Live status and viewer count, from the same feed the dashboard uses.
  const status = window.io({ auth: { channel, mode: 'status' } });
  status.on('stream:state', (state) => renderLive(state.isLive));
  status.on('stream:live', () => renderLive(true));
  status.on('stream:offline', () => renderLive(false));
  status.on('viewers', (count) => {
    viewers.textContent = count;
  });
})();
