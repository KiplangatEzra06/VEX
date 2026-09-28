const chatMessages = document.getElementById('chatMessages');
const messageInput = document.getElementById('messageInput');
const chatForm = document.getElementById('chatForm');
const sendButton = document.getElementById('sendButton');
const resetButton = document.getElementById('resetButton');
const typingIndicator = document.getElementById('typingIndicator');
const jumpButton = document.getElementById('jumpToLatest');
const tagline = document.getElementById('tagline');
const filePicker = document.getElementById('filePicker');
const modal = document.getElementById('appModal');
const modalTitle = document.getElementById('modalTitle');
const modalBody = document.getElementById('modalBody');
const recentList = document.getElementById('recentList');
const voiceButton = document.getElementById('voiceButton');

const TAGLINES = [
    'Personal AI, always on.',
    'Ready when you are.',
    'Online and listening.',
    'At your service.',
    'Dry wit, useful answers.'
];

const STORAGE_KEY = 'vex-conversations';
let activeHistory = [];
let activeConversationId = null;
let isRequestPending = false;
let voiceState = {
    supported: 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window,
    recognition: null,
    listening: false,
    processing: false,
    error: null,
};

function getBubbleText(parts) {
    if (!Array.isArray(parts)) {
        return '';
    }

    return parts.map((part) => part.text || '').join('').trim();
}

function getEntryTimestamp(entry) {
    if (entry?.timestamp) {
        return new Date(entry.timestamp);
    }

    return new Date();
}

function formatTime(dateValue) {
    const date = new Date(dateValue);

    return date.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    });
}

function formatDayLabel(dateValue) {
    const date = new Date(dateValue);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diffDays = Math.round((today - target) / 86400000);

    if (diffDays === 0) {
        return 'Today';
    }

    if (diffDays === 1) {
        return 'Yesterday';
    }

    if (diffDays > 1 && diffDays < 7) {
        return date.toLocaleDateString([], { weekday: 'long' });
    }

    return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

function setRandomTagline() {
    if (!tagline) {
        return;
    }

    const next = TAGLINES[Math.floor(Math.random() * TAGLINES.length)];
    tagline.textContent = next;
}

function setEmptyStateVisible(visible) {
    const emptyState = document.getElementById('emptyState');
    if (emptyState) {
        emptyState.classList.toggle('hidden', !visible);
    }
}

function autoResizeTextarea() {
    if (!messageInput) {
        return;
    }

    messageInput.style.height = 'auto';
    const nextHeight = Math.min(messageInput.scrollHeight, 168);
    messageInput.style.height = `${nextHeight}px`;
}

function isNearBottom() {
    if (!chatMessages) {
        return true;
    }

    const distanceFromBottom = chatMessages.scrollHeight - (chatMessages.scrollTop + chatMessages.clientHeight);
    return distanceFromBottom <= 160;
}

function scrollToBottom() {
    if (!chatMessages) {
        return;
    }

    chatMessages.scrollTo({ top: chatMessages.scrollHeight, behavior: 'smooth' });
}

function updateJumpButtonState() {
    if (!chatMessages || !jumpButton) {
        return;
    }

    const distanceFromBottom = chatMessages.scrollHeight - (chatMessages.scrollTop + chatMessages.clientHeight);
    const shouldShow = distanceFromBottom > 120;
    jumpButton.classList.toggle('hidden', !shouldShow);
}

function addMessage(role, text, timestamp = new Date().toISOString()) {
    if (!chatMessages || !text) {
        return;
    }

    setEmptyStateVisible(false);

    const row = document.createElement('div');
    row.className = `message-row ${role === 'user' ? 'user' : 'vex'}`;

    const group = document.createElement('div');
    group.className = 'message-group';

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    bubble.textContent = text;

    const meta = document.createElement('div');
    meta.className = 'message-meta';
    meta.textContent = formatTime(timestamp);

    group.appendChild(bubble);
    group.appendChild(meta);
    row.appendChild(group);
    chatMessages.appendChild(row);

    requestAnimationFrame(() => {
        row.classList.add('visible');
        if (isNearBottom()) {
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
        updateJumpButtonState();
    });
}

function renderHistory(history) {
    if (!chatMessages) {
        return;
    }

    chatMessages.innerHTML = '';
    setEmptyStateVisible(!Array.isArray(history) || history.length === 0);

    if (!Array.isArray(history) || history.length === 0) {
        return;
    }

    let lastDayLabel = '';

    history.forEach((entry) => {
        const role = entry?.role === 'user' ? 'user' : 'vex';
        const text = getBubbleText(entry?.parts);
        const timestamp = getEntryTimestamp(entry).toISOString();

        if (!text) {
            return;
        }

        const dayLabel = formatDayLabel(timestamp);

        if (dayLabel !== lastDayLabel) {
            const divider = document.createElement('div');
            divider.className = 'day-divider';
            divider.textContent = dayLabel;
            chatMessages.appendChild(divider);
            lastDayLabel = dayLabel;
        }

        addMessage(role, text, timestamp);
    });

    requestAnimationFrame(() => {
        chatMessages.scrollTop = chatMessages.scrollHeight;
        updateJumpButtonState();
    });
}

function setTypingState(isTyping) {
    if (typingIndicator) {
        typingIndicator.classList.toggle('hidden', !isTyping);
    }
    if (sendButton) {
        sendButton.disabled = isTyping;
    }
    if (messageInput) {
        messageInput.disabled = isTyping;
    }
}

function createConversationId() {
    return `conversation-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function makeTitleFromMessage(message) {
    const cleaned = String(message || '').replace(/\s+/g, ' ').trim();
    if (!cleaned) {
        return 'New conversation';
    }

    return cleaned.length > 32 ? `${cleaned.slice(0, 29).trim()}...` : cleaned;
}

function sortConversations(conversations) {
    return [...conversations].sort((a, b) => (new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0)));
}

function writeConversationsToStorage(conversations) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sortConversations(conversations)));
}

function readConversationsFromStorage() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            return [];
        }

        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? sortConversations(parsed) : [];
    } catch (error) {
        console.error('Unable to deserialize conversations:', error);
        return [];
    }
}

function getActiveConversation() {
    return activeHistory.find((conversation) => conversation.id === activeConversationId) || null;
}

function upsertConversationInHistory(conversation) {
    if (!conversation || !conversation.id) {
        return null;
    }

    const normalizedConversation = {
        id: conversation.id,
        title: conversation.title || 'New conversation',
        createdAt: conversation.createdAt || new Date().toISOString(),
        updatedAt: conversation.updatedAt || conversation.createdAt || new Date().toISOString(),
        messages: Array.isArray(conversation.messages)
            ? conversation.messages.map((message) => ({
                id: message?.id || `msg-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
                role: message?.role === 'assistant' ? 'assistant' : 'user',
                content: String(message?.content || ''),
                timestamp: message?.timestamp || new Date().toISOString(),
            }))
            : [],
    };

    const index = activeHistory.findIndex((item) => item.id === normalizedConversation.id);
    if (index >= 0) {
        activeHistory[index] = normalizedConversation;
    } else {
        activeHistory = [normalizedConversation, ...activeHistory];
    }

    activeHistory = sortConversations(activeHistory);
    activeConversationId = normalizedConversation.id;
    persistConversationSet();
    return normalizedConversation;
}

function createEmptyConversation() {
    const now = new Date().toISOString();
    return {
        id: createConversationId(),
        title: 'New conversation',
        createdAt: now,
        updatedAt: now,
        messages: [],
    };
}

function ensureActiveConversation() {
    if (!activeConversationId) {
        const next = createEmptyConversation();
        activeHistory = [next, ...activeHistory];
        activeConversationId = next.id;
        writeConversationsToStorage(activeHistory);
    }

    const current = getActiveConversation();
    if (!current) {
        const created = createEmptyConversation();
        activeHistory = [created, ...activeHistory];
        activeConversationId = created.id;
        writeConversationsToStorage(activeHistory);
    }
}

function updateConversationMessageLists() {
    const activeConversation = getActiveConversation();
    if (activeConversation) {
        renderHistory(activeConversation.messages || []);
    } else {
        renderHistory([]);
    }

    buildRecentList();
}

function buildRecentList() {
    if (!recentList) {
        return;
    }

    const conversations = sortConversations(activeHistory);
    if (!conversations.length) {
        recentList.innerHTML = '<li><span class="chat-dot">◔</span><span>No recent chats yet</span><time>now</time></li>';
        return;
    }

    recentList.innerHTML = conversations.slice(0, 5).map((conversation) => {
        const title = conversation.title || 'Untitled conversation';
        const lastUpdated = new Date(conversation.updatedAt || conversation.createdAt || Date.now());
        const when = lastUpdated.toLocaleDateString([], { month: 'short', day: 'numeric' });
        return `<li data-conversation-id="${conversation.id}"><span class="chat-dot">◔</span><span>${title}</span><time>${when}</time></li>`;
    }).join('');

    recentList.querySelectorAll('li').forEach((item) => {
        item.addEventListener('click', () => {
            const targetId = item.dataset.conversationId;
            if (!targetId) {
                return;
            }

            const nextConversation = activeHistory.find((conversation) => conversation.id === targetId);
            if (!nextConversation) {
                return;
            }

            activeConversationId = nextConversation.id;
            renderHistory(nextConversation.messages || []);
            setEmptyStateVisible(!((nextConversation.messages || []).length > 0));
        });
    });
}

function openModal(title, content) {
    if (!modal || !modalBody || !modalTitle) {
        return;
    }

    modalTitle.textContent = title;
    modalBody.innerHTML = content;
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
}

function closeModal() {
    if (!modal) {
        return;
    }

    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');

    if (messageInput) {
        messageInput.focus();
    }
}

function openHistorySearch() {
    const content = `
        <input id="historySearchInput" class="search-input" type="text" placeholder="Search saved history..." aria-label="Search saved history" />
        <ul class="history-list" id="historyResults"></ul>
    `;

    openModal('History Search', content);

    const searchInput = document.getElementById('historySearchInput');
    const results = document.getElementById('historyResults');

    const renderResults = (query = '') => {
        const normalized = query.trim().toLowerCase();
        const filtered = normalized
            ? activeHistory.filter((conversation) => {
                const haystack = (conversation.title || '') + ' ' + (conversation.messages || []).map((message) => message.content || '').join(' ');
                return haystack.toLowerCase().includes(normalized);
            })
            : activeHistory;

        if (!filtered.length) {
            results.innerHTML = '<li class="action-item">No matching conversation history found.</li>';
            return;
        }

        results.innerHTML = sortConversations(filtered).slice(0, 12).map((conversation) => {
            const preview = conversation.messages?.[0]?.content || conversation.title || 'Conversation';
            return `<li><button type="button" class="history-item" data-conversation-id="${conversation.id}">${String(preview).replace(/\s+/g, ' ').slice(0, 90)}</button></li>`;
        }).join('');

        results.querySelectorAll('.history-item').forEach((button) => {
            button.addEventListener('click', () => {
                const targetId = button.dataset.conversationId;
                if (!targetId) {
                    return;
                }

                const nextConversation = activeHistory.find((conversation) => conversation.id === targetId);
                if (nextConversation) {
                    activeConversationId = targetId;
                    renderHistory(nextConversation.messages || []);
                    closeModal();
                }
            });
        });
    };

    searchInput.addEventListener('input', (event) => renderResults(event.target.value));
    renderResults();
}

function openSettingsPanel() {
    const content = `
        <p class="info-block">Adjust the local experience for VEX. These preferences stay in your browser.</p>
        <div class="settings-list">
            <div class="settings-row">
                <span>Compact mode</span>
                <button type="button" class="toggle active" data-setting="compact" aria-label="Toggle compact mode"></button>
            </div>
            <div class="settings-row">
                <span>Typing glow</span>
                <button type="button" class="toggle active" data-setting="glow" aria-label="Toggle typing glow"></button>
            </div>
            <div class="settings-row">
                <span>Auto-scroll to latest</span>
                <button type="button" class="toggle active" data-setting="autoscroll" aria-label="Toggle auto-scroll"></button>
            </div>
        </div>
        <div class="modal-actions"><button type="button" class="primary-action" id="dismissSettings">Done</button></div>
    `;

    openModal('Settings', content);

    document.querySelectorAll('.toggle').forEach((toggle) => {
        toggle.addEventListener('click', () => {
            toggle.classList.toggle('active');
        });
    });

    const dismissSettings = document.getElementById('dismissSettings');
    if (dismissSettings) {
        dismissSettings.addEventListener('click', closeModal);
    }
}

function openProfileMenu() {
    const content = `
        <p class="info-block">Kiplangat Ezra</p>
        <ul class="action-list">
            <li><button type="button" class="action-item" data-action="profile">View Profile</button></li>
            <li><button type="button" class="action-item" data-action="status">Status: Online</button></li>
            <li><button type="button" class="action-item" data-action="logout">Sign out</button></li>
        </ul>
    `;

    openModal('Profile', content);
    modalBody.querySelectorAll('.action-item').forEach((button) => {
        button.addEventListener('click', () => {
            if (button.dataset.action === 'status') {
                button.textContent = 'Status: Listening';
            }
            closeModal();
        });
    });
}

function showPlaceholderModal(title, message) {
    const content = `<p class="info-block">${message}</p>`;
    openModal(title, content);
}

function persistConversationSet() {
    writeConversationsToStorage(activeHistory);
}

function ensureConversationTitle(conversation, messageText) {
    if (!conversation) {
        return;
    }

    const title = conversation.title || '';
    const isBlankTitle = !title || title === 'New conversation' || title === 'New chat' || title === 'Untitled chat';
    if (isBlankTitle) {
        conversation.title = makeTitleFromMessage(messageText);
        conversation.updatedAt = new Date().toISOString();
        persistConversationSet();
    }
}

async function loadHistory() {
    try {
        const response = await fetch('/api/history');
        const payload = await response.json();

        if (!response.ok) {
            throw new Error(payload.error || 'Failed to load history.');
        }

        const serverHistory = Array.isArray(payload.history) ? payload.history : [];
        const storedHistory = readConversationsFromStorage();
        activeHistory = serverHistory.length ? serverHistory : storedHistory.length ? storedHistory : [];

        if (!activeHistory.length) {
            const newConversation = createEmptyConversation();
            activeHistory = [newConversation];
        }

        const selected = getActiveConversation() || activeHistory[0];
        activeConversationId = selected?.id || activeHistory[0].id;
        renderHistory((getActiveConversation()?.messages || []).slice());
        buildRecentList();
        persistConversationSet();
    } catch (error) {
        console.error('History load error:', error);
        activeHistory = [createEmptyConversation()];
        activeConversationId = activeHistory[0].id;
        persistConversationSet();
        renderHistory([]);
        buildRecentList();
    }
}

async function sendMessage(messageText) {
    if (!messageText || isRequestPending) {
        return;
    }

    ensureActiveConversation();
    const activeConversation = getActiveConversation();
    const now = new Date().toISOString();

    if (activeConversation) {
        activeConversation.messages.push({
            id: `msg-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
            role: 'user',
            content: messageText,
            timestamp: now,
        });
        ensureConversationTitle(activeConversation, messageText);
        activeConversation.updatedAt = now;
        persistConversationSet();
    }

    isRequestPending = true;
    setTypingState(true);

    addMessage('user', messageText, now);
    messageInput.value = '';
    autoResizeTextarea();

    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message: messageText,
                conversationId: activeConversationId,
            }),
        });

        const payload = await response.json();

        if (!response.ok) {
            throw new Error(payload.error || 'Vex failed to respond.');
        }

        const responseTimestamp = new Date().toISOString();
        addMessage('vex', payload.reply, responseTimestamp);

        if (payload.conversationId) {
            activeConversationId = payload.conversationId;
        }

        if (payload.conversation) {
            upsertConversationInHistory(payload.conversation);
        } else if (activeConversation) {
            activeConversation.messages.push({
                id: `msg-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
                role: 'assistant',
                content: payload.reply,
                timestamp: responseTimestamp,
            });
            activeConversation.updatedAt = responseTimestamp;
            persistConversationSet();
        }

        buildRecentList();
    } catch (error) {
        addMessage('vex', error.message || 'Something went wrong.', new Date().toISOString());
    } finally {
        isRequestPending = false;
        setTypingState(false);
        messageInput.focus();
        updateJumpButtonState();
        if (isNearBottom()) {
            scrollToBottom();
        }
    }
}

async function resetConversation() {
    try {
        const currentConversationId = activeConversationId;
        const response = await fetch('/api/reset', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(currentConversationId ? { conversationId: currentConversationId } : {}),
        });
        const payload = await response.json();

        if (!response.ok) {
            throw new Error(payload.error || 'Reset failed.');
        }

        if (currentConversationId) {
            activeHistory = activeHistory.filter((conversation) => conversation.id !== currentConversationId);
        }

        if (!activeHistory.length) {
            const nextConversation = createEmptyConversation();
            activeHistory = [nextConversation];
        }

        activeConversationId = activeHistory[0].id;
        persistConversationSet();
        chatMessages.innerHTML = '';
        setEmptyStateVisible(true);
        buildRecentList();
    } catch (error) {
        console.error('Reset error:', error);
    }
}

function handleComposerSubmit(event) {
    event.preventDefault();

    if (!messageInput || isRequestPending) {
        return;
    }

    const messageText = messageInput.value.trim();
    if (messageText) {
        sendMessage(messageText);
    }
}

function bindActionButtons() {
    document.querySelectorAll('.nav-item').forEach((button) => {
        button.addEventListener('click', () => {
            const action = button.dataset.action;
            const actions = {
                'new-chat': () => {
                    const nextConversation = createEmptyConversation();
                    activeHistory = [nextConversation, ...activeHistory];
                    activeConversationId = nextConversation.id;
                    persistConversationSet();
                    renderHistory([]);
                    setEmptyStateVisible(true);
                    buildRecentList();
                },
                'search-history': openHistorySearch,
                'open-files': () => filePicker?.click(),
                tasks: () => showPlaceholderModal('Tasks', 'Task tracking is not part of this build yet. VEX can manage notes and planning once this interface is connected to a real task backend.'),
                calendar: () => showPlaceholderModal('Calendar', 'Calendar access is not connected in this local build. This panel is intentionally a placeholder until that service is available.'),
                settings: openSettingsPanel,
            };

            if (actions[action]) {
                actions[action]();
            }
        });
    });

    if (voiceButton) {
        voiceButton.addEventListener('click', () => {
            if (!voiceState.supported) {
                voiceState.error = 'Voice input is not supported in this browser.';
                updateVoiceButtonState();
                showPlaceholderModal('Voice input', 'Voice input is not supported in this browser. You can continue typing normally.');
                return;
            }

            if (voiceState.listening) {
                voiceState.recognition?.stop();
                voiceState.listening = false;
                voiceState.processing = false;
                updateVoiceButtonState();
                return;
            }

            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            const recognition = new SpeechRecognition();

            recognition.lang = 'en-US';
            recognition.continuous = false;
            recognition.interimResults = false;

            recognition.onstart = () => {
                voiceState.listening = true;
                voiceState.processing = false;
                voiceState.error = null;
                updateVoiceButtonState();
            };

            recognition.onresult = (event) => {
                const transcript = event.results[0][0].transcript;
                if (messageInput) {
                    messageInput.value = transcript;
                    autoResizeTextarea();
                }
            };

            recognition.onerror = (event) => {
                voiceState.listening = false;
                voiceState.processing = false;
                voiceState.error = event.error || 'Voice input failed.';
                updateVoiceButtonState();
                showPlaceholderModal('Voice input', 'Voice input is unavailable right now. You can continue typing normally.');
            };

            recognition.onend = () => {
                voiceState.listening = false;
                voiceState.processing = false;
                updateVoiceButtonState();
            };

            voiceState.recognition = recognition;
            voiceState.listening = true;
            voiceState.processing = false;
            voiceState.error = null;
            updateVoiceButtonState();
            recognition.start();
        });
    }

    document.querySelectorAll('.quick-actions button').forEach((button) => {
        button.addEventListener('click', () => {
            const prompt = button.textContent.trim();
            if (messageInput) {
                messageInput.value = prompt;
                messageInput.focus();
                autoResizeTextarea();
            }
        });
    });

    document.querySelectorAll('.link-btn').forEach((button) => {
        button.addEventListener('click', openHistorySearch);
    });

    document.querySelectorAll('.recent-list li').forEach((item) => {
        item.addEventListener('click', () => {
            const index = Number(item.dataset.index ?? '');
            if (!Number.isNaN(index)) {
                const start = Math.max(0, index - 2);
                renderHistory(activeHistory.slice(start, index + 1));
            }
        });
    });

    const profileButton = document.getElementById('profileButton');
    if (profileButton) {
        profileButton.addEventListener('click', openProfileMenu);
        profileButton.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                openProfileMenu();
            }
        });
    }

    const viewAllRecentChats = document.getElementById('viewAllRecentChats');
    if (viewAllRecentChats) {
        viewAllRecentChats.addEventListener('click', openHistorySearch);
    }

    const addButton = document.querySelector('.tool-btn[data-action="open-files"]');
    if (addButton && filePicker) {
        addButton.addEventListener('click', () => filePicker.click());
    }

    const placeholderVoiceButton = document.querySelector('.tool-btn[data-action="voice-placeholder"]');
    if (placeholderVoiceButton) {
        placeholderVoiceButton.addEventListener('click', () => showPlaceholderModal('Voice', 'Voice input is not connected in this local build. Use the text composer for now.'));
    }

    if (modal) {
        modal.addEventListener('click', (event) => {
            if (event.target === modal) {
                closeModal();
            }
        });
    }

    const closeModalButton = document.getElementById('closeModal');
    if (closeModalButton) {
        closeModalButton.addEventListener('click', closeModal);
    }

    if (filePicker) {
        filePicker.addEventListener('change', (event) => {
            const [file] = event.target.files || [];
            if (!file) {
                return;
            }

            const name = file.name || 'Selected file';
            showPlaceholderModal('Files', `${name} selected. File upload is enabled locally, but no backend storage is connected yet.`);
            event.target.value = '';
        });
    }
}

function updateVoiceButtonState() {
    if (!voiceButton) {
        return;
    }

    const state = voiceState.error ? 'error' : voiceState.processing ? 'processing' : voiceState.listening ? 'listening' : 'idle';
    voiceButton.dataset.state = state;
    voiceButton.disabled = isRequestPending;
    voiceButton.setAttribute('aria-label', state === 'listening' ? 'Stop voice input' : state === 'processing' ? 'Processing voice input' : state === 'error' ? 'Voice input unavailable' : 'Voice input');
    const icon = voiceButton.querySelector('.voice-icon');
    if (icon) {
        icon.textContent = state === 'listening' ? '◉' : state === 'processing' ? '◌' : state === 'error' ? '⚠' : '◔';
    }
}

if (chatForm && messageInput) {
    chatForm.addEventListener('submit', handleComposerSubmit);

    messageInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            handleComposerSubmit(event);
        }
    });

    messageInput.addEventListener('input', autoResizeTextarea);
}

if (resetButton) {
    resetButton.addEventListener('click', resetConversation);
}

if (chatMessages) {
    chatMessages.addEventListener('scroll', updateJumpButtonState);
}

if (jumpButton) {
    jumpButton.addEventListener('click', () => {
        scrollToBottom();
    });
}

setRandomTagline();
updateVoiceButtonState();
bindActionButtons();
loadHistory();
