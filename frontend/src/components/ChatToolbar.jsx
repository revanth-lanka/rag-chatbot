import { Cpu, Layers } from "lucide-react";

import { CustomSelect, ScopeSelect } from "./controls";
import { providerOptions } from "../lib/chat";

function ChatToolbar({
  chatProvider,
  documents,
  isProviderBlocked,
  onProviderChange,
  onRerankStrategyChange,
  onScopeChange,
  onNavigateToDocuments,
  providerStatus,
  rerankStrategy,
  rerankStrategyOptions,
  selectedDocumentId,
  selectedDocumentSummary,
  status,
}) {
  const statusVariant = isProviderBlocked
    ? "is-error"
    : status === "Streaming answer..." || status === "Connecting to stream..." || status === "Generating answer..."
      ? "is-busy"
      : "";

  return (
    <div className="chat-toolbar">
      <div className="chat-toolbar-inner">
        <CustomSelect
          variant="pill"
          label="Rerank"
          icon={Layers}
          options={rerankStrategyOptions}
          value={rerankStrategy}
          onChange={onRerankStrategyChange}
        />

        <CustomSelect
          variant="pill"
          label="Provider"
          icon={Cpu}
          options={providerOptions}
          value={chatProvider}
          onChange={onProviderChange}
        />

        <ScopeSelect
          variant="pill"
          label="Scope"
          documents={documents}
          selectedDocumentId={selectedDocumentId}
          selectedDocumentSummary={selectedDocumentSummary}
          onChange={onScopeChange}
          onManageDocuments={onNavigateToDocuments}
        />

        <span className="toolbar-status" title={providerStatus ? undefined : "Provider status unavailable"}>
          <span className={`toolbar-status-dot ${statusVariant}`} />
          {status}
        </span>
      </div>
    </div>
  );
}

export default ChatToolbar;
