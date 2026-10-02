import { memo, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Clock,
  Files,
  MessageSquare,
  MessageSquarePlus,
  MessageSquareText,
  PanelLeftClose,
  PanelLeftOpen,
  Trash2,
  X,
} from "lucide-react";

import { formatRelativeTime } from "../lib/history";

function ClearHistoryModal({ onConfirm, onCancel }) {
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <motion.div
        className="modal-card"
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ duration: 0.16, ease: "easeOut" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div className="modal-title-row">
            <div className="modal-icon-warning">
              <AlertTriangle size={18} />
            </div>
            <h3>Clear Chat History</h3>
          </div>
          <button
            type="button"
            className="icon-button-sm"
            onClick={onCancel}
            aria-label="Close modal"
          >
            <X size={14} />
          </button>
        </div>
        <div className="modal-body">
          <p>Are you sure you want to clear all chat history?</p>
          <p className="modal-subtext">
            This will permanently remove all saved conversation sessions and their message logs from your browser.
          </p>
        </div>
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="danger-button" onClick={onConfirm}>
            <Trash2 size={14} />
            Clear All History
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function AppSidebar({
  currentPath,
  onNavigate,
  onNewChat,
  sessions = [],
  currentSessionId,
  onSelectSession,
  onDeleteSession,
  onClearAllSessions,
  isOpen,
  onToggle,
}) {
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  useEffect(() => {
    function handleKeyDown(event) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        onNewChat?.();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "b") {
        event.preventDefault();
        onToggle?.();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onNewChat, onToggle]);

  return (
    <>
      <AnimatePresence>
        {showClearConfirm ? (
          <ClearHistoryModal
            onConfirm={() => {
              setShowClearConfirm(false);
              onClearAllSessions();
            }}
            onCancel={() => setShowClearConfirm(false)}
          />
        ) : null}
      </AnimatePresence>

      {/* Mobile overlay backdrop */}
      <div
        className={`sidebar-backdrop ${isOpen ? "sidebar-backdrop-visible" : ""}`}
        onClick={onToggle}
        aria-hidden="true"
      />

      <aside className={`app-sidebar ${isOpen ? "sidebar-open" : "sidebar-collapsed"}`}>
        <div className="sidebar-inner">
          {/* Header with Project Brand & Collapse Toggle */}
          <div className="sidebar-header">
            <div
              className="sidebar-brand-wrap"
              onClick={() => {
                if (!isOpen) {
                  onToggle();
                } else {
                  onNewChat?.();
                  if (currentPath !== "/chat") onNavigate("/chat");
                  if (window.innerWidth < 1024) onToggle();
                }
              }}
              role="button"
              tabIndex={0}
              title={!isOpen ? "Expand sidebar (Ctrl+B)" : "Home / New Chat"}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  if (!isOpen) {
                    onToggle();
                  } else {
                    onNewChat?.();
                    if (currentPath !== "/chat") onNavigate("/chat");
                  }
                }
              }}
            >
              <div className="sidebar-brand-icon">
                <MessageSquareText size={18} />
              </div>
              <span className="sidebar-anim-text sidebar-brand-title">RAG Chatbot</span>
            </div>

            <button
              type="button"
              className="sidebar-toggle-btn"
              onClick={onToggle}
              aria-label={isOpen ? "Collapse sidebar" : "Expand sidebar"}
              title={isOpen ? "Collapse sidebar (Ctrl+B)" : "Expand sidebar (Ctrl+B)"}
            >
              {isOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
            </button>
          </div>

          {/* Navigation Links */}
          <nav className="sidebar-nav" aria-label="Main Navigation">
            <button
              type="button"
              className={`sidebar-nav-item ${currentPath === "/chat" && (!currentSessionId || sessions.length === 0) ? "sidebar-nav-active" : ""}`}
              onClick={() => {
                onNewChat?.();
                if (currentPath !== "/chat") onNavigate("/chat");
                if (window.innerWidth < 1024) onToggle();
              }}
              title="New Chat (Ctrl+K)"
              aria-label="New Chat"
            >
              <div className="sidebar-icon-cell">
                <MessageSquarePlus size={18} />
              </div>
              <div className="sidebar-anim-text sidebar-nav-label-wrap">
                <span className="sidebar-btn-label">New Chat</span>
                <kbd className="sidebar-kbd">Ctrl K</kbd>
              </div>
            </button>

            <button
              type="button"
              className={`sidebar-nav-item ${currentPath === "/documents" ? "sidebar-nav-active" : ""}`}
              onClick={() => {
                onNavigate("/documents");
                if (window.innerWidth < 1024) onToggle();
              }}
              title="Document Library"
              aria-label="Document Library"
            >
              <div className="sidebar-icon-cell">
                <Files size={18} />
              </div>
              <div className="sidebar-anim-text sidebar-nav-label-wrap">
                <span className="sidebar-btn-label">Document Library</span>
              </div>
            </button>
          </nav>

          {/* Recent Chats Section */}
          <div className="sidebar-history-section">
            {/* Collapsed anchor button: permanently anchored at left: 10px, fades in on collapse */}
            <button
              type="button"
              className="sidebar-history-collapsed-btn"
              onClick={onToggle}
              title="Recent Chats (click to expand)"
              aria-label="Recent Chats"
            >
              <div className="sidebar-icon-cell">
                <Clock size={17} className="history-section-icon" />
              </div>
            </button>

            {/* Expanded History Content: fades in on expand, fades out on collapse */}
            <div className="sidebar-anim-text sidebar-history-expanded-wrap">
              <div className="sidebar-section-header">
                <span className="sidebar-section-title">Recent Chats</span>
                {sessions.length > 0 ? (
                  <span className="sidebar-history-count">{sessions.length}</span>
                ) : null}
              </div>

              <div className="sidebar-history-list">
                {sessions.length === 0 ? (
                  <div className="sidebar-history-empty" title="No recent chats yet">
                    <Clock size={15} className="empty-clock-icon" />
                    <span>No recent chats</span>
                  </div>
                ) : (
                  sessions.map((session) => {
                    const isCurrent = session.id === currentSessionId && currentPath === "/chat";
                    const turnCount = (session.messages || []).filter((m) => m.role === "user").length;

                    return (
                      <div
                        key={session.id}
                        className={`sidebar-history-item ${isCurrent ? "sidebar-history-active" : ""}`}
                        onClick={() => {
                          onSelectSession(session);
                          if (window.innerWidth < 1024) onToggle();
                        }}
                        role="button"
                        tabIndex={0}
                        title={session.title}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            onSelectSession(session);
                            if (window.innerWidth < 1024) onToggle();
                          }
                        }}
                      >
                        <div className="sidebar-icon-cell history-icon-cell">
                          <MessageSquare size={15} className="history-item-icon" />
                        </div>

                        <div className="history-item-content">
                          <span className="history-item-title">{session.title}</span>
                          <div className="history-item-meta">
                            <span>{formatRelativeTime(session.updatedAt)}</span>
                            {turnCount > 0 ? (
                              <>
                                <span className="meta-sep">·</span>
                                <span>
                                  {turnCount} {turnCount === 1 ? "turn" : "turns"}
                                </span>
                              </>
                            ) : null}
                          </div>
                        </div>

                        <button
                          type="button"
                          className="history-delete-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteSession(session.id);
                          }}
                          aria-label={`Delete chat ${session.title}`}
                          title="Delete chat"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>

              {sessions.length > 0 ? (
                <div className="sidebar-history-footer">
                  <button
                    type="button"
                    className="sidebar-clear-history-btn"
                    onClick={() => setShowClearConfirm(true)}
                    title="Clear all saved chat history"
                  >
                    <Trash2 size={13} />
                    <span>Clear history</span>
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

export default AppSidebar;
