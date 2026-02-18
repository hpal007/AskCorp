// ── Config ────────────────────────────────────────────────
let CONFIG = {
  queryUrl:   localStorage.getItem('cfg_queryUrl')   || '',
  presignUrl: localStorage.getItem('cfg_presignUrl') || '',
  model:      localStorage.getItem('cfg_model')      || 'anthropic.claude-3-haiku-20240307-v1:0',
};

let documents = JSON.parse(localStorage.getItem('askcorp_docs') || '[]');
let isThinking = false;

// ── Init ──────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  renderDocs();
  if (!CONFIG.queryUrl || !CONFIG.presignUrl) {
    setTimeout(() => showToast('info', '⚙ Configure your Lambda endpoints via the settings button.'), 800);
  }
});

// ── Settings ──────────────────────────────────────────────
function openSettings() {
  document.getElementById('cfg-query-url').value  = CONFIG.queryUrl;
  document.getElementById('cfg-presign-url').value = CONFIG.presignUrl;
  document.getElementById('cfg-model').value       = CONFIG.model;
  document.getElementById('settings-modal').classList.add('open');
}

function closeSettings() {
  document.getElementById('settings-modal').classList.remove('open');
}

function saveSettings() {
  CONFIG.queryUrl   = document.getElementById('cfg-query-url').value.trim();
  CONFIG.presignUrl = document.getElementById('cfg-presign-url').value.trim();
  CONFIG.model      = document.getElementById('cfg-model').value.trim();
  localStorage.setItem('cfg_queryUrl',   CONFIG.queryUrl);
  localStorage.setItem('cfg_presignUrl', CONFIG.presignUrl);
  localStorage.setItem('cfg_model',      CONFIG.model);
  document.getElementById('model-badge').textContent = CONFIG.model.split('.').pop().split('-v')[0];
  closeSettings();
  showToast('success', '✓ Configuration saved');
}

// Close modal on overlay click
document.getElementById('settings-modal').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeSettings();
});

// ── Upload ────────────────────────────────────────────────
const dropZone  = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');

fileInput.addEventListener('change', e => handleFiles(e.target.files));

dropZone.addEventListener('dragover', e => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  handleFiles(e.dataTransfer.files);
});

async function handleFiles(files) {
  const pdfs = Array.from(files).filter(f => f.type === 'application/pdf');
  if (!pdfs.length) { showToast('error', '✕ Only PDF files are supported'); return; }
  if (!CONFIG.presignUrl) {
    showToast('error', '✕ Set the Presigned URL endpoint in Settings first');
    openSettings();
    return;
  }
  for (const file of pdfs) await uploadFile(file);
  fileInput.value = '';
}

async function uploadFile(file) {
  const progressEl = document.getElementById('upload-progress');
  const fillEl     = document.getElementById('progress-fill');
  const labelEl    = document.getElementById('progress-label');

  progressEl.style.display = 'block';
  fillEl.style.width = '5%';
  labelEl.textContent = `Uploading ${file.name}…`;

  // Add to doc list as "uploading"
  const docId = `doc_${Date.now()}`;
  addDoc({ id: docId, name: file.name, status: 'uploading' });

  try {
    // Step 1: Get presigned URL
    labelEl.textContent = 'Getting upload URL…';
    fillEl.style.width = '20%';

    const presignResp = await fetch(CONFIG.presignUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: file.name, content_type: 'application/pdf' }),
    });

    if (!presignResp.ok) throw new Error(`Presign failed: ${presignResp.status}`);
    const { url: presignedUrl } = await presignResp.json();

    // Step 2: PUT to S3
    labelEl.textContent = 'Uploading to S3…';
    fillEl.style.width = '55%';

    const s3Resp = await fetch(presignedUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/pdf' },
      body: file,
    });

    if (!s3Resp.ok) throw new Error(`S3 upload failed: ${s3Resp.status}`);

    fillEl.style.width = '90%';
    labelEl.textContent = 'Processing & indexing…';

    // Update doc status to "processing" (Lambda 1 will handle it async)
    updateDocStatus(docId, 'processing');
    fillEl.style.width = '100%';

    showToast('success', `✓ ${file.name} uploaded — indexing in progress`);

    // After ~5s mark as indexed (in real app you'd poll a status endpoint)
    setTimeout(() => updateDocStatus(docId, 'indexed'), 5000);

  } catch (err) {
    console.error(err);
    updateDocStatus(docId, 'error');
    showToast('error', `✕ Failed to upload ${file.name}`);
  } finally {
    setTimeout(() => {
      progressEl.style.display = 'none';
      fillEl.style.width = '0%';
    }, 800);
  }
}

// ── Documents ─────────────────────────────────────────────
function addDoc(doc) {
  documents.push(doc);
  saveDocs();
  renderDocs();
}

function updateDocStatus(id, status) {
  const doc = documents.find(d => d.id === id);
  if (doc) { doc.status = status; saveDocs(); renderDocs(); }
}

function saveDocs() {
  localStorage.setItem('askcorp_docs', JSON.stringify(documents));
}

function renderDocs() {
  const list   = document.getElementById('docs-list');
  const empty  = document.getElementById('docs-empty');
  const badge  = document.getElementById('docs-badge');
  const hint   = document.getElementById('input-doc-hint');

  const indexed = documents.filter(d => d.status === 'indexed').length;
  badge.textContent = `${indexed} doc${indexed !== 1 ? 's' : ''}`;
  hint.textContent  = `📂 ${indexed} document${indexed !== 1 ? 's' : ''} indexed`;

  // Clear existing doc items
  list.querySelectorAll('.doc-item').forEach(el => el.remove());

  if (documents.length === 0) {
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';

  const statusLabel = {
    uploading:  'Uploading…',
    processing: 'Indexing…',
    indexed:    'Indexed ✓',
    error:      'Upload failed',
  };

  documents.slice().reverse().forEach(doc => {
    const el = document.createElement('div');
    el.className = 'doc-item';
    el.innerHTML = `
      <div class="doc-icon">📄</div>
      <div class="doc-info">
        <div class="doc-name" title="${doc.name}">${doc.name}</div>
        <div class="doc-status ${doc.status}">${statusLabel[doc.status] || doc.status}</div>
      </div>
    `;
    list.insertBefore(el, list.querySelector('.section-title').nextSibling);
  });
}

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

  if (!CONFIG.queryUrl) {
    showToast('error', '✕ Set the Query Lambda URL in Settings first');
    openSettings();
    return;
  }

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
    const resp = await fetch(CONFIG.queryUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        model: CONFIG.model,
        top_k: 5,
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
