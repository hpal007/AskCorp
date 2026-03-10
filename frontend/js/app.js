// ── Config ────────────────────────────────────────────────
// const QUERY_URL = 'https://f2pduhwfgjnb5ynplz26exbmkm0gwgvm.lambda-url.us-east-1.on.aws/'; // TODO: Replace with your actual Lambda URL

const QUERY_URL = 'https://jjhngyc4m9.execute-api.us-east-1.amazonaws.com/ask';

// ── Demo / Test Mode ──────────────────────────────────────
// Set DEMO_MODE = true to bypass the real API and return dummy data.
// Flip back to false before deploying to production.
const DEMO_MODE = false;

const DUMMY_RESPONSE = {
  answer: "The Health Insurance Reserves Model Regulation is a set of standards established by the National Association of Insurance Commissioners (NAIC) that provide minimum requirements for health insurance reserves. The regulation covers three main categories of reserves:\n\n1. Claim Reserves - Reserves for incurred but unpaid claims on health insurance policies.\n2. Premium Reserves - Reserves for unearned premiums.\n3. Contract Reserves - Reserves for future benefits on policies where the future benefits exceed the future premiums.\nThe regulation specifies requirements for the interest rates, mortality tables, and other assumptions to be used in calculating these reserves.",
  citations: [
    {
      source_file: "model-law-10.pdf",
      page_number: null,
      s3_uri: "https://askcorp-raw-document.s3.amazonaws.com/model-law-10.pdf"
    },
    {
      source_file: "model-law-10.pdf",
      page_number: null,
      s3_uri: "https://askcorp-raw-document.s3.amazonaws.com/model-law-10.pdf"
    }
  ]
};

let CONFIG = {
  model: localStorage.getItem('cfg_model') || 'google.gemma-3-12b-it',
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
    let data;

    if (DEMO_MODE) {
      // ── Demo mode: return dummy data after a short simulated delay ──
      await new Promise(resolve => setTimeout(resolve, 800));
      removeThinking(thinkingId);
      data = DUMMY_RESPONSE;
      console.log("[DEMO MODE] Returning dummy response:", data);
    } else {
      const resp = await fetch(QUERY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: query }),
      });

      removeThinking(thinkingId);

      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`Lambda returned ${resp.status}: ${errText}`);
      }

      data = await resp.json();
      console.log("Lambda response:", data);
      console.log("Citations:", data.citations);
    }

    // Expected response shape:
    // { answer: "...", citations: [{ source_file: "...", page_number: 2, s3_uri: "..." }] }
    const answer = data.answer || data.response || data.text || 'No response received.';
    const citations = data.citations || data.sources || [];

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
  const el = document.createElement('div');
  el.className = `msg ${role}`;

  const avatar = role === 'user'
    ? '<div class="msg-avatar">A</div>'
    : '<div class="msg-avatar">⚡</div>';

  // Format answer text and enable citation markers [1]
  const formatted = text
    .replace(/\n\n/g, '</p><p>')
    .replace(/\[(\d+)\]/g, '<sup class="cite-ref">[$1]</sup>');

  const answerHtml = `<p>${formatted}</p>`;

  let citationsHtml = '';

  if (citations && citations.length > 0) {

    const cards = citations.map((c, i) => {

      const number = i + 1;
      const fileName = c.source_file || 'Unknown document';
      const url = c.s3_uri || '';
      // const url = c.s3_uri || c.s3_url || c.url || c.location || '';
      const page = c.page_number;

      return `
        <div class="citation-card" id="citation-${number}">
          <span class="cite-icon">[${number}]</span>

          <span class="cite-content">
            <div class="cite-file">${fileName}</div>

            ${url ? `
              <div class="cite-link">
                <a href="${url}" target="_blank" rel="noopener noreferrer">
                  Open document
                </a>
              </div>
            ` : ''}
          </span>

          ${page ? `<span class="cite-page">Page ${page}</span>` : ''}

        </div>
      `;

    }).join('');

    citationsHtml = `
      <div class="citations">
        <div class="citation-label">📎 Sources</div>
        ${cards}
      </div>
    `;
  }

  el.innerHTML = `
    ${avatar}
    <div class="msg-body">
      <div class="msg-bubble">
        ${answerHtml}
        ${citationsHtml}
      </div>
    </div>
  `;

  area.appendChild(el);
}

function appendThinking(id) {
  const area = document.getElementById('chat-area');
  const el = document.createElement('div');
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
  const el = document.createElement('div');
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
