const chatMessages = document.getElementById('chatMessages');
const messageInput = document.getElementById('messageInput');
const chatForm = document.getElementById('chatForm');
const sendButton = document.getElementById('sendButton');
const stopButton = document.getElementById('stopButton');
const composerStatus = document.getElementById('composerStatus');
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
const toggleHistoryPanelButton = document.getElementById('toggleHistoryPanel');
const appShell = document.querySelector('.app-shell');
const themePreferenceSelect = document.getElementById('themePreference');

const STORAGE_KEY = 'vex-conversations';
const PASSCODE_STORAGE_KEY = 'vex-passcode';
const THEME_STORAGE_KEY = 'vex-theme-preference';
const SIDEBAR_COLLAPSED_STORAGE_KEY = 'vex-sidebar-collapsed';
const HISTORY_COLLAPSED_STORAGE_KEY = 'vex-history-collapsed';
const themeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
const mobileLayoutQuery = window.matchMedia('(max-width: 760px)');
const tabletLayoutQuery = window.matchMedia('(max-width: 1100px)');
let activeHistory = [];
let selectedHistoryIds = new Set();
let activeConversationId = null;
let isRequestPending = false;
let requestController = null;
let modalReturnFocus = null;
let drawerReturnFocus = null;
let themePreference = getStoredThemePreference();
let sidebarCollapsed = localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === 'true';
let historyCollapsed = localStorage.getItem(HISTORY_COLLAPSED_STORAGE_KEY) === 'true';
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

function getStoredThemePreference() {
    const preference = localStorage.getItem(THEME_STORAGE_KEY);
    return ['system', 'light', 'dark'].includes(preference) ? preference : 'system';
}

function applyThemePreference(preference = themePreference) {
    themePreference = ['system', 'light', 'dark'].includes(preference) ? preference : 'system';
    localStorage.setItem(THEME_STORAGE_KEY, themePreference);

    const resolvedTheme = themePreference === 'system'
        ? themeMediaQuery.matches ? 'dark' : 'light'
        : themePreference;
    document.documentElement.dataset.theme = themePreference;
    document.documentElement.style.colorScheme = resolvedTheme;

    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) {
        themeColor.content = resolvedTheme === 'dark' ? '#0A141C' : '#F4F7FA';
    }
}

function updateSidebarLayout() {
    appShell?.classList.toggle('sidebar-collapsed', sidebarCollapsed && !mobileLayoutQuery.matches);
    if (!openNavDrawerButton) {
        return;
    }

    const mobileNavigationOpen = document.getElementById('leftDrawer')?.classList.contains('is-open') || false;
    const navigationExpanded = mobileLayoutQuery.matches ? mobileNavigationOpen : !sidebarCollapsed;
    const action = mobileLayoutQuery.matches
        ? mobileNavigationOpen ? 'Close' : 'Open'
        : navigationExpanded ? 'Collapse' : 'Expand';
    openNavDrawerButton.setAttribute('aria-label', `${action} navigation`);
    openNavDrawerButton.setAttribute('title', `${action} navigation`);
    openNavDrawerButton.setAttribute('aria-expanded', String(navigationExpanded));
}

function updateHistoryPanelLayout() {
    const historyPanel = document.getElementById('rightDrawer');
    if (!historyPanel || !toggleHistoryPanelButton) {
        return;
    }

    historyPanel.classList.toggle('collapsed', historyCollapsed && !tabletLayoutQuery.matches);
    const tabletOpen = historyPanel.classList.contains('is-open');
    const expanded = tabletLayoutQuery.matches ? tabletOpen : !historyCollapsed;
    const action = tabletLayoutQuery.matches ? 'Close' : expanded ? 'Collapse' : 'Expand';
    toggleHistoryPanelButton.setAttribute('aria-label', `${action} history panel`);
    toggleHistoryPanelButton.setAttribute('title', `${action} history panel`);
    toggleHistoryPanelButton.setAttribute('aria-expanded', String(expanded));
    toggleHistoryPanelButton.querySelector('span').textContent = tabletLayoutQuery.matches ? '×' : expanded ? '›' : '‹';
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
    return distanceFromBottom <= 120;
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

function appendInlineMarkdown(parent, text) {
    const pattern = /(\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)|`([^`]+)`|\*\*(.+?)\*\*|__(.+?)__|\*(.+?)\*|_(.+?)_)/g;
    let cursor = 0;

    for (const match of text.matchAll(pattern)) {
        const index = match.index;
        if (index > cursor) {
            parent.appendChild(document.createTextNode(text.slice(cursor, index)));
        }

        if (match[2]) {
            let url;
            try {
                url = new URL(match[3], window.location.href);
            } catch {
                parent.appendChild(document.createTextNode(match[0]));
                cursor = index + match[0].length;
                continue;
            }

            if (!['http:', 'https:', 'mailto:'].includes(url.protocol)) {
                parent.appendChild(document.createTextNode(match[0]));
                cursor = index + match[0].length;
                continue;
            }

            const link = document.createElement('a');
            link.href = url.href;
            link.textContent = match[2];
            link.title = match[4] || match[2];
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            parent.appendChild(link);
        } else if (match[5]) {
            const code = document.createElement('code');
            code.textContent = match[5];
            parent.appendChild(code);
        } else {
            const content = match[6] || match[7] || match[8] || match[9];
            const emphasis = document.createElement(match[6] || match[7] ? 'strong' : 'em');
            appendInlineMarkdown(emphasis, content);
            parent.appendChild(emphasis);
        }

        cursor = index + match[0].length;
    }

    if (cursor < text.length) {
        parent.appendChild(document.createTextNode(text.slice(cursor)));
    }
}

function highlightCode(codeElement, language) {
    const keywords = /\b(?:as|async|await|break|case|catch|class|const|continue|def|default|else|export|extends|false|finally|for|from|function|if|import|in|interface|let|new|null|of|return|static|throw|true|try|type|undefined|var|while|yield)\b/;
    const tokenPattern = /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\/\/[^\n]*|#[^\n]*|\b(?:as|async|await|break|case|catch|class|const|continue|def|default|else|export|extends|false|finally|for|from|function|if|import|in|interface|let|new|null|of|return|static|throw|true|try|type|undefined|var|while|yield)\b|\b\d+(?:\.\d+)?\b|\b[A-Za-z_$][\w$]*(?=\s*\())/g;
    const source = codeElement.textContent;
    codeElement.replaceChildren();
    let cursor = 0;

    for (const match of source.matchAll(tokenPattern)) {
        const index = match.index;
        if (index > cursor) {
            codeElement.appendChild(document.createTextNode(source.slice(cursor, index)));
        }

        const token = match[0];
        const span = document.createElement('span');
        span.className = token.startsWith('//') || token.startsWith('#')
            ? 'token-comment'
            : /^["'`]/.test(token)
                ? 'token-string'
                : /^\d/.test(token)
                    ? 'token-number'
                    : keywords.test(token)
                        ? 'token-keyword'
                        : 'token-function';
        span.textContent = token;
        codeElement.appendChild(span);
        cursor = index + token.length;
    }

    if (cursor < source.length) {
        codeElement.appendChild(document.createTextNode(source.slice(cursor)));
    }
}

function createCodeBlock(source, language) {
    const wrapper = document.createElement('div');
    wrapper.className = 'code-block';

    const header = document.createElement('div');
    header.className = 'code-block-header';
    const languageLabel = document.createElement('span');
    languageLabel.className = 'code-language';
    languageLabel.textContent = language || 'Code';
    const copyButton = document.createElement('button');
    copyButton.className = 'copy-code-button';
    copyButton.type = 'button';
    copyButton.textContent = 'Copy';
    copyButton.setAttribute('aria-label', `Copy ${language || 'code'} block`);
    copyButton.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(source);
            copyButton.textContent = 'Copied';
        } catch (error) {
            console.error('Unable to copy code block:', error);
            copyButton.textContent = 'Copy failed';
        }
        window.setTimeout(() => {
            copyButton.textContent = 'Copy';
        }, 1600);
    });

    const pre = document.createElement('pre');
    const code = document.createElement('code');
    if (language) {
        code.className = `language-${language.replace(/[^a-zA-Z0-9_-]/g, '')}`;
    }
    code.textContent = source;
    highlightCode(code, language);
    pre.appendChild(code);
    header.append(languageLabel, copyButton);
    wrapper.append(header, pre);
    return wrapper;
}

function appendMarkdown(parent, text) {
    const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
    let index = 0;

    while (index < lines.length) {
        const line = lines[index];
        if (!line.trim()) {
            index += 1;
            continue;
        }

        const fence = line.match(/^\s*```([\w.+-]*)\s*$/);
        if (fence) {
            const codeLines = [];
            index += 1;
            while (index < lines.length && !/^\s*```\s*$/.test(lines[index])) {
                codeLines.push(lines[index]);
                index += 1;
            }
            if (index < lines.length) {
                index += 1;
            }
            parent.appendChild(createCodeBlock(codeLines.join('\n'), fence[1]));
            continue;
        }

        const heading = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
        if (heading) {
            const element = document.createElement(`h${heading[1].length}`);
            appendInlineMarkdown(element, heading[2]);
            parent.appendChild(element);
            index += 1;
            continue;
        }

        if (/^\s*>\s?/.test(line)) {
            const quote = document.createElement('blockquote');
            while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
                const paragraph = document.createElement('p');
                appendInlineMarkdown(paragraph, lines[index].replace(/^\s*>\s?/, ''));
                quote.appendChild(paragraph);
                index += 1;
            }
            parent.appendChild(quote);
            continue;
        }

        const listMatch = line.match(/^\s*(?:([-+*])|(\d+)\.)\s+(.+)$/);
        if (listMatch) {
            const ordered = Boolean(listMatch[2]);
            const list = document.createElement(ordered ? 'ol' : 'ul');
            while (index < lines.length) {
                const itemMatch = lines[index].match(/^\s*(?:([-+*])|(\d+)\.)\s+(.+)$/);
                if (!itemMatch || Boolean(itemMatch[2]) !== ordered) {
                    break;
                }
                const item = document.createElement('li');
                appendInlineMarkdown(item, itemMatch[3]);
                list.appendChild(item);
                index += 1;
            }
            parent.appendChild(list);
            continue;
        }

        const paragraphLines = [];
        while (index < lines.length && lines[index].trim()
            && !/^\s*```/.test(lines[index])
            && !/^#{1,6}\s/.test(lines[index])
            && !/^\s*>\s?/.test(lines[index])
            && !/^\s*(?:[-+*]|\d+\.)\s+/.test(lines[index])) {
            paragraphLines.push(lines[index]);
            index += 1;
        }
        const paragraph = document.createElement('p');
        appendInlineMarkdown(paragraph, paragraphLines.join('\n'));
        parent.appendChild(paragraph);
    }
}

function appendMessageError(messageText, messageTextOverride) {
    const row = document.createElement('div');
    row.className = 'message-row vex message-error-row visible';
    const group = document.createElement('div');
    group.className = 'message-group';
    const bubble = document.createElement('div');
    bubble.className = 'message-bubble message-error';
    const message = document.createElement('p');
    message.textContent = messageTextOverride || "VEX couldn't complete the request. Check your connection and try again.";
    const actions = document.createElement('div');
    actions.className = 'message-error-actions';
    const retryButton = document.createElement('button');
    retryButton.type = 'button';
    retryButton.className = 'message-action-button';
    retryButton.textContent = 'Retry';
    retryButton.addEventListener('click', () => {
        row.remove();
        sendMessage(messageText, true);
    });
    const dismissButton = document.createElement('button');
    dismissButton.type = 'button';
    dismissButton.className = 'message-action-button subtle';
    dismissButton.textContent = 'Dismiss';
    dismissButton.addEventListener('click', () => row.remove());
    actions.append(retryButton, dismissButton);
    bubble.append(message, actions);
    group.appendChild(bubble);
    row.appendChild(group);
    chatMessages?.appendChild(row);
}

function addMessage(role, text, timestamp = new Date().toISOString()) {
    if (!chatMessages || !text) {
        return;
    }

    const shouldAutoScroll = isNearBottom();
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
    if (role === 'user') {
        bubble.textContent = text;
    } else {
        bubble.classList.add('markdown-body');
        appendMarkdown(bubble, text);
    }

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
        if (shouldAutoScroll) {
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

        const threadButton = document.createElement('button');
        threadButton.type = 'button';
        threadButton.className = 'history-row';
        threadButton.dataset.conversationId = conversation.id;
        threadButton.classList.toggle('active', conversation.id === activeConversationId);
        threadButton.classList.toggle('selected', selectedHistoryIds.has(conversation.id));
        threadButton.setAttribute('aria-pressed', String(selectedHistoryIds.has(conversation.id)));
        threadButton.setAttribute('aria-label', `Open and select conversation ${conversation.title || 'untitled'}`);
        threadButton.addEventListener('click', () => {
            if (selectedHistoryIds.has(conversation.id)) {
                selectedHistoryIds.delete(conversation.id);
            } else {
                selectedHistoryIds.add(conversation.id);
            }
            selectConversation(conversation.id, true);
        });

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

        item.appendChild(threadButton);
        recentList.appendChild(item);
    });

    updateDeleteSelectionState();
}

function selectConversation(conversationId, keepHistoryOpen = false) {
    const conversation = activeHistory.find((entry) => entry.id === conversationId);
    if (!conversation) {
        return;
    }

    activeConversationId = conversation.id;
    renderHistory(conversation.messages || []);
    setEmptyStateVisible(!conversation.messages?.length);
    buildRecentList();
    if (keepHistoryOpen) {
        [...(recentList?.querySelectorAll('.history-row') || [])]
            .find((row) => row.dataset.conversationId === conversationId)
            ?.focus();
    } else {
        closeDrawers();
    }
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

function createTextElement(tagName, className, text) {
    const element = document.createElement(tagName);
    if (className) {
        element.className = className;
    }
    if (typeof text === 'string') {
        element.textContent = text;
    }
    return element;
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
            focusTarget = sourceDrawer.id === 'leftDrawer' ? openNavDrawerButton : messageInput;
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
    const content = document.createDocumentFragment();
    const searchInput = createTextElement('input', 'search-input');
    searchInput.id = 'historySearchInputModal';
    searchInput.type = 'text';
    searchInput.placeholder = 'Search saved history...';
    searchInput.setAttribute('aria-label', 'Search saved history');
    const results = createTextElement('ul', 'history-list');
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
            results.replaceChildren(createTextElement('li', 'action-item', 'No matching conversation history found.'));
            return;
        }

        const resultItems = sortConversations(filtered).slice(0, 12).map((conversation) => {
            const preview = conversation.messages?.[0]?.content || conversation.title || 'Conversation';
            const item = document.createElement('li');
            const button = createTextElement('button', 'history-item', String(preview).replace(/\s+/g, ' ').slice(0, 90));
            button.type = 'button';
            button.dataset.conversationId = conversation.id;
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
    const content = document.createDocumentFragment();
    content.appendChild(createTextElement('p', 'info-block', 'Adjust the local experience for VEX. These preferences stay in your browser.'));

    const settingsList = createTextElement('div', 'settings-list');
    for (const [setting, label] of [
        ['compact', 'Compact mode'],
        ['glow', 'Typing glow'],
        ['autoscroll', 'Auto-scroll to latest'],
    ]) {
        const row = createTextElement('div', 'settings-row');
        row.appendChild(createTextElement('span', '', label));
        const toggle = createTextElement('button', 'toggle active');
        toggle.type = 'button';
        toggle.dataset.setting = setting;
        toggle.setAttribute('aria-label', `Toggle ${label.toLowerCase()}`);
        row.appendChild(toggle);
        settingsList.appendChild(row);
    }
    content.appendChild(settingsList);

    const actions = createTextElement('div', 'modal-actions');
    const dismissButton = createTextElement('button', 'primary-action', 'Done');
    dismissButton.type = 'button';
    dismissButton.id = 'dismissSettings';
    actions.appendChild(dismissButton);
    content.appendChild(actions);

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
    const content = document.createDocumentFragment();
    content.appendChild(createTextElement('p', 'info-block', 'Kiplangat Ezra'));
    const actions = createTextElement('ul', 'action-list');
    for (const [action, label] of [
        ['profile', 'View Profile'],
        ['status', 'Status: Online'],
        ['logout', 'Sign out'],
    ]) {
        const item = document.createElement('li');
        const button = createTextElement('button', 'action-item', label);
        button.type = 'button';
        button.dataset.action = action;
        item.appendChild(button);
        actions.appendChild(item);
    }
    content.appendChild(actions);

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
    openModal(title, createTextElement('p', 'info-block', message));
}

function persistConversationSet() {
    writeConversationsToStorage(activeHistory);
}

async function requestJson(endpoint, options = {}) {
    const requestWithPasscode = (passcode) => {
        const headers = new Headers(options.headers);
        headers.set('X-Vex-Passcode', passcode);
        return fetch(endpoint, { ...options, headers });
    };
    const promptForPasscode = () => {
        const passcode = window.prompt('Enter the VEX passcode.');
        if (passcode) {
            sessionStorage.setItem(PASSCODE_STORAGE_KEY, passcode);
        }
        return passcode;
    };

    let passcode = sessionStorage.getItem(PASSCODE_STORAGE_KEY) || promptForPasscode();
    if (!passcode) {
        throw new Error('A VEX passcode is required.');
    }

    let response = await requestWithPasscode(passcode);
    if (response.status === 401) {
        sessionStorage.removeItem(PASSCODE_STORAGE_KEY);
        passcode = promptForPasscode();
        if (!passcode) {
            throw new Error('Unauthorized.');
        }
        response = await requestWithPasscode(passcode);
    }

    const contentType = response.headers.get('content-type') || '';

    if (!contentType.includes('application/json')) {
        const rawText = await response.text();
        const preview = rawText.replace(/\s+/g, ' ').slice(0, 180);
        throw new Error(
            `${endpoint} returned a non-JSON response. Check that the VEX server is running on the correct port. Received: ${preview || 'empty response'}`
        );
    }

    const payload = await response.json();

    if (!response.ok) {
        throw new Error(payload?.error || `Request failed (${response.status})`);
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
    updateSidebarLayout();
    updateHistoryPanelLayout();
    panel.querySelector('button')?.focus();
}

function closeDrawers(restoreFocus = true) {
    document.querySelectorAll('.sidebar, .right-rail').forEach((drawer) => drawer.classList.remove('is-open'));
    document.querySelector('.app-shell')?.classList.remove('drawer-open');
    drawerScrim?.classList.add('hidden');
    updateSidebarLayout();
    updateHistoryPanelLayout();
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

async function sendMessage(messageText, isRetry = false) {
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

    if (activeConversation && !isRetry) {
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

    if (!isRetry) {
        addMessage('user', messageText, now);
        messageInput.value = '';
        autoResizeTextarea();
    }

    try {
        const payload = await requestJson('/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                messages: (activeConversation?.messages || [{ role: 'user', content: messageText }])
                    .slice(-20)
                    .map((message) => ({
                        role: message.role === 'assistant' ? 'assistant' : 'user',
                        content: String(message.content || '').slice(0, 2000),
                    })),
                conversationId: activeConversationId,
            }),
            signal: requestController.signal,
        });

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
            console.error('Chat request failed:', error);
        }
        appendMessageError(messageText, wasStopped ? 'Generation was stopped.' : undefined);
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
                    openDrawer('rightDrawer');
                    if (historySearchInput) {
                        historySearchInput.focus();
                        historySearchInput.select();
                    }
                },
                'open-files': () => filePicker?.click(),
                tasks: () => showPlaceholderModal('Tasks', 'Task tracking is not part of this build yet. VEX can manage notes and planning once this interface is connected to a real task backend.'),
                calendar: () => showPlaceholderModal('Calendar', 'Calendar access is not connected in this local build. This panel is intentionally a placeholder until that service is available.'),
                settings: openSettingsPanel,
            };

            if (actions[action]) {
                actions[action]();
                if (action !== 'search-history') {
                    closeDrawers(false);
                    messageInput?.focus();
                }
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
        const strong = createTextElement('strong', '', label);
        const detail = createTextElement('span', '', description);
        button.replaceChildren(strong, detail);

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

    openNavDrawerButton?.addEventListener('click', () => {
        if (mobileLayoutQuery.matches) {
            if (document.getElementById('leftDrawer')?.classList.contains('is-open')) {
                closeDrawers();
            } else {
                openDrawer('leftDrawer', openNavDrawerButton);
            }
            return;
        }

        sidebarCollapsed = !sidebarCollapsed;
        localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(sidebarCollapsed));
        updateSidebarLayout();
    });
    toggleHistoryPanelButton?.addEventListener('click', () => {
        if (tabletLayoutQuery.matches) {
            closeDrawers();
            return;
        }

        historyCollapsed = !historyCollapsed;
        localStorage.setItem(HISTORY_COLLAPSED_STORAGE_KEY, String(historyCollapsed));
        updateHistoryPanelLayout();
    });
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
applyThemePreference();
updateSidebarLayout();
updateHistoryPanelLayout();
mobileLayoutQuery.addEventListener('change', updateSidebarLayout);
tabletLayoutQuery.addEventListener('change', updateHistoryPanelLayout);
if (themePreferenceSelect) {
    themePreferenceSelect.value = themePreference;
    themePreferenceSelect.addEventListener('change', () => {
        applyThemePreference(themePreferenceSelect.value);
    });
}
themeMediaQuery.addEventListener('change', () => {
    if (themePreference === 'system') {
        applyThemePreference('system');
    }
});
setRandomTagline();
updateVoiceButtonState();
bindActionButtons();
loadHistory();
