import { useEffect } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AlertCircle, X } from "lucide-react";

import { CustomSelect, ScopeSelect, TopKCounter } from "./controls";
import { hasSampleDocuments, providerOptions, responseModeOptions } from "../lib/chat";

function SettingsDrawer({
  open,
  onClose,
  detailsExpanded,
  onDetailsExpandedChange,
  samplePromptsEnabled,
  onSamplePromptsEnabledChange,
  onRetrievalModeChange,
  onResponseModeChange,
  onTopKChange,
  retrievalMode,
  retrievalModeOptions,
  responseMode,
  topK,
  chatProvider,
  documents,
  isProviderBlocked,
  onProviderChange,
  onRerankStrategyChange,
  onScopeChange,
  onNavigateToDocuments,
  rerankStrategy,
  rerankStrategyOptions,
  selectedDocumentId,
  selectedDocumentSummary,
}) {
  const shouldReduceMotion = useReducedMotion();
  const hasSampleDocs = hasSampleDocuments(documents);

  useEffect(() => {
    if (!open) return undefined;

    function handleEscape(event) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [open, onClose]);

  function handleNavigateToDocuments() {
    onClose?.();
    onNavigateToDocuments?.();
  }

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            className="drawer-backdrop"
            onClick={onClose}
            initial={shouldReduceMotion ? false : { opacity: 0 }}
            animate={shouldReduceMotion ? {} : { opacity: 1 }}
            exit={shouldReduceMotion ? {} : { opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          />

          <motion.aside
            className="settings-drawer"
            role="dialog"
            aria-label="Run settings"
            initial={shouldReduceMotion ? false : { x: "100%" }}
            animate={shouldReduceMotion ? {} : { x: 0 }}
            exit={shouldReduceMotion ? {} : { x: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 34, bounce: 0 }}
          >
            <div className="drawer-header">
              <div>
                <p className="eyebrow">Settings</p>
                <h3>Run controls</h3>
              </div>
              <button
                type="button"
                className="icon-button-sm drawer-close-btn"
                onClick={onClose}
                aria-label="Close settings"
                title="Close settings"
              >
                <X size={16} />
              </button>
            </div>

            <div className="drawer-body">
              <div className="drawer-section drawer-mobile-only">
                <p className="drawer-section-title">Quick controls</p>
                <CustomSelect
                  label="Chat provider"
                  options={providerOptions}
                  value={chatProvider}
                  onChange={onProviderChange}
                />
                <CustomSelect
                  label="Rerank mode"
                  options={rerankStrategyOptions}
                  value={rerankStrategy}
                  onChange={onRerankStrategyChange}
                />
                <ScopeSelect
                  variant="field"
                  label="Document scope"
                  documents={documents}
                  selectedDocumentId={selectedDocumentId}
                  selectedDocumentSummary={selectedDocumentSummary}
                  onChange={onScopeChange}
                  onManageDocuments={handleNavigateToDocuments}
                />
              </div>

              <div className="drawer-section">
                <p className="drawer-section-title">Generation</p>
                <CustomSelect
                  label="Response mode"
                  options={responseModeOptions}
                  value={responseMode}
                  onChange={onResponseModeChange}
                />
                <CustomSelect
                  label="Retrieval mode"
                  options={retrievalModeOptions}
                  value={retrievalMode}
                  onChange={onRetrievalModeChange}
                />
                <TopKCounter value={topK} onChange={onTopKChange} />
              </div>

              <div className="drawer-section">
                <p className="drawer-section-title">Display & Prompts</p>
                <label className="drawer-switch">
                  <input
                    type="checkbox"
                    checked={detailsExpanded}
                    onChange={(event) => onDetailsExpandedChange(event.target.checked)}
                  />
                  <span className="switch-track" />
                  <span className="switch-label">Expand response details by default</span>
                </label>

                <label className={`drawer-switch ${!hasSampleDocs ? "switch-disabled" : ""}`}>
                  <input
                    type="checkbox"
                    disabled={!hasSampleDocs}
                    checked={samplePromptsEnabled && hasSampleDocs}
                    onChange={(event) => onSamplePromptsEnabledChange(event.target.checked)}
                  />
                  <span className="switch-track" />
                  <span className="switch-label">Show sample question suggestions</span>
                </label>

                {!hasSampleDocs ? (
                  <p className="status-text drawer-hint">
                    No sample benchmark documents currently ingested in library.
                  </p>
                ) : null}

                {isProviderBlocked ? (
                  <p className="warning-banner">
                    <AlertCircle size={15} />
                    The selected chat provider is not configured.
                  </p>
                ) : null}
              </div>
            </div>
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  );
}

export default SettingsDrawer;
