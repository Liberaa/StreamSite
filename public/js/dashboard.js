// Creator dashboard: stream key helpers, color preview and live status.
(() => {
  for (const button of document.querySelectorAll('[data-reveal]')) {
    const input = document.getElementById(button.dataset.reveal);
    button.addEventListener('click', () => {
      const reveal = input.type === 'password';
      input.type = reveal ? 'text' : 'password';
      button.textContent = reveal ? 'Hide' : 'Show';
    });
  }

  for (const button of document.querySelectorAll('[data-copy]')) {
    const input = document.getElementById(button.dataset.copy);
    button.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(input.value);
        showButtonLabel(button, 'Copied!');
      } catch {
        input.type = 'text';
        input.select();
        showButtonLabel(button, 'Press Ctrl+C');
      }
    });
  }

  function showButtonLabel(button, text) {
    button.dataset.label ??= button.textContent;
    button.textContent = text;
    clearTimeout(button.labelTimer);
    button.labelTimer = setTimeout(() => {
      button.textContent = button.dataset.label;
    }, 1500);
  }

  for (const form of document.querySelectorAll('form[data-confirm]')) {
    form.addEventListener('submit', (event) => {
      if (!window.confirm(form.dataset.confirm)) event.preventDefault();
    });
  }

  // Preview the channel color before saving.
  const dashboard = document.querySelector('.dashboard');
  const accentInput = document.getElementById('accentColor');
  accentInput?.addEventListener('input', () => {
    dashboard?.style.setProperty('--accent', accentInput.value);
    dashboard?.style.setProperty('--on-accent', textColorFor(accentInput.value));
  });

  // Same rule as onAccent() on the server: dark text on light colors.
  function textColorFor(hex) {
    const [r, g, b] = [1, 3, 5].map((start) => {
      const channel = parseInt(hex.slice(start, start + 2), 16) / 255;
      return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.22 ? '#0e0e12' : '#ffffff';
  }

  // Live status flips to "Live" the moment OBS connects.
  const status = document.querySelector('[data-dashboard-status]');
  if (!status || typeof window.io !== 'function') return;

  const pill = status.querySelector('[data-status-pill]');
  const text = status.querySelector('[data-status-text]');
  const viewers = status.querySelector('[data-viewers]');

  function renderStatus(live) {
    status.dataset.live = String(live);
    pill.textContent = live ? 'Live' : 'Offline';
    text.textContent = live
      ? 'You are live. Viewers can watch you right now.'
      : 'You are offline. Go live with your camera, OBS or a phone app.';
  }

  const socket = window.io({ auth: { channel: status.dataset.channel, mode: 'status' } });
  socket.on('stream:state', (state) => renderStatus(state.isLive));
  socket.on('stream:live', () => renderStatus(true));
  socket.on('stream:offline', () => renderStatus(false));
  socket.on('viewers', (count) => {
    viewers.textContent = count;
  });
})();
