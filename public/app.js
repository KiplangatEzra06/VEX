const chatMessages = document.getElementById('chatMessages');
const messageInput = document.getElementById('messageInput');
const chatForm = document.getElementById('chatForm');
const sendButton = document.getElementById('sendButton');
const stopButton = document.getElementById('stopButton');
const composerStatus = document.getElementById('composerStatus');
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
const drawerScrim = document.getElementById('drawerScrim');
const openNavDrawerButton = document.getElementById('openNavDrawer');
const openRecentDrawerButton = document.getElementById('openRecentDrawer');

const STORAGE_KEY = 'vex-conversations';
let activeHistory = [];
let activeConversationId = null;
let isRequestPending = false;
let requestController = null;
let modalReturnFocus = null;
let drawerReturnFocus = null;
let voiceState = {
    supported: 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window,
    speechSupported: 'speechSynthesis' in window,
    recognition: null,
    listening: false,
    processing: false,
    speaking: false,
    processingTimer: null,
    lastTranscript: '',
    speakNextResponse: false,
    error: null,
};

function getBubbleText(entry) {
    if (typeof entry === 'string') {
        return entry.trim();
    }

    if (typeof entry?.content === 'string') {
        return entry.content.trim();
    }

    if (typeof entry?.text === 'string') {
        return entry.text.trim();
    }

    const parts = Array.isArray(entry) ? entry : entry?.parts;
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

    tagline.textContent = 'VEX';
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

function updateSendButtonState() {
    if (sendButton) {
        sendButton.disabled = isRequestPending || !messageInput?.value.trim();
    }
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

    const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
    chatMessages.scrollTo({ top: chatMessages.scrollHeight, behavior });
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

    const author = document.createElement('span');
    author.className = 'message-author';
    author.textContent = role === 'user' ? 'You' : 'VEX';

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    bubble.textContent = text;

    const meta = document.createElement('div');
    meta.className = 'message-meta';
    meta.textContent = formatTime(timestamp);

    group.appendChild(author);
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
        const text = getBubbleText(entry);
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
        sendButton.classList.toggle('hidden', isTyping);
    }
    if (stopButton) {
        stopButton.classList.toggle('hidden', !isTyping);
    }
    if (chatForm) {
        chatForm.setAttribute('aria-busy', String(isTyping));
    }
    if (composerStatus) {
        composerStatus.textContent = isTyping ? 'VEX is thinking...' : 'VEX can make mistakes. Check important details.';
    }
    updateSendButtonState();
    updateVoiceButtonState();
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
        recentList.replaceChildren();
        const emptyItem = document.createElement('li');
        emptyItem.className = 'recent-empty';
        emptyItem.textContent = 'No recent chats yet';
        recentList.appendChild(emptyItem);
        return;
    }

    recentList.replaceChildren();
    conversations.slice(0, 8).forEach((conversation) => {
        const item = document.createElement('li');
        const button = document.createElement('button');
        const copy = document.createElement('span');
        const title = document.createElement('span');
        const preview = document.createElement('span');
        const lastUpdated = new Date(conversation.updatedAt || conversation.createdAt || Date.now());
        const when = lastUpdated.toLocaleDateString([], { month: 'short', day: 'numeric' });
        const lastMessage = conversation.messages?.at(-1)?.content || 'No messages yet';

        button.type = 'button';
        button.className = 'recent-entry';
        button.dataset.conversationId = conversation.id;
        button.classList.toggle('active', conversation.id === activeConversationId);
        button.setAttribute('aria-current', conversation.id === activeConversationId ? 'page' : 'false');
        title.className = 'recent-title';
        title.textContent = conversation.title || 'Untitled conversation';
        preview.className = 'recent-preview';
        preview.textContent = String(lastMessage).replace(/\s+/g, ' ').trim();
        copy.className = 'recent-copy';
        copy.append(title, preview);

        const time = document.createElement('time');
        time.dateTime = lastUpdated.toISOString();
        time.textContent = when;
        const marker = document.createElement('span');
        marker.className = 'chat-dot';
        marker.setAttribute('aria-hidden', 'true');
        marker.textContent = '◔';

        button.append(marker, copy, time);
        button.addEventListener('click', () => selectConversation(conversation.id));
        item.appendChild(button);
        recentList.appendChild(item);
    });
}

function selectConversation(conversationId) {
    const conversation = activeHistory.find((entry) => entry.id === conversationId);
    if (!conversation) {
        return;
    }

    activeConversationId = conversation.id;
    renderHistory(conversation.messages || []);
    setEmptyStateVisible(!conversation.messages?.length);
    buildRecentList();
    closeDrawers();
}

function openModal(title, content) {
    if (!modal || !modalBody || !modalTitle) {
        return;
    }

    modalReturnFocus = document.activeElement;
    modalTitle.textContent = title;
    modalBody.innerHTML = content;
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => {
        if (!modal.classList.contains('hidden')) {
            modal.querySelector('input, button:not(:disabled)')?.focus();
        }
    });
}

function closeModal() {
    if (!modal) {
        return;
    }

    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');

    let focusTarget = modalReturnFocus;
    if (focusTarget instanceof HTMLElement) {
        const sourceDrawer = focusTarget.closest('.sidebar, .right-rail');
        if (sourceDrawer && getComputedStyle(sourceDrawer).display === 'none') {
            focusTarget = sourceDrawer.id === 'leftDrawer' ? openNavDrawerButton : openRecentDrawerButton;
        }
    }

    if (focusTarget instanceof HTMLElement && focusTarget.isConnected) {
        focusTarget.focus();
    } else if (messageInput) {
        messageInput.focus();
    }
    modalReturnFocus = null;
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
                    selectConversation(targetId);
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

function openDrawer(panelId, trigger) {
    const panel = document.getElementById(panelId);
    if (!panel || !drawerScrim) {
        return;
    }

    document.querySelectorAll('.sidebar, .right-rail').forEach((drawer) => drawer.classList.remove('is-open'));
    drawerReturnFocus = trigger;
    panel.classList.add('is-open');
    document.querySelector('.app-shell')?.classList.add('drawer-open');
    drawerScrim.classList.remove('hidden');
    openNavDrawerButton?.setAttribute('aria-expanded', String(trigger === openNavDrawerButton));
    openRecentDrawerButton?.setAttribute('aria-expanded', String(trigger === openRecentDrawerButton));
    panel.querySelector('button')?.focus();
}

function closeDrawers(restoreFocus = true) {
    document.querySelectorAll('.sidebar, .right-rail').forEach((drawer) => drawer.classList.remove('is-open'));
    document.querySelector('.app-shell')?.classList.remove('drawer-open');
    drawerScrim?.classList.add('hidden');
    openNavDrawerButton?.setAttribute('aria-expanded', 'false');
    openRecentDrawerButton?.setAttribute('aria-expanded', 'false');
    if (restoreFocus && (!modal || modal.classList.contains('hidden')) && drawerReturnFocus instanceof HTMLElement && drawerReturnFocus.isConnected) {
        drawerReturnFocus.focus();
    }
    drawerReturnFocus = null;
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

    const shouldSpeakResponse = voiceState.speechSupported
        && voiceState.speakNextResponse
        && messageText === voiceState.lastTranscript;
    voiceState.speakNextResponse = false;

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
    let wasStopped = false;
    requestController = new AbortController();
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
            signal: requestController.signal,
        });

        const payload = await response.json();

        if (!response.ok) {
            throw new Error(payload.error || 'Vex failed to respond.');
        }

        const responseTimestamp = new Date().toISOString();
        addMessage('vex', payload.reply, responseTimestamp);
        if (shouldSpeakResponse) {
            speakResponse(payload.reply);
        }

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
        if (error.name === 'AbortError') {
            wasStopped = true;
        } else {
            addMessage('vex', error.message || 'Something went wrong.', new Date().toISOString());
        }
    } finally {
        isRequestPending = false;
        requestController = null;
        setTypingState(false);
        if (wasStopped && composerStatus) {
            composerStatus.textContent = 'Generation stopped.';
        }
        if (!document.querySelector('.app-modal:not(.hidden)')) {
            messageInput.focus();
        }
        updateJumpButtonState();
        if (isNearBottom()) {
            scrollToBottom();
        }
    }
}

function stopGeneration() {
    if (requestController && isRequestPending) {
        requestController.abort();
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
                closeDrawers(false);
                messageInput?.focus();
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

            if (voiceState.speaking) {
                window.speechSynthesis.cancel();
                voiceState.speaking = false;
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
                voiceState.lastTranscript = transcript;
                voiceState.speakNextResponse = true;
                voiceState.processing = true;
                clearTimeout(voiceState.processingTimer);
                voiceState.processingTimer = setTimeout(() => {
                    voiceState.processing = false;
                    updateVoiceButtonState();
                }, 650);
                updateVoiceButtonState();
                if (messageInput) {
                    messageInput.value = transcript;
                    autoResizeTextarea();
                    updateSendButtonState();
                }
            };

            recognition.onerror = (event) => {
                clearTimeout(voiceState.processingTimer);
                voiceState.listening = false;
                voiceState.processing = false;
                voiceState.error = event.error || 'Voice input failed.';
                updateVoiceButtonState();
                showPlaceholderModal('Voice input', 'Voice input is unavailable right now. You can continue typing normally.');
            };

            recognition.onend = () => {
                voiceState.listening = false;
                if (!voiceState.processing) {
                    updateVoiceButtonState();
                }
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

    openNavDrawerButton?.addEventListener('click', () => openDrawer('leftDrawer', openNavDrawerButton));
    openRecentDrawerButton?.addEventListener('click', () => openDrawer('rightDrawer', openRecentDrawerButton));
    drawerScrim?.addEventListener('click', closeDrawers);

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

    const state = voiceState.error ? 'error' : voiceState.speaking ? 'speaking' : voiceState.processing ? 'processing' : voiceState.listening ? 'listening' : 'idle';
    voiceButton.dataset.state = state;
    voiceButton.disabled = isRequestPending && !voiceState.speaking;
    voiceButton.setAttribute('aria-label', state === 'listening' ? 'Stop voice input' : state === 'processing' ? 'Processing voice input' : state === 'speaking' ? 'Stop speaking' : state === 'error' ? 'Voice input unavailable' : 'Start voice input');
    voiceButton.setAttribute('aria-pressed', String(state === 'listening' || state === 'speaking'));
    if (composerStatus && (state === 'speaking' || !isRequestPending)) {
        const statusMessages = {
            idle: 'VEX can make mistakes. Check important details.',
            listening: 'Listening. Speak when you are ready.',
            processing: 'Processing your voice input...',
            speaking: 'VEX is speaking. Select the voice button to stop.',
            error: 'Voice input is unavailable. Continue typing.',
        };
        composerStatus.textContent = statusMessages[state];
    }
    const icon = voiceButton.querySelector('.voice-icon');
    if (icon) {
        icon.textContent = state === 'listening' ? '◉' : state === 'processing' ? '◌' : state === 'speaking' ? '■' : state === 'error' ? '!' : '◔';
    }
}

function speakResponse(text) {
    if (!voiceState.speechSupported || !text) {
        return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.onstart = () => {
        voiceState.speaking = true;
        voiceState.error = null;
        updateVoiceButtonState();
    };
    utterance.onend = () => {
        voiceState.speaking = false;
        updateVoiceButtonState();
    };
    utterance.onerror = () => {
        voiceState.speaking = false;
        voiceState.error = null;
        updateVoiceButtonState();
    };

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
}

if (chatForm && messageInput) {
    chatForm.addEventListener('submit', handleComposerSubmit);

    messageInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            handleComposerSubmit(event);
        }
    });

    messageInput.addEventListener('input', () => {
        autoResizeTextarea();
        updateSendButtonState();
    });
}

if (stopButton) {
    stopButton.addEventListener('click', stopGeneration);
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

function getFocusableElements(container) {
    return [...container.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')]
        .filter((element) => !element.hidden && element.getClientRects().length > 0);
}

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
        if (modal && !modal.classList.contains('hidden')) {
            closeModal();
        } else if (document.querySelector('.app-shell.drawer-open')) {
            closeDrawers();
        }
        return;
    }

    if (event.key !== 'Tab') {
        return;
    }

    const activeDialog = modal && !modal.classList.contains('hidden')
        ? modal.querySelector('[role="dialog"]')
        : document.querySelector('.sidebar.is-open, .right-rail.is-open');
    if (!activeDialog) {
        return;
    }

    const focusable = getFocusableElements(activeDialog);
    if (!focusable.length) {
        event.preventDefault();
        activeDialog.focus();
        return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
    }
});

setRandomTagline();
updateVoiceButtonState();
bindActionButtons();
loadHistory();
