// ── Config ────────────────────────────────────────────────
const QUERY_URL = 'https://igs25i6ckmcwmczysu5dhahdze0kulpa.lambda-url.us-east-1.on.aws/'; // TODO: Replace with your actual Lambda URL

let CONFIG = {
  model: localStorage.getItem('cfg_model') || 'anthropic.claude-3-haiku-20240307-v1:0',
};

let isThinking = false;

// ── Init ──────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  // Configuration loaded
});

// ── Settings ──────────────────────────────────────────────
function openSettings() {
  document.getElementById('cfg-model').value = CONFIG.model;
  document.getElementById('settings-modal').classList.add('open');
}

function closeSettings() {
  document.getElementById('settings-modal').classList.remove('open');
}

function saveSettings() {
  CONFIG.model = document.getElementById('cfg-model').value.trim();
  localStorage.setItem('cfg_model', CONFIG.model);
  document.getElementById('model-badge').textContent = CONFIG.model.split('.').pop().split('-v')[0];
  closeSettings();
  showToast('success', '✓ Configuration saved');
}

// Close modal on overlay click
document.getElementById('settings-modal').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeSettings();
});

// ── Chat ──────────────────────────────────────────────────
function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

function handleKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}

function sendChip(el) {
  document.getElementById('chat-input').value = el.textContent;
  sendMessage();
}

async function sendMessage() {
  const input = document.getElementById('chat-input');
  const query = input.value.trim();
  if (!query || isThinking) return;

  // Hide welcome
  const welcome = document.getElementById('welcome-screen');
  if (welcome) welcome.remove();

  input.value = '';
  input.style.height = 'auto';
  isThinking = true;
  document.getElementById('send-btn').disabled = true;

  // Render user message
  appendMessage('user', query, []);

  // Render thinking indicator
  const thinkingId = 'thinking_' + Date.now();
  appendThinking(thinkingId);
  scrollChat();

  try {
    const resp = await fetch(QUERY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        model: CONFIG.model,
      }),
    });

    removeThinking(thinkingId);

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Lambda returned ${resp.status}: ${errText}`);
    }

    const data = await resp.json();

    // Expected response shape:
    // { answer: "...", citations: [{ source_file: "...", page_number: 2, section_title: "..." }] }
    const answer    = data.answer    || data.response || data.text || 'No response received.';
    const citations = data.citations || data.sources  || [];

    appendMessage('assistant', answer, citations);

  } catch (err) {
    console.error(err);
    removeThinking(thinkingId);
    appendError(err.message);
  } finally {
    isThinking = false;
    document.getElementById('send-btn').disabled = false;
    scrollChat();
  }
}

function appendMessage(role, text, citations) {
  const area = document.getElementById('chat-area');
  const el   = document.createElement('div');
  el.className = `msg ${role}`;

  const avatar = role === 'user'
    ? '<div class="msg-avatar">A</div>'
    : '<div class="msg-avatar">⚡</div>';

  // Format text: simple paragraph split
  const formatted = text.split('\n\n')
    .map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`)
    .join('');

  // Citations HTML
  let citationsHtml = '';
  if (citations && citations.length > 0) {
    const cards = citations.map(c => `
      <div class="citation-card">
        <span class="cite-icon">📄</span>
        <span>
          <div class="cite-file">${c.source_file || c.document || c.file || 'Unknown document'}</div>
          ${c.section_title ? `<div style="font-size:11px;color:var(--text-soft);margin-top:1px">${c.section_title}</div>` : ''}
        </span>
        ${c.page_number != null ? `<span class="cite-page">Page ${c.page_number}</span>` : ''}
      </div>
    `).join('');
    citationsHtml = `
      <div class="citations">
        <div class="citation-label">📎 Sources</div>
        ${cards}
      </div>`;
  }

  el.innerHTML = `
    ${avatar}
    <div class="msg-body">
      <div class="msg-bubble">${formatted}${citationsHtml}</div>
    </div>
  `;

  area.appendChild(el);
}

function appendThinking(id) {
  const area = document.getElementById('chat-area');
  const el   = document.createElement('div');
  el.className = 'msg assistant';
  el.id = id;
  el.innerHTML = `
    <div class="msg-avatar">⚡</div>
    <div class="msg-body">
      <div class="typing">
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
      </div>
    </div>
  `;
  area.appendChild(el);
}

function removeThinking(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

function appendError(msg) {
  const area = document.getElementById('chat-area');
  const el   = document.createElement('div');
  el.className = 'msg assistant';
  el.innerHTML = `
    <div class="msg-avatar">⚡</div>
    <div class="msg-body">
      <div class="msg-error">⚠ ${msg || 'Something went wrong. Please try again.'}</div>
    </div>
  `;
  area.appendChild(el);
}

function scrollChat() {
  const area = document.getElementById('chat-area');
  area.scrollTop = area.scrollHeight;
}

// ── Toast ─────────────────────────────────────────────────
function showToast(type, message) {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => {
    el.style.animation = 'toastOut 0.3s ease forwards';
    setTimeout(() => el.remove(), 300);
  }, 3500);
}
