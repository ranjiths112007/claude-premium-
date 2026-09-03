import './style.css';

const STORAGE_KEY = 'claude-premium-chats';
const MODEL_KEY = 'claude-premium-model';

const state = {
  chats: loadChats(),
  activeChatId: null,
  model: localStorage.getItem(MODEL_KEY) || 'auto/best-coding',
  sending: false,
  controller: null,
  stopRequested: false
};

const root = document.querySelector('#root');

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function loadChats() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.chats));
  localStorage.setItem(MODEL_KEY, state.model);
}

function currentChat() {
  return state.chats.find((chat) => chat.id === state.activeChatId) || null;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function inlineMarkdown(text) {
  let html = escapeHtml(text);
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  return html;
}

function markdownToHtml(text) {
  const lines = String(text).split('\n');
  const out = [];
  let inCode = false;
  let code = [];
  let codeLang = '';

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.startsWith('```')) {
      if (!inCode) {
        inCode = true;
        code = [];
        codeLang = line.slice(3).trim();
      } else {
        const lang = codeLang ? `<span class="code-lang">${escapeHtml(codeLang)}</span>` : '';
        out.push(`<pre>${lang}<code>${escapeHtml(code.join('\n'))}</code><button class="copy-code" type="button">Copy</button></pre>`);
        inCode = false;
      }
      continue;
    }
    if (inCode) {
      code.push(raw);
      continue;
    }
    if (/^###\s/.test(line)) out.push(`<h3>${inlineMarkdown(line.replace(/^###\s/, ''))}</h3>`);
    else if (/^##\s/.test(line)) out.push(`<h2>${inlineMarkdown(line.replace(/^##\s/, ''))}</h2>`);
    else if (/^#\s/.test(line)) out.push(`<h1>${inlineMarkdown(line.replace(/^#\s/, ''))}</h1>`);
    else if (/^-\s/.test(line)) out.push(`<li>${inlineMarkdown(line.replace(/^-\s/, ''))}</li>`);
    else if (/^\d+\.\s/.test(line)) out.push(`<li>${inlineMarkdown(line.replace(/^\d+\.\s/, ''))}</li>`);
    else if (!line.trim()) out.push('<div class="md-gap"></div>');
    else out.push(`<p>${inlineMarkdown(line)}</p>`);
  }
  return out.join('');
}

function render() {
  const chat = currentChat();
  root.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand-row">
          <div class="brand-mark">C</div>
          <div class="brand-name">Claude <span>Premium</span></div>
        </div>

        <button class="new-chat" id="new-chat" type="button"><span>＋</span> New chat</button>

        <div class="sidebar-label">Chats</div>
        <div class="chat-list" id="chat-list">
          ${state.chats.length ? state.chats.map((item) => `
            <button class="chat-item ${item.id === state.activeChatId ? 'active' : ''}" data-chat-id="${item.id}" type="button">
              <span>${escapeHtml(item.title || 'New conversation')}</span>
              <span class="chat-delete" data-delete-id="${item.id}" title="Delete">×</span>
            </button>
          `).join('') : '<div class="empty-sidebar">Your conversations<br>will appear here.</div>'}
        </div>

        <div class="sidebar-footer">
          <div class="status-dot"><span></span> Local API</div>
          <button id="settings" class="settings-btn" type="button">⚙ Settings</button>
        </div>
      </aside>

      <main class="main-panel">
        <header class="topbar">
          <div class="model-wrap">
            <button id="model-button" class="model-button" type="button">
              <span class="model-symbol">✦</span>
              <span id="model-name">${escapeHtml(state.model)}</span>
              <span class="chevron">⌄</span>
            </button>
            <div id="model-menu" class="model-menu hidden">
              <button data-model="auto/best-coding" type="button">auto/best-coding</button>
            </div>
          </div>
          <div class="top-actions">
            <button id="clear-chat" class="icon-btn" title="Clear conversation" type="button">⌫</button>
            <button id="theme-btn" class="icon-btn" title="Toggle theme" type="button">◐</button>
          </div>
        </header>

        <section class="conversation" id="conversation">
          ${chat ? chat.messages.map(renderMessage).join('') : welcomeMarkup()}
        </section>

        <form class="composer" id="composer">
          <textarea id="prompt" rows="1" placeholder="Message Claude…" ${state.sending ? 'disabled' : ''}></textarea>
          <div class="composer-bottom">
            <div class="composer-tools">
              <button class="tool-btn" type="button" title="Attach">＋</button>
              <span class="hint">Enter to send · Shift+Enter for newline</span>
            </div>
            <button id="send-btn" class="send-btn" type="submit" ${state.sending ? 'disabled' : ''}>
              ${state.sending ? 'Stop' : '↑'}
            </button>
          </div>
        </form>
      </main>
    </div>

    <div id="toast" class="toast hidden"></div>
  `;

  bindEvents();
}

function welcomeMarkup() {
  return `
    <div class="welcome">
      <div class="welcome-mark">✦</div>
      <h1>How can I help you today?</h1>
      <p>Ask anything, write code, debug a project, or explore an idea.</p>
      <div class="prompt-grid">
        <button class="suggestion" data-prompt="Explain this code to me step by step."><strong>Explain code</strong><span>Understand an unfamiliar codebase</span></button>
        <button class="suggestion" data-prompt="Help me build a production-ready web application."><strong>Build something</strong><span>Turn an idea into working software</span></button>
        <button class="suggestion" data-prompt="Find and fix the bug in this code."><strong>Debug</strong><span>Track down a tricky issue</span></button>
        <button class="suggestion" data-prompt="Give me a practical plan to learn AI engineering."><strong>Make a plan</strong><span>Create a clear next-step roadmap</span></button>
      </div>
    </div>
  `;
}

function renderMessage(message) {
  const isUser = message.role === 'user';
  return `
    <article class="message ${isUser ? 'user-message' : 'assistant-message'}" data-message-id="${message.id}">
      <div class="avatar">${isUser ? 'R' : '✦'}</div>
      <div class="message-body">
        <div class="message-label">${isUser ? 'You' : 'Claude'}</div>
        <div class="message-content">${isUser ? `<p>${escapeHtml(message.content)}</p>` : markdownToHtml(message.content)}</div>
      </div>
    </article>
  `;
}

function showToast(message) {
  const toast = document.querySelector('#toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 2800);
}

function autoSize(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
}

function ensureChat() {
  if (currentChat()) return currentChat();
  const chat = { id: uid(), title: 'New conversation', messages: [], createdAt: Date.now() };
  state.chats.unshift(chat);
  state.activeChatId = chat.id;
  persist();
  return chat;
}

function bindEvents() {
  document.querySelector('#new-chat')?.addEventListener('click', () => {
    state.activeChatId = null;
    state.sending = false;
    render();
  });

  document.querySelector('#chat-list')?.addEventListener('click', (event) => {
    const deleteId = event.target.closest('[data-delete-id]')?.dataset.deleteId;
    if (deleteId) {
      event.stopPropagation();
      state.chats = state.chats.filter((chat) => chat.id !== deleteId);
      if (state.activeChatId === deleteId) state.activeChatId = null;
      persist();
      render();
      return;
    }
    const chatButton = event.target.closest('[data-chat-id]');
    if (chatButton) {
      state.activeChatId = chatButton.dataset.chatId;
      render();
    }
  });

  document.querySelectorAll('.suggestion').forEach((button) => {
    button.addEventListener('click', () => {
      const prompt = document.querySelector('#prompt');
      prompt.value = button.dataset.prompt;
      prompt.focus();
      autoSize(prompt);
    });
  });

  document.querySelector('#prompt')?.addEventListener('input', (event) => autoSize(event.target));

  document.querySelector('#prompt')?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (!state.sending) document.querySelector('#composer')?.requestSubmit();
    }
  });

  document.querySelector('#composer')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (state.sending) {
      state.stopRequested = true;
      state.controller?.abort();
      return;
    }
    const prompt = document.querySelector('#prompt').value.trim();
    if (!prompt) return;
    await sendMessage(prompt);
  });

  document.querySelector('#clear-chat')?.addEventListener('click', () => {
    const chat = currentChat();
    if (!chat || chat.messages.length === 0) return;
    chat.messages = [];
    persist();
    render();
  });

  document.querySelector('#model-button')?.addEventListener('click', () => {
    document.querySelector('#model-menu')?.classList.toggle('hidden');
  });

  document.querySelectorAll('[data-model]').forEach((item) => {
    item.addEventListener('click', () => {
      state.model = item.dataset.model;
      persist();
      render();
    });
  });

  document.querySelector('#theme-btn')?.addEventListener('click', () => {
    document.documentElement.classList.toggle('dark');
    localStorage.setItem('claude-theme', document.documentElement.classList.contains('dark') ? 'dark' : 'light');
  });

  document.querySelector('#settings')?.addEventListener('click', async () => {
    try {
      const response = await fetch('/api/health');
      const health = await response.json();
      showToast(health.ok ? `Connected · ${health.model}` : 'Local API unavailable');
    } catch {
      showToast('Cannot reach the local backend');
    }
  });

  document.querySelectorAll('.copy-code').forEach((button) => {
    button.addEventListener('click', async () => {
      const code = button.parentElement.querySelector('code')?.textContent || '';
      try {
        await navigator.clipboard.writeText(code);
        button.textContent = 'Copied';
        setTimeout(() => (button.textContent = 'Copy'), 1200);
      } catch {
        showToast('Clipboard access failed');
      }
    });
  });
}

async function sendMessage(promptText) {
  const chat = ensureChat();
  const userMessage = { id: uid(), role: 'user', content: promptText };
  chat.messages.push(userMessage);
  chat.title = chat.title === 'New conversation' ? promptText.slice(0, 42) + (promptText.length > 42 ? '…' : '') : chat.title;
  persist();

  state.sending = true;
  state.stopRequested = false;
  state.controller = new AbortController();
  render();
  scrollConversationToBottom();

  const assistantMessage = { id: uid(), role: 'assistant', content: '' };
  chat.messages.push(assistantMessage);
  persist();

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: state.controller.signal,
      body: JSON.stringify({
        model: state.model,
        messages: chat.messages.filter((message) => message !== assistantMessage).map(({ role, content }) => ({ role, content })),
      })
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.details || payload.error || `Request failed (${response.status})`);
    }
    if (!response.body) throw new Error('The server did not return a response stream.');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const packets = buffer.split('\n\n');
      buffer = packets.pop() || '';
      for (const packet of packets) consumeSsePacket(packet, assistantMessage);
      if (state.stopRequested) break;
    }
    if (buffer) consumeSsePacket(buffer, assistantMessage);
    if (!assistantMessage.content.trim() && state.stopRequested) assistantMessage.content = 'Generation stopped.';
    if (!assistantMessage.content.trim()) assistantMessage.content = 'No response was returned by the model.';
    persist();
  } catch (error) {
    if (error.name !== 'AbortError') {
      assistantMessage.content = `**Error:** ${error.message}`;
      persist();
      showToast('Model request failed');
    }
  } finally {
    state.sending = false;
    state.controller = null;
    state.stopRequested = false;
    persist();
    render();
    requestAnimationFrame(scrollConversationToBottom);
  }
}

function consumeSsePacket(packet, assistantMessage) {
  const lines = packet.split('\n');
  for (const line of lines) {
    if (!line.startsWith('data:')) continue;
    const data = line.slice(5).trim();
    if (!data || data === '[DONE]') continue;
    try {
      const payload = JSON.parse(data);
      if (payload.error) {
        assistantMessage.content += `\n\n**Error:** ${payload.error}`;
        continue;
      }
      const delta = payload.choices?.[0]?.delta?.content;
      if (typeof delta === 'string') {
        assistantMessage.content += delta;
        updateStreamingMessage(assistantMessage);
      }
    } catch {
      // Ignore malformed SSE frames and continue consuming the stream.
    }
  }
}

function updateStreamingMessage(assistantMessage) {
  const body = document.querySelector(`[data-message-id="${assistantMessage.id}"] .message-content`);
  if (body) body.innerHTML = markdownToHtml(assistantMessage.content) || '<span class="typing-cursor"></span>';
  scrollConversationToBottom();
}

function scrollConversationToBottom() {
  const conversation = document.querySelector('#conversation');
  if (conversation) conversation.scrollTop = conversation.scrollHeight;
}

if (localStorage.getItem('claude-theme') === 'dark') document.documentElement.classList.add('dark');
render();
