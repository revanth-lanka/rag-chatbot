import { useId, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, ChevronDown, Files, Minus, Plus, Settings2 } from "lucide-react";

import { useDropdownOpen } from "../hooks/useDropdownOpen";

function clampTopK(value) {
  const numericValue = Number(value);

  if (Number.isNaN(numericValue)) {
    return 1;
  }

  return Math.min(10, Math.max(1, numericValue));
}

/**
 * Custom select used by the settings drawer (field variant, label above) and
 * the chat toolbar (pill variant, label inline). Options may carry a
 * `disabled` flag (used for unavailable rerank strategies).
 */
export function CustomSelect({ label, options, value, onChange, variant = "field", icon: Icon }) {
  const shouldReduceMotion = useReducedMotion();
  const [isOpen, setIsOpen, containerRef] = useDropdownOpen();
  const selectedOption = options.find((option) => String(option.value) === String(value)) || options[0];

  function handleSelect(nextValue) {
    onChange(nextValue);
    setIsOpen(false);
  }

  const menu = (
    <AnimatePresence initial={false}>
      {isOpen ? (
        <motion.div
          className={`custom-select-menu ${variant === "pill" || variant === "mini" ? "custom-select-menu-pill" : ""}`}
          role="listbox"
          initial={shouldReduceMotion ? false : { opacity: 0, y: -6, scale: 0.98 }}
          animate={shouldReduceMotion ? {} : { opacity: 1, y: 0, scale: 1 }}
          exit={shouldReduceMotion ? {} : { opacity: 0, y: -4, scale: 0.98 }}
          transition={{ duration: 0.16, ease: "easeOut" }}
        >
          {options.map((option) => {
            const isSelected = String(option.value) === String(value);

            return (
              <button
                key={option.value}
                type="button"
                className={`custom-select-option ${isSelected ? "custom-select-option-selected" : ""}`}
                role="option"
                aria-selected={isSelected}
                disabled={option.disabled}
                onClick={() => handleSelect(option.value)}
              >
                <span>{option.label}</span>
                {isSelected ? <Check size={15} /> : null}
              </button>
            );
          })}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );

  if (variant === "mini") {
    return (
      <div
        ref={containerRef}
        className={`custom-select custom-select-mini ${isOpen ? "custom-select-open" : ""}`}
      >
        <button
          type="button"
          className="custom-select-mini-trigger"
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          onClick={() => setIsOpen((current) => !current)}
          title={`${label}: ${selectedOption?.label}`}
        >
          {Icon ? <Icon size={13} className="custom-select-mini-icon" /> : null}
          <span className="custom-select-mini-val">{selectedOption?.label}</span>
          <ChevronDown size={12} className="custom-select-mini-chevron" />
        </button>
        {menu}
      </div>
    );
  }

  if (variant === "pill") {
    return (
      <div
        ref={containerRef}
        className={`custom-select custom-select-pill ${isOpen ? "custom-select-open" : ""}`}
      >
        <button
          type="button"
          className="custom-select-trigger"
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          onClick={() => setIsOpen((current) => !current)}
        >
          {Icon ? <Icon size={14} className="custom-select-icon" /> : null}
          <span className="custom-select-pill-label">{label}</span>
          <span className="custom-select-value">{selectedOption?.label}</span>
          <ChevronDown size={15} className="custom-select-chevron" />
        </button>
        {menu}
      </div>
    );
  }

  return (
    <label className="field field-select">
      <span>{label}</span>
      <div ref={containerRef} className={`custom-select ${isOpen ? "custom-select-open" : ""}`}>
        <button
          type="button"
          className="custom-select-trigger"
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          onClick={() => setIsOpen((current) => !current)}
        >
          <span className="custom-select-value">{selectedOption?.label}</span>
          <ChevronDown size={15} className="custom-select-chevron" />
        </button>
        {menu}
      </div>
    </label>
  );
}

/**
 * Scope selector listing "All documents", every loaded document, and a
 * "Manage documents" action that navigates to the documents page. Used in the
 * toolbar (pill) and the mobile section of the settings drawer (field).
 */
export function ScopeSelect({
  documents,
  selectedDocumentId,
  selectedDocumentSummary,
  onChange,
  onManageDocuments,
  variant = "pill",
  label = "Scope",
}) {
  const shouldReduceMotion = useReducedMotion();
  const [isOpen, setIsOpen, containerRef] = useDropdownOpen();
  const allDocumentsValue = "";
  const activeLabel = selectedDocumentSummary ? selectedDocumentSummary.filename : "All documents";

  function handleSelect(nextValue) {
    if (nextValue === "__manage__") {
      setIsOpen(false);
      onManageDocuments?.();
      return;
    }

    onChange(nextValue);
    setIsOpen(false);
  }

  const menu = (
    <AnimatePresence initial={false}>
      {isOpen ? (
        <motion.div
          className={`custom-select-menu ${variant === "pill" || variant === "mini" ? "custom-select-menu-pill" : ""}`}
          role="listbox"
          initial={shouldReduceMotion ? false : { opacity: 0, y: -6, scale: 0.98 }}
          animate={shouldReduceMotion ? {} : { opacity: 1, y: 0, scale: 1 }}
          exit={shouldReduceMotion ? {} : { opacity: 0, y: -4, scale: 0.98 }}
          transition={{ duration: 0.16, ease: "easeOut" }}
        >
          <button
            type="button"
            className={`custom-select-option ${
              !selectedDocumentId ? "custom-select-option-selected" : ""
            }`}
            role="option"
            aria-selected={!selectedDocumentId}
            onClick={() => handleSelect(allDocumentsValue)}
          >
            <span className="scope-option-label">
              <Files size={15} />
              All documents
            </span>
            {!selectedDocumentId ? <Check size={15} /> : null}
          </button>

          {documents.length > 0 ? <div className="custom-select-divider" /> : null}

          <div className="scope-document-group">
            {documents.map((document) => {
              const isSelected = String(document.id) === String(selectedDocumentId);

              return (
                <button
                  key={document.id}
                  type="button"
                  className={`custom-select-option scope-option ${
                    isSelected ? "custom-select-option-selected" : ""
                  }`}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => handleSelect(String(document.id))}
                >
                  <span className="scope-option-label">
                    <Files size={15} />
                    <span className="scope-option-name">{document.filename}</span>
                  </span>
                  {isSelected ? <Check size={15} /> : null}
                </button>
              );
            })}
          </div>

          <div className="custom-select-divider" />

          <button
            type="button"
            className="custom-select-option scope-manage"
            onClick={() => handleSelect("__manage__")}
          >
            <span className="scope-option-label">
              <Settings2 size={15} />
              Manage documents
            </span>
          </button>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );

  if (variant === "mini") {
    const displayDocLabel = selectedDocumentSummary
      ? (selectedDocumentSummary.filename.length > 18
          ? `${selectedDocumentSummary.filename.slice(0, 16)}...`
          : selectedDocumentSummary.filename)
      : "All docs";

    return (
      <div
        ref={containerRef}
        className={`custom-select custom-select-mini ${isOpen ? "custom-select-open" : ""}`}
      >
        <button
          type="button"
          className="custom-select-mini-trigger"
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          onClick={() => setIsOpen((current) => !current)}
          title={`Scope: ${activeLabel}`}
        >
          <Files size={13} className="custom-select-mini-icon" />
          <span className="custom-select-mini-val">{displayDocLabel}</span>
          <ChevronDown size={12} className="custom-select-mini-chevron" />
        </button>
        {menu}
      </div>
    );
  }

  if (variant === "pill") {
    return (
      <div
        ref={containerRef}
        className={`custom-select custom-select-pill ${isOpen ? "custom-select-open" : ""}`}
      >
        <button
          type="button"
          className="custom-select-trigger"
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          onClick={() => setIsOpen((current) => !current)}
        >
          <Files size={14} className="custom-select-icon" />
          <span className="custom-select-pill-label">{label}</span>
          <span className="custom-select-value">{activeLabel}</span>
          <ChevronDown size={15} className="custom-select-chevron" />
        </button>
        {menu}
      </div>
    );
  }

  return (
    <label className="field field-select">
      <span>{label}</span>
      <div ref={containerRef} className={`custom-select ${isOpen ? "custom-select-open" : ""}`}>
        <button
          type="button"
          className="custom-select-trigger"
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          onClick={() => setIsOpen((current) => !current)}
        >
          <span className="custom-select-value">{activeLabel}</span>
          <ChevronDown size={15} className="custom-select-chevron" />
        </button>
        {menu}
      </div>
    </label>
  );
}

export function TopKCounter({ onChange, value }) {
  const safeValue = clampTopK(value);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const labelId = useId();

  function updateValue(nextValue) {
    onChange(String(clampTopK(nextValue)));
  }

  return (
    <div className="field">
      <span id={labelId}>Top K</span>
      <div className={`topk-stepper ${isInputFocused ? "topk-stepper-input-focused" : ""}`}>
        <button
          type="button"
          className="topk-stepper-button topk-stepper-button-decrement"
          onClick={() => updateValue(safeValue - 1)}
          disabled={safeValue <= 1}
          aria-label="Decrease Top K"
        >
          <Minus size={14} />
        </button>

        <div className="topk-stepper-value">
          <input
            className="topk-stepper-input"
            type="number"
            min="1"
            max="10"
            inputMode="numeric"
            value={safeValue}
            aria-labelledby={labelId}
            onChange={(event) => updateValue(event.target.value)}
            onFocus={() => setIsInputFocused(true)}
            onBlur={() => setIsInputFocused(false)}
          />
        </div>

        <button
          type="button"
          className="topk-stepper-button topk-stepper-button-increment"
          onClick={() => updateValue(safeValue + 1)}
          disabled={safeValue >= 10}
          aria-label="Increase Top K"
        >
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
}
