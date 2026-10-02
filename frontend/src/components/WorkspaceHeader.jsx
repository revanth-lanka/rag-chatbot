import { memo, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  Menu,
  MoonStar,
  Pencil,
  Settings,
  SunMedium,
  X,
} from "lucide-react";

function WorkspaceHeader({
  currentPath,
  status = "Ready",
  activeTitle = "",
  onRenameTitle,
  hasActiveChat = false,
  onToggleTheme,
  onOpenSettings,
  resolvedTheme,
  onToggleSidebar,
  isSidebarOpen,
}) {
  const isStreaming = status.toLowerCase().includes("streaming") || status.toLowerCase().includes("connecting");
  const displayTitle = activeTitle || (currentPath === "/documents" ? "Documents" : "New Chat");
  const isEditable = hasActiveChat && currentPath === "/chat";

  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef(null);

  // Sync editValue when activeTitle changes or editing state resets
  useEffect(() => {
    if (!isEditing) {
      setEditValue(activeTitle || "");
    }
  }, [activeTitle, isEditing]);

  // Auto-focus and select text when entering edit mode, ensuring scrollLeft is 0
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
      inputRef.current.scrollLeft = 0;
    }
  }, [isEditing]);

  // Cancel edit if user navigates away
  useEffect(() => {
    if (isEditing) {
      setIsEditing(false);
    }
  }, [currentPath]);

  function handleStartEdit() {
    if (!isEditable) return;
    setEditValue(activeTitle || "");
    setIsEditing(true);
  }

  function handleSaveEdit() {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== activeTitle) {
      onRenameTitle?.(trimmed);
    } else {
      setEditValue(activeTitle || "");
    }
    setIsEditing(false);
  }

  function handleCancelEdit() {
    setEditValue(activeTitle || "");
    setIsEditing(false);
  }

  function handleKeyDown(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSaveEdit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleCancelEdit();
    }
  }

  return (
    <header className="workspace-header">
      <div className="workspace-header-inner">
        <div className="header-left">
          {onToggleSidebar ? (
            <button
              type="button"
              className="mobile-only-toggle"
              onClick={onToggleSidebar}
              aria-label={isSidebarOpen ? "Collapse navigation sidebar" : "Open navigation sidebar"}
              title={isSidebarOpen ? "Collapse sidebar" : "Open sidebar"}
            >
              <Menu size={20} />
            </button>
          ) : null}
          <div
            className={`header-title-container ${
              isEditable && !isEditing ? "header-title-hoverable" : ""
            } ${isEditing ? "header-title-editing" : ""}`}
          >
            {isEditing ? (
              <div className="header-title-sizer-wrap">
                <span className="header-title-sizer" aria-hidden="true">
                  {editValue || " "}
                </span>
                <input
                  ref={inputRef}
                  type="text"
                  className="header-title-input"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onBlur={handleSaveEdit}
                  maxLength={60}
                  aria-label="Rename conversation title"
                />
              </div>
            ) : (
              <h1
                className="header-view-title"
                role={isEditable ? "button" : undefined}
                tabIndex={isEditable ? 0 : undefined}
                title={isEditable ? "Click to rename conversation" : undefined}
                onClick={isEditable && !isEditing ? handleStartEdit : undefined}
                onKeyDown={
                  isEditable
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleStartEdit();
                        }
                      }
                    : undefined
                }
              >
                {displayTitle}
              </h1>
            )}

            {/* Morphing Actions Slot: Pencil <-> Tick & Cross */}
            <div className="header-actions-slot">
              <AnimatePresence mode="wait" initial={false}>
                {isEditing ? (
                  <motion.div
                    key="editing-actions"
                    className="header-actions-group"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.09, ease: "easeOut" }}
                  >
                    <button
                      type="button"
                      className="header-rename-action-btn header-rename-confirm-btn"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleSaveEdit();
                      }}
                      title="Save title (Enter)"
                      aria-label="Save title"
                    >
                      <Check size={13} />
                    </button>
                    <button
                      type="button"
                      className="header-rename-action-btn header-rename-cancel-btn"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleCancelEdit();
                      }}
                      title="Cancel (Esc)"
                      aria-label="Cancel rename"
                    >
                      <X size={13} />
                    </button>
                  </motion.div>
                ) : isEditable ? (
                  <motion.div
                    key="view-action"
                    className="header-actions-group"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.09, ease: "easeOut" }}
                  >
                    <button
                      type="button"
                      className="header-rename-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStartEdit();
                      }}
                      title="Rename conversation"
                      aria-label="Rename conversation"
                    >
                      <Pencil size={12} />
                    </button>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          </div>
        </div>

        <div className="header-right">
          {/* Live Status Indicator Pill */}
          <div
            className={`header-status-pill ${
              isStreaming ? "status-pill-streaming" : "status-pill-ready"
            }`}
            title={`System status: ${status}`}
          >
            <span className={`status-dot ${isStreaming ? "status-dot-pulsing" : ""}`} />
            <span className="status-label-text">{status}</span>
          </div>

          <button
            type="button"
            className="header-icon-button"
            onClick={onToggleTheme}
            aria-label={resolvedTheme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            title={resolvedTheme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          >
            {resolvedTheme === "dark" ? <SunMedium size={17} /> : <MoonStar size={17} />}
          </button>

          <button
            type="button"
            className="header-icon-button"
            onClick={onOpenSettings}
            aria-label="Open run settings"
            title="Run settings"
          >
            <Settings size={17} />
          </button>
        </div>
      </div>
    </header>
  );
}

export default WorkspaceHeader;
