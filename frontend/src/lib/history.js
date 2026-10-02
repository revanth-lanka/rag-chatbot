export const CHAT_HISTORY_STORAGE_KEY = "rag-chatbot-chat-history";

/**
 * Loads all saved chat sessions from localStorage.
 * @returns {Array<{id: string, title: string, updatedAt: string, messages: Array, selectedDocumentId: string}>}
 */
export function loadChatSessions() {
  try {
    const raw = window.localStorage.getItem(CHAT_HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error("Failed to load chat history:", err);
    return [];
  }
}

/**
 * Saves or updates a chat session in localStorage.
 * @param {Object} session
 * @param {string} session.id
 * @param {string} session.title
 * @param {string} session.updatedAt
 * @param {Array} session.messages
 * @param {string} session.selectedDocumentId
 */
export function saveChatSession(session) {
  if (!session || !session.id || !session.messages || session.messages.length === 0) {
    return;
  }

  try {
    const sessions = loadChatSessions();
    const existingIndex = sessions.findIndex((s) => s.id === session.id);
    const existing = existingIndex >= 0 ? sessions[existingIndex] : null;

    const isCustom = session.isCustomTitle ?? existing?.isCustomTitle ?? false;
    let finalTitle = session.title;
    if (isCustom && existing?.title) {
      finalTitle = session.title || existing.title;
    } else if (!finalTitle) {
      finalTitle = deriveSessionTitle(session.messages);
    }

    const updatedSession = {
      ...existing,
      ...session,
      updatedAt: new Date().toISOString(),
      messageCount: session.messages.length,
      title: finalTitle,
      isCustomTitle: isCustom,
    };

    if (existingIndex >= 0) {
      sessions[existingIndex] = updatedSession;
    } else {
      sessions.unshift(updatedSession);
    }

    // Keep max 50 recent sessions to prevent quota issues
    const trimmed = sessions.slice(0, 50);
    window.localStorage.setItem(CHAT_HISTORY_STORAGE_KEY, JSON.stringify(trimmed));
  } catch (err) {
    console.error("Failed to save chat session:", err);
  }
}

/**
 * Renames a specific chat session and marks it with isCustomTitle: true.
 * @param {string} sessionId
 * @param {string} newTitle
 * @returns {Array} Updated sessions list
 */
export function renameChatSession(sessionId, newTitle) {
  if (!sessionId || !newTitle || !newTitle.trim()) {
    return loadChatSessions();
  }

  try {
    const sessions = loadChatSessions();
    const index = sessions.findIndex((s) => s.id === sessionId);
    if (index >= 0) {
      sessions[index] = {
        ...sessions[index],
        title: newTitle.trim(),
        isCustomTitle: true,
        updatedAt: new Date().toISOString(),
      };
      window.localStorage.setItem(CHAT_HISTORY_STORAGE_KEY, JSON.stringify(sessions));
    }
    return sessions;
  } catch (err) {
    console.error("Failed to rename chat session:", err);
    return loadChatSessions();
  }
}

/**
 * Derives a human-readable title from the first user question in a conversation.
 * @param {Array} messages
 * @returns {string}
 */
export function deriveSessionTitle(messages) {
  const firstUserMsg = messages.find((m) => m.role === "user");
  if (!firstUserMsg || !firstUserMsg.content) return "New Conversation";
  const trimmed = firstUserMsg.content.trim();
  if (trimmed.length <= 48) return trimmed;
  return `${trimmed.slice(0, 48)}...`;
}

/**
 * Deletes a single chat session by ID.
 * @param {string} sessionId
 * @returns {Array} Updated sessions list
 */
export function deleteChatSession(sessionId) {
  try {
    const sessions = loadChatSessions().filter((s) => s.id !== sessionId);
    window.localStorage.setItem(CHAT_HISTORY_STORAGE_KEY, JSON.stringify(sessions));
    return sessions;
  } catch (err) {
    console.error("Failed to delete chat session:", err);
    return [];
  }
}

/**
 * Clears all chat sessions.
 */
export function clearAllChatSessions() {
  try {
    window.localStorage.removeItem(CHAT_HISTORY_STORAGE_KEY);
  } catch (err) {
    console.error("Failed to clear chat sessions:", err);
  }
}

/**
 * Formats a timestamp into human-readable relative time ("Just now", "10m ago", "2h ago", "Yesterday", "Sep 24").
 * @param {string|Date} dateInput
 * @returns {string}
 */
export function formatRelativeTime(dateInput) {
  if (!dateInput) return "";
  const date = new Date(dateInput);
  if (Number.isNaN(date.getTime())) return "";

  const now = new Date();
  const diffSecs = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffSecs < 60) return "Just now";
  const diffMins = Math.floor(diffSecs / 60);
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
