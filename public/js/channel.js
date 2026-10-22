// Channel page: live video player, chat, follow button and live status.
(() => {
  const root = document.querySelector('[data-channel]');
  if (!root) return;

  const channel = root.dataset.channel;
  const playbackUrl = root.dataset.playbackUrl;
  const video = root.querySelector('[data-video]');
  const offlineScreen = root.querySelector('[data-offline]');
  const playerMessage = root.querySelector('[data-player-message]');
  const unmuteButton = root.querySelector('[data-unmute]');
  const uptime = root.querySelector('[data-uptime]');
  const messages = root.querySelector('[data-chat-messages]');
  const chatForm = root.querySelector('[data-chat-form]');
  const followForm = root.querySelector('[data-follow-form]');
  const countFormat = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
  const MAX_CHAT_ITEMS = 150;

  let isLive = root.dataset.live === 'true';
  let startedAt = root.dataset.startedAt ? new Date(root.dataset.startedAt) : null;
  let player = null;
  let retryTimer = null;

  // ------------------------------------------------------------- player

  const canPlayLive = Boolean(window.mpegts && window.mpegts.getFeatureList().mseLivePlayback);

  function startPlayer() {
    if (player || !isLive) return;
    if (!canPlayLive) {
      showMessage('This browser cannot play live video. On iPhone, update to iOS 17.1 or newer. Elsewhere, try Chrome, Edge, Firefox or Safari.');
      return;
    }
    player = mpegts.createPlayer(
      { type: 'flv', isLive: true, url: playbackUrl },
      { enableStashBuffer: false, liveBufferLatencyChasing: true },
    );
    player.attachMediaElement(video);
    player.on(mpegts.Events.ERROR, retryPlayer);
    player.on(mpegts.Events.LOADING_COMPLETE, retryPlayer);
    player.load();
    // Browsers only allow autoplay without sound, so start muted.
    video.muted = true;
    video.play().catch(() => {});
    unmuteButton.hidden = false;
  }

  function stopPlayer() {
    clearTimeout(retryTimer);
    if (!player) return;
    try {
      player.pause();
      player.unload();
      player.detachMediaElement();
      player.destroy();
    } catch (error) {
      console.warn('Player cleanup failed', error);
    }
    player = null;
  }

  // The video connection dropped. Try again while the channel is still live.
  function retryPlayer() {
    stopPlayer();
    if (!isLive) return;
    showMessage('Reconnecting...');
    retryTimer = setTimeout(() => {
      hideMessage();
      startPlayer();
    }, 3000);
  }

  function showMessage(text) {
    playerMessage.textContent = text;
    playerMessage.hidden = false;
  }

  function hideMessage() {
    playerMessage.hidden = true;
  }

  video.addEventListener('waiting', () => {
    if (isLive) showMessage('Waiting for the stream...');
  });
  video.addEventListener('playing', hideMessage);
  video.addEventListener('volumechange', () => {
    unmuteButton.hidden = !video.muted || !player;
  });
  unmuteButton.addEventListener('click', () => {
    video.muted = false;
    video.play().catch(() => {});
  });

  // -------------------------------------------------------- live status

  function setLive(live, info = {}) {
    isLive = live;
    startedAt = live ? new Date(info.startedAt || Date.now()) : null;
    offlineScreen.hidden = live;
    root.querySelectorAll('[data-live-only]').forEach((element) => {
      element.hidden = !live;
    });
    renderUptime();
    if (live) {
      // Give the media server a moment to receive the first video frames.
      setTimeout(startPlayer, 1500);
    } else {
      stopPlayer();
      hideMessage();
      unmuteButton.hidden = true;
    }
  }

  function renderUptime() {
    if (!uptime || !startedAt) return;
    const seconds = Math.max(0, Math.floor((Date.now() - startedAt.getTime()) / 1000));
    const hours = Math.floor(seconds / 3600);
    const minutes = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
    const rest = String(seconds % 60).padStart(2, '0');
    uptime.textContent = `${hours}:${minutes}:${rest}`;
  }

  function renderInfo(info) {
    const title = root.querySelector('[data-stream-title]');
    if (title && typeof info.title === 'string') title.textContent = info.title || 'No stream title yet';
    const category = root.querySelector('[data-stream-category]');
    if (category && info.categoryName) category.textContent = info.categoryName;
  }

  function renderViewers(count) {
    root.querySelectorAll('[data-viewers]').forEach((element) => {
      element.textContent = countFormat.format(count);
    });
  }

  setInterval(renderUptime, 1000);
  renderUptime();
  if (isLive) startPlayer();

  // --------------------------------------------------------------- chat

  function appendToChat(item) {
    const nearBottom = messages.scrollHeight - messages.scrollTop - messages.clientHeight < 60;
    messages.append(item);
    while (messages.children.length > MAX_CHAT_ITEMS) messages.firstElementChild.remove();
    if (nearBottom) messages.scrollTop = messages.scrollHeight;
  }

  function addMessage(message) {
    const item = document.createElement('li');
    item.className = 'chat__message';
    if (message.author.isCreator) {
      const badge = document.createElement('span');
      badge.className = 'chat__badge';
      badge.textContent = 'Creator';
      item.append(badge);
    }
    // textContent (never innerHTML) keeps messages from injecting HTML.
    const author = document.createElement('a');
    author.className = 'chat__author';
    author.href = `/${message.author.username}`;
    author.textContent = message.author.displayName;
    author.style.setProperty('--name-color', message.author.color);
    const text = document.createElement('span');
    text.className = 'chat__text';
    text.textContent = message.text;
    item.append(author, ': ', text);
    appendToChat(item);
  }

  function addNotice(text) {
    const item = document.createElement('li');
    item.className = 'chat__notice';
    item.textContent = text;
    appendToChat(item);
  }

  if (typeof window.io !== 'function') {
    addNotice('Chat could not load. Refresh the page to try again.');
    return;
  }

  const socket = window.io({ auth: { channel } });

  socket.on('stream:state', (state) => {
    renderInfo(state);
    if (state.isLive !== isLive) setLive(state.isLive, state);
  });
  socket.on('stream:live', (info) => {
    renderInfo(info);
    if (!isLive) setLive(true, info);
    else if (!player) startPlayer();
  });
  socket.on('stream:offline', () => setLive(false));
  socket.on('stream:info', renderInfo);
  socket.on('viewers', renderViewers);
  socket.on('chat:message', addMessage);
  socket.on('disconnect', () => addNotice('Connection lost. Reconnecting...'));
  socket.io.on('reconnect', () => addNotice('Reconnected.'));

  chatForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    const input = chatForm.elements.message;
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    socket.timeout(5000).emit('chat:send', text, (error, response) => {
      const problem = error ? 'Message not sent. Check your connection.' : !response.ok && response.error;
      if (!problem) return;
      addNotice(problem);
      if (!input.value) input.value = text;
    });
  });

  // ------------------------------------------------------------- follow

  followForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = followForm.querySelector('button');
    const following = followForm.dataset.following === 'true';
    button.disabled = true;
    try {
      const response = await fetch(`/${channel}/${following ? 'unfollow' : 'follow'}`, {
        method: 'POST',
        headers: { Accept: 'application/json' },
      });
      if (response.status === 401) {
        window.location.href = `/login?next=/${channel}`;
        return;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const state = await response.json();
      renderFollow(state.following, state.followerCount);
    } catch {
      addNotice('Could not update your follow. Please try again.');
    } finally {
      button.disabled = false;
    }
  });

  function renderFollow(following, followerCount) {
    const button = followForm.querySelector('button');
    followForm.dataset.following = String(following);
    followForm.action = `/${channel}/${following ? 'unfollow' : 'follow'}`;
    button.textContent = following ? 'Following' : 'Follow';
    button.classList.toggle('btn--primary', !following);
    button.classList.toggle('btn--secondary', following);
    const count = root.querySelector('[data-follower-count]');
    if (count) count.textContent = countFormat.format(followerCount);
    const label = root.querySelector('[data-follower-label]');
    if (label) label.textContent = followerCount === 1 ? 'follower' : 'followers';
  }
})();
