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
const historySearchInput = document.getElementById('historySearchInput');
const deleteSelectedButton = document.getElementById('deleteSelectedButton');
const createNewChatButton = document.getElementById('createNewChatButton');
const welcomeDisplayName = document.getElementById('welcomeDisplayName');
const voiceButton = document.getElementById('voiceButton');
const drawerScrim = document.getElementById('drawerScrim');
const openNavDrawerButton = document.getElementById('openNavDrawer');
const openRecentDrawerButton = document.getElementById('openRecentDrawer');

const STORAGE_KEY = 'vex-conversations';
const PASSCODE_STORAGE_KEY = 'vex-passcode';
let activeHistory = [];
let selectedHistoryIds = new Set();
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

function resolveDisplayName() {
    const storedName = [
        localStorage.getItem('vex-display-name'),
        localStorage.getItem('vex-user-name'),
        localStorage.getItem('displayName'),
        localStorage.getItem('profileName'),
        document.querySelector('.user-name')?.textContent,
        'Ezra',
    ].find((value) => typeof value === 'string' && value.trim());

    const nextName = String(storedName || 'Ezra').trim() || 'Ezra';
    localStorage.setItem('vex-display-name', nextName);
    return nextName;
}

function syncDisplayNames() {
    const displayName = resolveDisplayName();
    const userName = document.querySelector('.user-name');
    if (userName) {
        userName.textContent = displayName;
    }
    if (welcomeDisplayName) {
        welcomeDisplayName.textContent = displayName;
    }
}

function getRelativeTimeLabel(timestamp) {
    const date = new Date(timestamp || Date.now());
    const diffMs = Date.now() - date.getTime();
    const minutes = Math.max(1, Math.round(diffMs / 60000));

    if (minutes < 60) {
        return `${minutes}m ago`;
    }

    const hours = Math.round(minutes / 60);
    if (hours < 24) {
        return `${hours}h ago`;
    }

    const days = Math.round(hours / 24);
    return `${days}d ago`;
}

function getConversationPreview(conversation) {
    const firstUserMessage = (conversation.messages || []).find((message) => message?.role === 'user')?.content || conversation.title || 'No messages yet';
    return String(firstUserMessage).replace(/\s+/g, ' ').trim().slice(0, 110);
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

    chatMessages.replaceChildren();
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

function updateDeleteSelectionState() {
    if (!deleteSelectedButton) {
        return;
    }

    deleteSelectedButton.classList.toggle('hidden', selectedHistoryIds.size === 0);
}

function buildRecentList() {
    if (!recentList) {
        return;
    }

    const trimmedQuery = (historySearchInput?.value || '').trim().toLowerCase();
    const conversations = sortConversations(activeHistory).filter((conversation) => {
        if (!trimmedQuery) {
            return true;
        }

        const haystack = `${conversation.title || ''} ${(conversation.messages || []).map((message) => message?.content || '').join(' ')}`.toLowerCase();
        return haystack.includes(trimmedQuery);
    });

    recentList.replaceChildren();

    if (!conversations.length) {
        const emptyItem = document.createElement('li');
        emptyItem.className = 'history-empty';
        emptyItem.textContent = trimmedQuery ? 'No matching chats' : 'No chats yet';
        recentList.appendChild(emptyItem);
        updateDeleteSelectionState();
        return;
    }

    conversations.forEach((conversation) => {
        const item = document.createElement('li');
        item.className = 'history-item-row';

        const checkboxWrap = document.createElement('label');
        checkboxWrap.className = 'history-checkbox';
        checkboxWrap.setAttribute('aria-label', `Select ${conversation.title || 'conversation'}`);

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = selectedHistoryIds.has(conversation.id);
        checkbox.addEventListener('change', (event) => {
            if (event.target.checked) {
                selectedHistoryIds.add(conversation.id);
            } else {
                selectedHistoryIds.delete(conversation.id);
            }
            updateDeleteSelectionState();
        });

        checkboxWrap.appendChild(checkbox);

        const threadButton = document.createElement('button');
        threadButton.type = 'button';
        threadButton.className = 'history-row';
        threadButton.dataset.conversationId = conversation.id;
        threadButton.classList.toggle('active', conversation.id === activeConversationId);
        threadButton.setAttribute('aria-label', `Open conversation ${conversation.title || 'untitled'}`);

        const icon = document.createElement('span');
        icon.className = 'history-avatar';
        icon.textContent = 'V';

        const meta = document.createElement('div');
        meta.className = 'history-meta';

        const title = document.createElement('span');
        title.className = 'history-title';
        title.textContent = conversation.title || 'Untitled conversation';

        const preview = document.createElement('span');
        preview.className = 'history-preview';
        preview.textContent = getConversationPreview(conversation);

        const time = document.createElement('span');
        time.className = 'history-time';
        time.textContent = getRelativeTimeLabel(conversation.updatedAt || conversation.createdAt || Date.now());

        meta.append(title, preview);
        threadButton.append(icon, meta, time);
        threadButton.addEventListener('click', () => selectConversation(conversation.id));

        item.append(checkboxWrap, threadButton);
        recentList.appendChild(item);
    });

    updateDeleteSelectionState();
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

function createNewConversationSession() {
    const nextConversation = createEmptyConversation();
    activeHistory = [nextConversation, ...activeHistory.filter((conversation) => conversation.id !== nextConversation.id)];
    activeConversationId = nextConversation.id;
    selectedHistoryIds.clear();
    persistConversationSet();
    renderHistory([]);
    setEmptyStateVisible(true);
    buildRecentList();
    closeDrawers();
    if (messageInput) {
        messageInput.focus();
    }
}

async function deleteSelectedConversations() {
    const selectedIds = [...selectedHistoryIds];
    if (!selectedIds.length) {
        return;
    }

    const successfulIds = [];
    for (const conversationId of selectedIds) {
        try {
            await requestJson(`/api/conversations/${encodeURIComponent(conversationId)}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                },
            });
            successfulIds.push(conversationId);
        } catch (error) {
            console.error('Unable to delete conversation:', conversationId, error);
        }
    }

    if (!successfulIds.length) {
        return;
    }

    activeHistory = activeHistory.filter((conversation) => !successfulIds.includes(conversation.id));
    selectedHistoryIds.clear();

    if (!activeHistory.length) {
        const nextConversation = createEmptyConversation();
        activeHistory = [nextConversation];
        activeConversationId = nextConversation.id;
        renderHistory([]);
        setEmptyStateVisible(true);
    } else if (!activeHistory.some((conversation) => conversation.id === activeConversationId)) {
        activeConversationId = activeHistory[0].id;
        renderHistory((getActiveConversation()?.messages || []).slice());
        setEmptyStateVisible(!getActiveConversation()?.messages?.length);
    }

    persistConversationSet();
    buildRecentList();
}

function openModal(title, content) {
    if (!modal || !modalBody || !modalTitle) {
        return;
    }

    modalReturnFocus = document.activeElement;
    modalTitle.textContent = title;
    modalBody.replaceChildren(content);
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
    const content = document.createElement('div');
    const searchInput = document.createElement('input');
    searchInput.id = 'historySearchInputModal';
    searchInput.className = 'search-input';
    searchInput.type = 'text';
    searchInput.placeholder = 'Search saved history...';
    searchInput.setAttribute('aria-label', 'Search saved history');

    const results = document.createElement('ul');
    results.className = 'history-list';
    results.id = 'historyResults';
    content.append(searchInput, results);
    openModal('History Search', content);

    const renderResults = (query = '') => {
        const normalized = query.trim().toLowerCase();
        const filtered = normalized
            ? activeHistory.filter((conversation) => {
                const haystack = (conversation.title || '') + ' ' + (conversation.messages || []).map((message) => message.content || '').join(' ');
                return haystack.toLowerCase().includes(normalized);
            })
            : activeHistory;

        if (!filtered.length) {
            const emptyResult = document.createElement('li');
            emptyResult.className = 'action-item';
            emptyResult.textContent = 'No matching conversation history found.';
            results.replaceChildren(emptyResult);
            return;
        }

        const resultItems = sortConversations(filtered).slice(0, 12).map((conversation) => {
            const preview = conversation.messages?.[0]?.content || conversation.title || 'Conversation';
            const item = document.createElement('li');
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'history-item';
            button.dataset.conversationId = conversation.id;
            button.textContent = String(preview).replace(/\s+/g, ' ').slice(0, 90);
            item.appendChild(button);
            return item;
        });
        results.replaceChildren(...resultItems);

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
    const content = document.createElement('div');
    const description = document.createElement('p');
    description.className = 'info-block';
    description.textContent = 'Adjust the local experience for VEX. These preferences stay in your browser.';

    const settingsList = document.createElement('div');
    settingsList.className = 'settings-list';
    [
        ['Compact mode', 'compact'],
        ['Typing glow', 'glow'],
        ['Auto-scroll to latest', 'autoscroll'],
    ].forEach(([label, setting]) => {
        const row = document.createElement('div');
        row.className = 'settings-row';
        const settingLabel = document.createElement('span');
        settingLabel.textContent = label;
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'toggle active';
        toggle.dataset.setting = setting;
        toggle.setAttribute('aria-label', `Toggle ${label.toLowerCase()}`);
        row.append(settingLabel, toggle);
        settingsList.appendChild(row);
    });

    const actions = document.createElement('div');
    actions.className = 'modal-actions';
    const doneButton = document.createElement('button');
    doneButton.type = 'button';
    doneButton.className = 'primary-action';
    doneButton.id = 'dismissSettings';
    doneButton.textContent = 'Done';
    actions.appendChild(doneButton);
    content.append(description, settingsList, actions);

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
    const content = document.createElement('div');
    const profileName = document.createElement('p');
    profileName.className = 'info-block';
    profileName.textContent = 'Kiplangat Ezra';
    const actions = document.createElement('ul');
    actions.className = 'action-list';
    [
        ['View Profile', 'profile'],
        ['Status: Online', 'status'],
        ['Sign out', 'logout'],
    ].forEach(([label, action]) => {
        const item = document.createElement('li');
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'action-item';
        button.dataset.action = action;
        button.textContent = label;
        item.appendChild(button);
        actions.appendChild(item);
    });
    content.append(profileName, actions);

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
    const content = document.createElement('p');
    content.className = 'info-block';
    content.textContent = message;
    openModal(title, content);
}

function persistConversationSet() {
    writeConversationsToStorage(activeHistory);
}

async function requestJson(endpoint, options = {}) {
    let passcode = sessionStorage.getItem(PASSCODE_STORAGE_KEY);
    if (!passcode) {
        passcode = window.prompt('Enter your VEX passcode');
        if (!passcode) {
            throw new Error('A passcode is required to use VEX.');
        }
        sessionStorage.setItem(PASSCODE_STORAGE_KEY, passcode);
    }

    const sendRequest = (value) => fetch(endpoint, {
        ...options,
        headers: {
            ...options.headers,
            'X-Vex-Passcode': value,
        },
    });

    let response = await sendRequest(passcode);
    if (response.status === 401) {
        sessionStorage.removeItem(PASSCODE_STORAGE_KEY);
        passcode = window.prompt('Incorrect passcode. Enter your VEX passcode again.');
        if (!passcode) {
            throw new Error('A valid passcode is required to use VEX.');
        }
        sessionStorage.setItem(PASSCODE_STORAGE_KEY, passcode);
        response = await sendRequest(passcode);
    }

    const contentType = response.headers.get('content-type') || '';

    if (!contentType.includes('application/json')) {
        throw new Error('VEX returned an unexpected response. Please try again.');
    }

    const payload = await response.json();

    if (!response.ok) {
        if (response.status === 401) {
            sessionStorage.removeItem(PASSCODE_STORAGE_KEY);
            throw new Error('The passcode was not accepted.');
        }
        throw new Error(payload?.error || 'The request could not be completed.');
    }

    return payload;
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
        const payload = await requestJson('/api/history');
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
        const payload = await requestJson('/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                messages: (activeConversation?.messages || [])
                    .slice(-20)
                    .map((message) => {
                        const role = message.role === 'assistant' || message.role === 'model'
                            ? 'assistant'
                            : message.role === 'user'
                                ? 'user'
                                : null;
                        return role && typeof message.content === 'string'
                            ? { role, content: message.content.slice(0, 2000) }
                            : null;
                    })
                    .filter(Boolean),
            }),
            signal: requestController.signal,
        });

        if (typeof payload.reply !== 'string') {
            throw new Error('VEX returned an invalid model response.');
        }

        const responseTimestamp = new Date().toISOString();
        addMessage('vex', payload.reply, responseTimestamp);
        if (shouldSpeakResponse) {
            speakResponse(payload.reply);
        }

        if (activeConversation) {
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
        const payload = await requestJson('/api/reset', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(currentConversationId ? { conversationId: currentConversationId } : {}),
        });

        if (currentConversationId) {
            activeHistory = activeHistory.filter((conversation) => conversation.id !== currentConversationId);
        }

        if (!activeHistory.length) {
            const nextConversation = createEmptyConversation();
            activeHistory = [nextConversation];
        }

        activeConversationId = activeHistory[0].id;
        persistConversationSet();
        chatMessages.replaceChildren();
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
                'new-chat': createNewConversationSession,
                'search-history': () => {
                    if (historySearchInput) {
                        historySearchInput.focus();
                        historySearchInput.select();
                    }
                    openDrawer('rightDrawer', openRecentDrawerButton);
                },
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

    const quickActionMap = {
        'Explain something': 'Break down a concept or topic in plain language.',
        'Help me plan': 'Map out steps, priorities, and a clear direction.',
        'Give me ideas': 'Explore creative options and useful directions.',
        'Just chat': 'Swap thoughts on anything and everything.',
    };

    document.querySelectorAll('.quick-actions button').forEach((button) => {
        const label = button.dataset.quickAction || button.textContent.trim();
        const description = quickActionMap[label] || 'Start a fresh conversation with VEX.';
        const labelElement = document.createElement('strong');
        labelElement.textContent = label;
        const descriptionElement = document.createElement('span');
        descriptionElement.textContent = description;
        button.replaceChildren(labelElement, descriptionElement);

        button.addEventListener('click', () => {
            if (messageInput) {
                messageInput.value = label;
                messageInput.focus();
                autoResizeTextarea();
                updateSendButtonState();
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

    if (historySearchInput) {
        historySearchInput.addEventListener('input', buildRecentList);
    }

    if (createNewChatButton) {
        createNewChatButton.addEventListener('click', createNewConversationSession);
    }

    if (deleteSelectedButton) {
        deleteSelectedButton.addEventListener('click', deleteSelectedConversations);
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

syncDisplayNames();
setRandomTagline();
updateVoiceButtonState();
bindActionButtons();
loadHistory();
