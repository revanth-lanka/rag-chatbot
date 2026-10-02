import { memo, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  ArrowUp,
  BookOpen,
  Check,
  ChevronRight,
  Cpu,
  Files,
  FileText,
  Layers,
  SlidersHorizontal,
  Sparkles,
  Square,
  X,
} from "lucide-react";

import { useDropdownOpen } from "../hooks/useDropdownOpen";
import { getRelevantSampleQuestions, providerOptions } from "../lib/chat";
import { CustomSelect, ScopeSelect } from "./controls";

function SamplePromptsPopover({ documents, selectedDocumentId, onSelectPrompt }) {
  const [isOpen, setIsOpen, containerRef] = useDropdownOpen();
  const sampleGroups = getRelevantSampleQuestions(documents, selectedDocumentId);

  if (sampleGroups.length === 0) {
    return null;
  }

  return (
    <div ref={containerRef} className="sample-prompts-container">
      <button
        type="button"
        className="composer-mini-btn"
        onClick={() => setIsOpen((curr) => !curr)}
        title="Browse sample questions"
        aria-label="Browse sample questions"
      >
        <BookOpen size={13} className="composer-mini-icon" />
        <span className="composer-mini-val">Sample Prompts</span>
      </button>

      <AnimatePresence>
        {isOpen ? (
          <motion.div
            className="sample-prompts-popover"
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.96 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
          >
            <div className="popover-header">
              <div>
                <strong className="popover-title">Sample Prompts</strong>
                <p className="popover-subtitle">Click a question to test grounded retrieval</p>
              </div>
              <button
                type="button"
                className="icon-button-sm"
                onClick={() => setIsOpen(false)}
                aria-label="Close sample prompts"
              >
                <X size={14} />
              </button>
            </div>

            <div className="popover-body">
              {sampleGroups.map((group, groupIdx) => {
                const docName = group.documentFilename || group.category || "";
                const ext = group.format ? group.format.toUpperCase() : docName.split(".").pop()?.toUpperCase() || "DOC";

                return (
                  <div key={groupIdx} className="popover-group">
                    <div className="popover-group-header">
                      <FileText size={13} className="popover-group-icon" />
                      <span className="popover-group-name" title={docName}>{docName}</span>
                      <span className={`popover-group-ext ext-${ext.toLowerCase()}`}>{ext}</span>
                    </div>
                    <div className="popover-question-list">
                      {group.questions.map((q, qIdx) => (
                        <button
                          key={qIdx}
                          type="button"
                          className="popover-question-item"
                          onClick={() => {
                            onSelectPrompt(q);
                            setIsOpen(false);
                          }}
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function MobileOptionsSheet({
  isOpen,
  onClose,
  documents,
  selectedDocumentId,
  onScopeChange,
  chatProvider,
  onProviderChange,
  rerankStrategy,
  onRerankStrategyChange,
  rerankStrategyOptions,
  samplePromptsEnabled,
  onSelectPrompt,
}) {
  if (!isOpen) return null;

  const sampleGroups = getRelevantSampleQuestions(documents, selectedDocumentId);
  const allPrompts = sampleGroups.flatMap((g) => g.questions).slice(0, 4);

  return (
    <div className="mobile-options-sheet-portal" role="dialog" aria-modal="true" aria-label="Chat controls">
      <motion.div
        className="mobile-options-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.div
        className="mobile-options-sheet"
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 340, damping: 32 }}
      >
        <div className="mobile-options-drag-pill" />
        <div className="mobile-options-header">
          <div>
            <h3 className="mobile-options-title">Chat Controls</h3>
            <p className="mobile-options-subtitle">Scope, model provider & retrieval parameters</p>
          </div>
          <button
            type="button"
            className="icon-button-sm mobile-options-close"
            onClick={onClose}
            aria-label="Close options"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mobile-options-body">
          {/* Document Scope */}
          <div className="mobile-options-section">
            <div className="mobile-options-section-label">
              <Files size={14} />
              <span>Document Search Scope</span>
            </div>
            <div className="mobile-options-grid mobile-options-scrollable-scope">
              <button
                type="button"
                className={`mobile-option-chip ${!selectedDocumentId ? "active" : ""}`}
                onClick={() => onScopeChange("")}
              >
                <span>All documents</span>
                {!selectedDocumentId ? <Check size={14} /> : null}
              </button>
              {documents.map((doc) => {
                const isSelected = String(doc.id) === String(selectedDocumentId);
                return (
                  <button
                    key={doc.id}
                    type="button"
                    className={`mobile-option-chip ${isSelected ? "active" : ""}`}
                    onClick={() => onScopeChange(String(doc.id))}
                  >
                    <span className="truncate">{doc.filename}</span>
                    {isSelected ? <Check size={14} /> : null}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Model Provider */}
          <div className="mobile-options-section">
            <div className="mobile-options-section-label">
              <Cpu size={14} />
              <span>Chat Model Provider</span>
            </div>
            <div className="mobile-options-grid">
              {providerOptions.map((opt) => {
                const isSelected = chatProvider === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    className={`mobile-option-chip ${isSelected ? "active" : ""}`}
                    onClick={() => onProviderChange(opt.value)}
                  >
                    <span>{opt.label}</span>
                    {isSelected ? <Check size={14} /> : null}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Rerank Strategy */}
          <div className="mobile-options-section">
            <div className="mobile-options-section-label">
              <Layers size={14} />
              <span>Rerank Strategy</span>
            </div>
            <div className="mobile-options-grid">
              {rerankStrategyOptions.map((opt) => {
                const isSelected = rerankStrategy === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    disabled={opt.disabled}
                    className={`mobile-option-chip ${isSelected ? "active" : ""}`}
                    onClick={() => onRerankStrategyChange(opt.value)}
                  >
                    <span>{opt.label}</span>
                    {isSelected ? <Check size={14} /> : null}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Sample Prompts if enabled */}
          {samplePromptsEnabled && allPrompts.length > 0 ? (
            <div className="mobile-options-section">
              <div className="mobile-options-section-label">
                <BookOpen size={14} />
                <span>Sample Prompts</span>
              </div>
              <div className="mobile-options-prompts-list">
                {allPrompts.map((q, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className="mobile-options-prompt-btn"
                    onClick={() => {
                      onSelectPrompt(q);
                      onClose();
                    }}
                  >
                    <span>{q}</span>
                    <ChevronRight size={13} className="text-muted" />
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="mobile-options-footer">
          <button
            type="button"
            className="primary-button mobile-options-done-btn"
            onClick={onClose}
          >
            Apply & Close
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function ChatComposer({
  canSend,
  documents = [],
  error,
  isProviderBlocked,
  isStreaming,
  onQuestionChange,
  onStopStreaming,
  onSubmit,
  question,
  samplePromptsEnabled = true,
  selectedDocumentId = "",
  selectedDocumentSummary = null,
  onScopeChange,
  onNavigateToDocuments,
  chatProvider = "default",
  onProviderChange,
  rerankStrategy = "default",
  onRerankStrategyChange,
  rerankStrategyOptions = [],
  selectedProviderInfo,
}) {
  const textareaRef = useRef(null);
  const [mobileOptionsOpen, setMobileOptionsOpen] = useState(false);
  const hasCustomOptions = Boolean(selectedDocumentId || chatProvider !== "default" || rerankStrategy !== "default");

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    const maxHeight = 180;
    const newHeight = Math.min(textarea.scrollHeight, maxHeight);
    textarea.style.height = `${newHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [question]);

  function handleQuestionKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onSubmit(event);
    }
  }

  return (
    <div className="composer-island-wrapper">
      <AnimatePresence>
        {mobileOptionsOpen ? (
          <MobileOptionsSheet
            isOpen={mobileOptionsOpen}
            onClose={() => setMobileOptionsOpen(false)}
            documents={documents}
            selectedDocumentId={selectedDocumentId}
            onScopeChange={onScopeChange}
            chatProvider={chatProvider}
            onProviderChange={onProviderChange}
            rerankStrategy={rerankStrategy}
            onRerankStrategyChange={onRerankStrategyChange}
            rerankStrategyOptions={rerankStrategyOptions}
            samplePromptsEnabled={samplePromptsEnabled}
            onSelectPrompt={(p) => onQuestionChange(p)}
          />
        ) : null}
      </AnimatePresence>

      <div className="composer-card">
        {isProviderBlocked && selectedProviderInfo ? (
          <p className="warning-banner">
            <AlertCircle size={16} />
            {selectedProviderInfo.missing_message}
          </p>
        ) : null}
        {error ? <p className="error-banner">{error}</p> : null}

        <form className="composer-form" onSubmit={onSubmit}>
          <div className="composer-unified-box">
            <textarea
              ref={textareaRef}
              rows={1}
              value={question}
              onChange={(event) => onQuestionChange(event.target.value)}
              onKeyDown={handleQuestionKeyDown}
              placeholder="Ask a question about your documents... (Enter to send, Shift+Enter for newline)"
              aria-label="Ask a question about your documents"
            />

            <div className="composer-inner-bar">
              {/* Mobile collective button: visible on screens < 768px */}
              <button
                type="button"
                className={`composer-mobile-options-btn ${hasCustomOptions ? "has-custom-options" : ""}`}
                onClick={() => setMobileOptionsOpen(true)}
                title="Chat controls & scope"
                aria-label="Chat controls and document scope"
              >
                <SlidersHorizontal size={14} className="composer-options-icon" />
                <span className="composer-options-label">Options</span>
                {hasCustomOptions ? <span className="composer-options-dot" /> : null}
              </button>

              {/* Compact Mini Customization Controls */}
              <div className="composer-pills-scroll-track">
                {samplePromptsEnabled ? (
                  <SamplePromptsPopover
                    documents={documents}
                    selectedDocumentId={selectedDocumentId}
                    onSelectPrompt={(promptText) => onQuestionChange(promptText)}
                  />
                ) : null}

                <ScopeSelect
                  documents={documents}
                  selectedDocumentId={selectedDocumentId}
                  selectedDocumentSummary={selectedDocumentSummary}
                  onChange={onScopeChange}
                  onManageDocuments={onNavigateToDocuments}
                  variant="mini"
                />

                <CustomSelect
                  label="Provider"
                  options={providerOptions}
                  value={chatProvider}
                  onChange={onProviderChange}
                  variant="mini"
                  icon={Cpu}
                />

                <CustomSelect
                  label="Rerank"
                  options={rerankStrategyOptions}
                  value={rerankStrategy}
                  onChange={onRerankStrategyChange}
                  variant="mini"
                  icon={Layers}
                />
              </div>

              {/* Action Button: Send / Stop */}
              <div className="composer-inner-right">
                {isStreaming ? (
                  <button
                    type="button"
                    className="composer-action-btn composer-stop-btn"
                    onClick={onStopStreaming}
                    aria-label="Stop generation"
                    title="Stop generation"
                  >
                    <Square size={14} className="fill-current" />
                  </button>
                ) : (
                  <button
                    type="submit"
                    className="composer-action-btn composer-send-btn"
                    disabled={!canSend || isProviderBlocked}
                    aria-label="Send question (Enter)"
                    title="Send question (Enter)"
                  >
                    <ArrowUp size={16} />
                  </button>
                )}
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ChatComposer;
