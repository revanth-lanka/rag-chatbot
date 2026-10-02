import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import AppSidebar from "./components/AppSidebar";
import ChatComposer from "./components/ChatComposer";
import SettingsDrawer from "./components/SettingsDrawer";
import WorkspaceHeader from "./components/WorkspaceHeader";
import FullscreenDropOverlay from "./components/FullscreenDropOverlay";
import { useThemePreference } from "./hooks/useThemePreference";
import {
  clearAllChatSessions,
  deleteChatSession,
  deriveSessionTitle,
  loadChatSessions,
  renameChatSession,
  saveChatSession,
} from "./lib/history";
import {
  createMessage,
  defaultTopK,
  detailsExpandedStorageKey,
  getInitialDetailsExpanded,
  getInitialSamplePromptsEnabled,
  readErrorMessage,
  rerankStrategyOptions as baseRerankStrategyOptions,
  retrievalModeOptions as baseRetrievalModeOptions,
  samplePromptsStorageKey,
} from "./lib/chat";
import ChatPage from "./pages/ChatPage";
import DocumentsPage from "./pages/DocumentsPage";

function resolveApiBaseUrl() {
  const envUrl = import.meta.env.VITE_API_BASE_URL;
  if (typeof window !== "undefined" && window.location?.hostname) {
    const host = window.location.hostname;
    if (!envUrl) {
      return `http://${host}:8000`;
    }
    // If user accesses via a custom LAN IP (e.g. 192.168.x.x or 10.x.x.x or 127.0.0.1) but envUrl is set to localhost,
    // match the actual active host to prevent cross-device connection failures.
    if (host !== "localhost" && envUrl.includes("localhost")) {
      return `http://${host}:8000`;
    }
  }
  return envUrl || "http://localhost:8000";
}

const apiBaseUrl = resolveApiBaseUrl();

function normalizePath(pathname) {
  if (pathname === "/" || pathname === "" || pathname === "/chat") {
    return "/chat";
  }
  if (pathname === "/documents") {
    return "/documents";
  }
  return "/chat";
}

function mergeMessageLatency(message, latencyPatch) {
  return {
    ...message,
    meta: {
      ...(message.meta || {}),
      latency: {
        ...(message.meta?.latency || {}),
        ...latencyPatch,
      },
    },
  };
}

const pageVariants = {
  enter: (dir) => ({
    x: dir > 0 ? 40 : -40,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (dir) => ({
    x: dir > 0 ? -40 : 40,
    opacity: 0,
  }),
};

function AppRouter() {
  const [currentPath, setCurrentPath] = useState(() => normalizePath(window.location.pathname));
  const [transitionDirection, setTransitionDirection] = useState(1);
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    const saved = window.localStorage.getItem("rag-chatbot-sidebar-open");
    if (saved !== null) {
      return saved === "true";
    }
    if (typeof window !== "undefined") {
      return window.innerWidth >= 1024;
    }
    return true;
  });

  const [selectedDocumentId, setSelectedDocumentId] = useState("");
  const [selectedDocumentDetail, setSelectedDocumentDetail] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [documentsLoading, setDocumentsLoading] = useState(true);
  const [documentsError, setDocumentsError] = useState("");
  const [documentNotice, setDocumentNotice] = useState("All documents are selected for chat.");
  const [uploadFile, setUploadFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [deletingDocumentId, setDeletingDocumentId] = useState(null);
  const [reindexingDocumentId, setReindexingDocumentId] = useState(null);
  const [providerStatus, setProviderStatus] = useState(null);
  const [messages, setMessages] = useState(() => []);
  const [question, setQuestion] = useState("");
  const [topK, setTopK] = useState(defaultTopK);
  const [chatProvider, setChatProvider] = useState("default");
  const [retrievalMode, setRetrievalMode] = useState("default");
  const [rerankStrategy, setRerankStrategy] = useState("default");
  const [responseMode, setResponseMode] = useState("stream");
  const [isStreaming, setIsStreaming] = useState(false);
  const [status, setStatus] = useState("Ready");
  const [error, setError] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [chatSessions, setChatSessions] = useState(() => loadChatSessions());
  const [currentSessionId, setCurrentSessionId] = useState(() => `chat-${Date.now()}`);

  // Settings preferences stored in localStorage
  const [detailsExpanded, setDetailsExpanded] = useState(getInitialDetailsExpanded);
  const [samplePromptsEnabled, setSamplePromptsEnabled] = useState(getInitialSamplePromptsEnabled);

  const abortControllerRef = useRef(null);
  const uploadInputRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const { resolvedTheme, toggleTheme } = useThemePreference();

  function handleToggleSidebar() {
    setIsSidebarOpen((prev) => {
      const next = !prev;
      window.localStorage.setItem("rag-chatbot-sidebar-open", String(next));
      return next;
    });
  }

  // Auto-sync active conversation to localStorage (decoupled from active streaming to eliminate disk thrashing)
  useEffect(() => {
    if (isStreaming) return;

    const hasUserMessages = messages.some((m) => m.role === "user");
    if (!hasUserMessages) return;

    const currentDoc = documents.find((doc) => String(doc.id) === selectedDocumentId);
    const savedSessions = loadChatSessions();
    const existing = savedSessions.find((s) => s.id === currentSessionId);
    const sessionTitle = existing?.isCustomTitle && existing?.title
      ? existing.title
      : (existing?.title || deriveSessionTitle(messages));

    saveChatSession({
      id: currentSessionId,
      title: sessionTitle,
      isCustomTitle: existing?.isCustomTitle ?? false,
      updatedAt: new Date().toISOString(),
      messages,
      selectedDocumentId,
      selectedDocumentName: currentDoc?.filename || "",
    });
    setChatSessions(loadChatSessions());
  }, [messages, currentSessionId, selectedDocumentId, documents, isStreaming]);

  function handleDetailsExpandedChange(nextVal) {
    setDetailsExpanded(nextVal);
    window.localStorage.setItem(detailsExpandedStorageKey, String(nextVal));
  }

  function handleSamplePromptsEnabledChange(nextVal) {
    setSamplePromptsEnabled(nextVal);
    window.localStorage.setItem(samplePromptsStorageKey, String(nextVal));
  }

  function handleNewChat() {
    if (isStreaming) {
      abortControllerRef.current?.abort();
    }
    const nextSessionId = `chat-${Date.now()}`;
    setCurrentSessionId(nextSessionId);
    setMessages([]);
    setQuestion("");
    setError("");
    setStatus("Ready");
    if (currentPath !== "/chat") {
      navigateTo("/chat");
    }
  }

  function handleSelectSession(session) {
    if (isStreaming) {
      abortControllerRef.current?.abort();
    }
    setCurrentSessionId(session.id);
    setMessages(session.messages || []);
    if (session.selectedDocumentId !== undefined) {
      setSelectedDocumentId(session.selectedDocumentId);
    }
    setQuestion("");
    setError("");
    setStatus("Ready");
    if (currentPath !== "/chat") {
      navigateTo("/chat");
    }
  }

  function handleDeleteSession(sessionId) {
    const updated = deleteChatSession(sessionId);
    setChatSessions(updated);
    if (currentSessionId === sessionId) {
      handleNewChat();
    }
  }

  function handleClearAllSessions() {
    clearAllChatSessions();
    setChatSessions([]);
    handleNewChat();
  }

  const selectedDocumentSummary = useMemo(
    () => documents.find((document) => String(document.id) === selectedDocumentId) || null,
    [documents, selectedDocumentId],
  );

  const selectedProviderInfo = useMemo(() => {
    if (!providerStatus) return null;
    const effectiveProvider =
      chatProvider === "default" ? providerStatus.defaults.chat_provider : chatProvider;
    return (
      providerStatus.chat_providers.find((provider) => provider.name === effectiveProvider) || null
    );
  }, [chatProvider, providerStatus]);

  const rerankStrategyOptions = useMemo(() => {
    const availableStrategies = new Set(providerStatus?.reranker?.available_strategies || ["fast"]);
    return baseRerankStrategyOptions.map((option) => {
      if (option.value === "default" || availableStrategies.has(option.value)) {
        return option;
      }
      return {
        ...option,
        disabled: true,
        label: `${option.label} (Unavailable)`,
      };
    });
  }, [providerStatus]);

  const retrievalModeOptions = useMemo(() => baseRetrievalModeOptions, []);
  const canSend = question.trim().length > 0 && !isStreaming;
  const isProviderBlocked = Boolean(selectedProviderInfo && !selectedProviderInfo.configured);

  useEffect(() => {
    const nextPath = normalizePath(window.location.pathname);
    if (nextPath !== window.location.pathname) {
      window.history.replaceState({}, "", nextPath);
    }
    function handlePopState() {
      const next = normalizePath(window.location.pathname);
      setTransitionDirection(next === "/documents" ? 1 : -1);
      setCurrentPath(next);
    }
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    if (rerankStrategy === "default") return;
    const availableStrategies = new Set(providerStatus?.reranker?.available_strategies || ["fast"]);
    if (!availableStrategies.has(rerankStrategy)) {
      setRerankStrategy("default");
    }
  }, [providerStatus, rerankStrategy]);

  useEffect(() => {
    let ignore = false;
    async function loadProviderStatus() {
      try {
        const response = await fetch(`${apiBaseUrl}/providers/status`);
        if (!response.ok) return;
        const data = await response.json();
        if (!ignore) setProviderStatus(data);
      } catch {
        if (!ignore) setProviderStatus(null);
      }
    }
    loadProviderStatus();
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    void loadDocuments();
  }, []);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (container) {
      container.scrollTo({ top: 0 });
    }
    setDrawerOpen(false);
  }, [currentPath]);

  function navigateTo(path) {
    const nextPath = normalizePath(path);
    if (nextPath === currentPath) return;
    setTransitionDirection(nextPath === "/documents" ? 1 : -1);
    window.history.pushState({}, "", nextPath);
    setCurrentPath(nextPath);
  }

  async function loadDocuments(nextSelectedDocumentId = selectedDocumentId) {
    setDocumentsLoading(true);
    setDocumentsError("");

    try {
      const response = await fetch(`${apiBaseUrl}/documents`);
      if (!response.ok) {
        const detail = await readErrorMessage(response);
        throw new Error(detail || "Unable to load documents.");
      }

      const data = await response.json();
      const nextDocuments = data.documents || [];
      const hasSelectedDocument = nextSelectedDocumentId
        ? nextDocuments.some((document) => String(document.id) === String(nextSelectedDocumentId))
        : false;

      setDocuments(nextDocuments);

      if (nextSelectedDocumentId && !hasSelectedDocument) {
        setSelectedDocumentId("");
        setSelectedDocumentDetail(null);
      } else if (nextSelectedDocumentId && hasSelectedDocument) {
        await loadDocumentDetail(nextSelectedDocumentId);
      }
    } catch (loadError) {
      setDocuments([]);
      setDocumentsError(loadError.message || "Unable to load documents.");
    } finally {
      setDocumentsLoading(false);
    }
  }

  async function loadDocumentDetail(documentId) {
    try {
      const response = await fetch(`${apiBaseUrl}/documents/${documentId}`);
      if (!response.ok) {
        const detail = await readErrorMessage(response);
        throw new Error(detail || "Unable to load document details.");
      }
      const data = await response.json();
      setSelectedDocumentDetail(data);
    } catch (detailError) {
      setSelectedDocumentDetail(null);
      setDocumentsError(detailError.message || "Unable to load document details.");
    }
  }

  async function handleDocumentUpload(event) {
    event.preventDefault();
    if (!uploadFile || isUploading) return;

    setIsUploading(true);
    setDocumentsError("");
    setDocumentNotice("Uploading and parsing document...");

    const formData = new FormData();
    formData.append("file", uploadFile);

    try {
      const response = await fetch(`${apiBaseUrl}/documents/ingest/file`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const detail = await readErrorMessage(response);
        throw new Error(detail || "Unable to upload the document.");
      }

      const data = await response.json();

      setUploadFile(null);
      if (uploadInputRef.current) {
        uploadInputRef.current.value = "";
      }

      setDocumentNotice(data.message || "Document successfully ingested.");
      await loadDocuments();
    } catch (uploadError) {
      setDocumentsError(uploadError.message || "Unable to upload the document.");
      setDocumentNotice("Upload failed.");
    } finally {
      setIsUploading(false);
    }
  }

  async function handleDeleteDocument(documentItem) {
    if (deletingDocumentId) return;

    setDeletingDocumentId(documentItem.id);
    setDocumentsError("");

    try {
      const response = await fetch(`${apiBaseUrl}/documents/${documentItem.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const detail = await readErrorMessage(response);
        throw new Error(detail || "Unable to delete the document.");
      }

      const data = await response.json();
      const nextSelectedDocumentId =
        String(documentItem.id) === selectedDocumentId ? "" : selectedDocumentId;

      // Optimistically remove deleted document from local list immediately
      setDocuments((prevDocs) => prevDocs.filter((doc) => doc.id !== documentItem.id));

      if (!nextSelectedDocumentId) {
        setSelectedDocumentId("");
        setSelectedDocumentDetail(null);
        setDocumentNotice("All documents are selected for chat.");
      } else {
        setDocumentNotice(data.message);
      }

      await loadDocuments(nextSelectedDocumentId);
    } catch (deleteError) {
      setDocumentsError(deleteError.message || "Unable to delete the document.");
    } finally {
      setDeletingDocumentId(null);
    }
  }

  async function handleReindexDocument(documentId) {
    if (reindexingDocumentId) return;

    setReindexingDocumentId(documentId);
    setDocumentsError("");

    try {
      const response = await fetch(`${apiBaseUrl}/documents/${documentId}/embeddings?force=true`, {
        method: "POST",
      });

      if (!response.ok) {
        const detail = await readErrorMessage(response);
        throw new Error(detail || "Unable to re-index document embeddings.");
      }

      const data = await response.json();
      setDocumentNotice(data.message || "Re-indexing completed.");
      await loadDocuments(selectedDocumentId);
    } catch (err) {
      setDocumentsError(err.message || "Failed to re-index document embeddings.");
    } finally {
      setReindexingDocumentId(null);
    }
  }

  function handleDocumentSelection(nextDocumentId) {
    setSelectedDocumentId(nextDocumentId);
    setDocumentsError("");

    if (!nextDocumentId) {
      setSelectedDocumentDetail(null);
      setDocumentNotice("All documents are selected for chat.");
      return;
    }

    const nextDocument = documents.find((document) => String(document.id) === nextDocumentId);
    if (nextDocument) {
      setDocumentNotice(`Selected "${nextDocument.filename}" for chat.`);
    }

    void loadDocumentDetail(nextDocumentId);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!canSend) return;

    if (isProviderBlocked && selectedProviderInfo) {
      setError(selectedProviderInfo.missing_message || "The selected provider is not configured.");
      setStatus("Provider not configured");
      return;
    }

    const userActionAt = performance.now();
    const userActionEpoch = Date.now();

    const trimmedQuestion = question.trim();
    const payload = {
      question: trimmedQuestion,
      top_k: Number(topK),
    };

    if (selectedDocumentId) {
      payload.document_id = Number(selectedDocumentId);
    }
    if (chatProvider !== "default") {
      payload.provider = chatProvider;
    }
    if (rerankStrategy !== "default") {
      payload.rerank_strategy = rerankStrategy;
    }
    if (retrievalMode !== "default") {
      payload.retrieval_mode = retrievalMode;
    }

    const userMessage = createMessage("user", trimmedQuestion);
    const assistantMessage = createMessage("assistant", "", {
      isStreaming: responseMode === "stream",
      isLoading: true,
      meta: null,
    });

    setMessages((current) => [...current, userMessage, assistantMessage]);
    setQuestion("");
    setError("");
    setStatus(responseMode === "stream" ? "Connecting to stream..." : "Generating answer...");
    setIsStreaming(responseMode === "stream");

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const dispatchAt = performance.now();
    const dispatchEpoch = Date.now();
    const clientPreRequestMs = Math.round((dispatchAt - userActionAt) * 100) / 100;

    try {
      if (responseMode === "stream") {
        const response = await fetch(`${apiBaseUrl}/chat/stream`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Client-Action-Time": String(userActionEpoch),
            "X-Client-Dispatch-Time": String(dispatchEpoch),
          },
          body: JSON.stringify(payload),
          signal: abortController.signal,
        });

        const responseHeadersAt = performance.now();

        if (!response.ok || !response.body) {
          const detail = await readErrorMessage(response);
          throw new Error(detail || "Unable to start the streaming response.");
        }

        setStatus("Streaming answer...");
        await consumeStream(
          response.body,
          assistantMessage.id,
          userActionAt,
          dispatchAt,
          responseHeadersAt,
          clientPreRequestMs
        );
        setStatus("Stream complete");
      } else {
        const response = await fetch(`${apiBaseUrl}/chat/ask`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Client-Action-Time": String(userActionEpoch),
            "X-Client-Dispatch-Time": String(dispatchEpoch),
          },
          body: JSON.stringify(payload),
          signal: abortController.signal,
        });

        const responseHeadersAt = performance.now();

        if (!response.ok) {
          const detail = await readErrorMessage(response);
          throw new Error(detail || "Unable to generate the answer.");
        }

        const data = await response.json();
        const clientReceivedAt = performance.now();
        const clientPerceivedTtftMs = Math.round((clientReceivedAt - userActionAt) * 100) / 100;
        const serverTtftMs = data.latency?.total_ms || null;

        setMessages((current) =>
          current.map((message) =>
            message.id === assistantMessage.id
              ? {
                  ...message,
                  content: data.answer,
                  isStreaming: false,
                  isLoading: false,
                  meta: {
                    provider: data.provider,
                    provider_used: data.provider_used,
                    answer_path: data.answer_path,
                    retrieval_mode: data.retrieval_mode,
                    rerank_strategy: data.rerank_strategy,
                    rerank_fallback_used: data.rerank_fallback_used,
                    context_count: data.context_count,
                    context_refs: data.context_refs,
                    latency: {
                      ...data.latency,
                      user_action_at: userActionAt,
                      dispatch_at: dispatchAt,
                      response_headers_at: responseHeadersAt,
                      stage1_client_pre_request_ms: clientPreRequestMs,
                      server_ttft_ms: serverTtftMs,
                      client_perceived_ttft_ms: clientPerceivedTtftMs,
                    },
                  },
                }
              : message,
          ),
        );
        setStatus("Answer ready");
      }
    } catch (streamError) {
      if (streamError.name === "AbortError") {
        setStatus("Streaming stopped");
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantMessage.id
              ? {
                  ...message,
                  isStreaming: false,
                  isLoading: false,
                  content: message.content || "Streaming stopped before a full answer was returned.",
                }
              : message,
          ),
        );
      } else {
        const errorMsg = streamError.message || "Something went wrong while generating the answer.";
        setError(errorMsg);
        setStatus("Stream failed");
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantMessage.id
              ? {
                  ...message,
                  isStreaming: false,
                  isLoading: false,
                  isError: true,
                  errorMessage: errorMsg,
                  content:
                    message.content ||
                    errorMsg ||
                    "I could not complete the response. Check the backend and try again.",
                }
              : message,
          ),
        );
      }
    } finally {
      abortControllerRef.current = null;
      setIsStreaming(false);
    }
  }

  async function consumeStream(
    stream,
    assistantMessageId,
    userActionAt,
    dispatchAt = userActionAt,
    responseHeadersAt = dispatchAt,
    clientPreRequestMs = 0
  ) {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let firstChunkMs = null;
    let chunk0At = null;
    let streamChunk0Ms = null;
    let streamParsingLatencyMs = null;
    let currentChunkReadAt = null;
    let firstPaintAt = null;
    let firstTokenRenderLatencyMs = null;
    let clientPerceivedTtftMs = null;

    const streamTimings = {
      assistantMessageId,
      userActionAt,
      dispatchAt,
      responseHeadersAt,
      clientPreRequestMs,
      get currentChunkReadAt() {
        return currentChunkReadAt;
      },
      set currentChunkReadAt(val) {
        currentChunkReadAt = val;
      },
      get chunk0At() {
        return chunk0At;
      },
      set chunk0At(val) {
        chunk0At = val;
      },
      get streamChunk0Ms() {
        return streamChunk0Ms;
      },
      set streamChunk0Ms(val) {
        streamChunk0Ms = val;
      },
      get streamParsingLatencyMs() {
        return streamParsingLatencyMs;
      },
      set streamParsingLatencyMs(val) {
        streamParsingLatencyMs = val;
      },
      get firstPaintAt() {
        return firstPaintAt;
      },
      set firstPaintAt(val) {
        firstPaintAt = val;
      },
      get firstTokenRenderLatencyMs() {
        return firstTokenRenderLatencyMs;
      },
      set firstTokenRenderLatencyMs(val) {
        firstTokenRenderLatencyMs = val;
      },
      get clientPerceivedTtftMs() {
        return clientPerceivedTtftMs;
      },
      set clientPerceivedTtftMs(val) {
        clientPerceivedTtftMs = val;
      },
    };

    const pendingStreamUpdate = {
      delta: "",
      meta: null,
      latencyPatch: {},
      frameId: null,
      error: null,
    };

    function flushPendingStreamUpdate() {
      const nextDelta = pendingStreamUpdate.delta;
      const nextMeta = pendingStreamUpdate.meta;
      const nextLatencyPatch = pendingStreamUpdate.latencyPatch;
      const hasLatencyPatch = Object.keys(nextLatencyPatch).length > 0;

      if (!nextDelta && !nextMeta && !hasLatencyPatch) return;

      pendingStreamUpdate.delta = "";
      pendingStreamUpdate.meta = null;
      pendingStreamUpdate.latencyPatch = {};

      setMessages((current) =>
        current.map((message) => {
          if (message.id !== assistantMessageId) return message;
          let nextMessage = message;

          if (nextMeta) {
            nextMessage = {
              ...nextMessage,
              meta: {
                ...(nextMessage.meta || {}),
                ...nextMeta,
                latency: {
                  ...(nextMessage.meta?.latency || {}),
                  ...(nextMeta.latency || {}),
                },
              },
            };
          }

          if (hasLatencyPatch) {
            nextMessage = mergeMessageLatency(nextMessage, nextLatencyPatch);
          }

          if (nextDelta) {
            nextMessage = {
              ...nextMessage,
              isLoading: false,
              content: `${nextMessage.content}${nextDelta}`,
            };
          }

          return nextMessage;
        }),
      );
    }

    function scheduleStreamUpdate() {
      if (pendingStreamUpdate.frameId !== null) return;
      pendingStreamUpdate.frameId = window.requestAnimationFrame(() => {
        pendingStreamUpdate.frameId = null;
        flushPendingStreamUpdate();
      });
    }

    while (true) {
      let readResult;
      try {
        readResult = await reader.read();
      } catch (readErr) {
        pendingStreamUpdate.error = readErr.message || "Streaming connection was interrupted.";
        break;
      }

      const { done, value } = readResult;
      if (streamTimings.currentChunkReadAt === null) {
        streamTimings.currentChunkReadAt = performance.now();
      }
      if (done) {
        if (buffer.trim()) {
          firstChunkMs = processEvents(
            buffer,
            streamTimings,
            firstChunkMs,
            pendingStreamUpdate,
            scheduleStreamUpdate,
            flushPendingStreamUpdate,
          );
        }
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() || "";

      for (const eventBlock of events) {
        firstChunkMs = processEvents(
          eventBlock,
          streamTimings,
          firstChunkMs,
          pendingStreamUpdate,
          scheduleStreamUpdate,
          flushPendingStreamUpdate,
        );
      }
    }

    if (pendingStreamUpdate.frameId !== null) {
      window.cancelAnimationFrame(pendingStreamUpdate.frameId);
      pendingStreamUpdate.frameId = null;
    }
    flushPendingStreamUpdate();

    const streamTotalMs = Math.round(performance.now() - userActionAt);

    setMessages((current) =>
      current.map((message) => {
        if (message.id !== assistantMessageId) return message;
        const existingLatency = message.meta?.latency || {};
        const serverTtft =
          existingLatency.server_first_chunk_ms ||
          existingLatency.server_ttft_ms ||
          existingLatency.stage_timings?.server_ttft_ms ||
          null;

        const networkTransitToClientMs =
          serverTtft && streamChunk0Ms
            ? Math.max(0.1, Math.round((streamChunk0Ms - serverTtft) * 100) / 100)
            : null;

        const effectivePerceivedTtft =
          clientPerceivedTtftMs ||
          (firstPaintAt ? Math.round((firstPaintAt - userActionAt) * 100) / 100 : firstChunkMs);

        const waterfallTimings = {
          stage1_client_pre_request_ms: clientPreRequestMs,
          stage2_network_transit_to_backend_ms:
            existingLatency.stage_timings?.stage2_client_network_transit_ms ?? null,
          stage3_backend_acceptance_ms:
            existingLatency.stage_timings?.stage3_backend_acceptance_ms ?? null,
          stage4_history_query_ms:
            existingLatency.stage_timings?.stage4_history_query_ms ?? 0.0,
          stage5_query_preprocessing_embedding_ms:
            existingLatency.stage_timings?.stage5_query_preprocessing_embedding_ms ?? null,
          stage6_pgvector_similarity_search_ms:
            existingLatency.stage_timings?.stage6_pgvector_similarity_search_ms ?? null,
          stage7_reranking_ms:
            existingLatency.stage_timings?.stage7_reranking_ms ?? null,
          stage8_prompt_assembly_ms:
            existingLatency.stage_timings?.stage8_prompt_assembly_ms ?? null,
          stage9_llm_handshake_ttft_ms:
            existingLatency.stage_timings?.stage9_llm_handshake_ttft_ms ?? null,
          stage10_llm_generation_ms: existingLatency.llm_generation_ms ?? null,
          stage11_server_first_chunk_dispatch_ms:
            existingLatency.stage_timings?.stage11_server_first_chunk_dispatch_ms ?? serverTtft,
          stage12_network_transit_to_client_ms: networkTransitToClientMs,
          stage13_frontend_stream_parsing_ms: streamParsingLatencyMs,
          stage14_frontend_first_token_render_ms: firstTokenRenderLatencyMs,
          server_ttft_ms: serverTtft,
          client_perceived_ttft_ms: effectivePerceivedTtft,
        };

        const hasContent = Boolean(message.content && message.content.trim());
        const hasError = Boolean(pendingStreamUpdate.error);
        const finalContent = hasContent
          ? message.content
          : (pendingStreamUpdate.error || "The provider was unable to generate a response (e.g. rate limit reached or connection closed). Please try again in a moment.");
        const isError = !hasContent || hasError;

        return {
          ...mergeMessageLatency(message, {
            user_action_at: userActionAt,
            dispatch_at: dispatchAt,
            response_headers_at: responseHeadersAt,
            chunk0_at: chunk0At,
            first_paint_at: firstPaintAt,
            stage1_client_pre_request_ms: clientPreRequestMs,
            stage12_network_transit_to_client_ms: networkTransitToClientMs,
            stage13_frontend_stream_parsing_ms: streamParsingLatencyMs,
            stage14_first_token_render_ms: firstTokenRenderLatencyMs,
            server_ttft_ms: serverTtft,
            client_perceived_ttft_ms: effectivePerceivedTtft,
            stream_total_ms: streamTotalMs,
            waterfall_timings: waterfallTimings,
            ...(firstChunkMs !== null ? { stream_first_chunk_ms: firstChunkMs } : {}),
          }),
          content: finalContent,
          isStreaming: false,
          isLoading: false,
          isError,
          errorMessage: pendingStreamUpdate.error || (isError ? finalContent : null),
        };
      })
    );
  }

  function processEvents(
    eventBlock,
    streamTimings,
    firstChunkMs,
    pendingStreamUpdate,
    scheduleStreamUpdate,
    flushPendingStreamUpdate,
  ) {
    const parseStart = performance.now();
    const lines = eventBlock.split("\n").filter(Boolean);
    let eventName = "message";
    const dataLines = [];

    for (const line of lines) {
      if (line.startsWith("event:")) {
        eventName = line.slice(6).trim();
      }
      if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trim());
      }
    }

    if (dataLines.length === 0) return firstChunkMs;

    let payload;
    try {
      payload = JSON.parse(dataLines.join("\n"));
    } catch {
      payload = { message: dataLines.join("\n") };
    }

    if (eventName === "error") {
      const errorMsg = payload.message || payload.error || "Provider error occurred.";
      pendingStreamUpdate.error = errorMsg;
      setStatus(errorMsg);
      setMessages((current) =>
        current.map((msg) =>
          msg.id === streamTimings.assistantMessageId
            ? {
                ...msg,
                isLoading: false,
                isStreaming: false,
                isError: true,
                errorMessage: errorMsg,
                content: msg.content
                  ? `${msg.content}\n\n[Warning: Stream interrupted: ${errorMsg}]`
                  : errorMsg,
              }
            : msg
        )
      );
      return firstChunkMs;
    }

    if (eventName === "metadata") {
      pendingStreamUpdate.meta = {
        ...(pendingStreamUpdate.meta || {}),
        ...payload,
        latency: {
          ...(pendingStreamUpdate.meta?.latency || {}),
          ...(payload.latency || {}),
          stage_timings: payload.stage_timings || payload.latency?.stage_timings,
          server_ttft_ms: payload.server_ttft_ms || payload.latency?.server_first_chunk_ms,
        },
        stage_timings: payload.stage_timings || payload.latency?.stage_timings,
      };
      // Flush metadata immediately so the waiting indicator reflects context retrieval without rAF lag
      if (flushPendingStreamUpdate) {
        flushPendingStreamUpdate();
      } else {
        scheduleStreamUpdate();
      }
      return firstChunkMs;
    }

    if (eventName === "chunk") {
      const isFirst = firstChunkMs === null;
      let nextFirstChunkMs = firstChunkMs;

      if (isFirst) {
        const now = performance.now();
        streamTimings.chunk0At = now;
        streamTimings.streamChunk0Ms = Math.round((now - streamTimings.dispatchAt) * 100) / 100;
        const readBase = streamTimings.currentChunkReadAt || parseStart;
        streamTimings.streamParsingLatencyMs =
          Math.max(0.1, Math.round((now - readBase) * 100) / 100);
        nextFirstChunkMs = Math.round(now - streamTimings.userActionAt);

        // Schedule double-rAF measurement for visual paint
        if (typeof window !== "undefined" && window.requestAnimationFrame) {
          window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => {
              const paintNow = performance.now();
              streamTimings.firstPaintAt = paintNow;
              streamTimings.firstTokenRenderLatencyMs = Math.round((paintNow - now) * 100) / 100;
              streamTimings.clientPerceivedTtftMs =
                Math.round((paintNow - streamTimings.userActionAt) * 100) / 100;

              setMessages((current) =>
                current.map((msg) =>
                  msg.id === streamTimings.assistantMessageId
                    ? mergeMessageLatency(msg, {
                        client_first_paint_at: paintNow,
                        stage14_first_token_render_ms: streamTimings.firstTokenRenderLatencyMs,
                        client_perceived_ttft_ms: streamTimings.clientPerceivedTtftMs,
                      })
                    : msg
                )
              );
            });
          });
        }
      }

      pendingStreamUpdate.delta += payload.delta;

      if (isFirst) {
        pendingStreamUpdate.latencyPatch = {
          ...pendingStreamUpdate.latencyPatch,
          stream_first_chunk_ms: nextFirstChunkMs,
          chunk0_at: streamTimings.chunk0At,
          stream_chunk0_ms: streamTimings.streamChunk0Ms,
          stage13_frontend_stream_parsing_ms: streamTimings.streamParsingLatencyMs,
          ...(payload.server_chunk_ms ? { server_ttft_ms: payload.server_chunk_ms } : {}),
        };
        // Immediate synchronous dispatch for chunk 0: eliminate 8.3-16.7ms of artificial rAF delay on Client-Perceived TTFT
        if (flushPendingStreamUpdate) {
          flushPendingStreamUpdate();
        } else {
          scheduleStreamUpdate();
        }
      } else {
        scheduleStreamUpdate();
      }

      return nextFirstChunkMs;
    }

    if (eventName === "done") {
      setStatus(payload.message || "Stream complete");
      if (payload.llm_generation_ms) {
        pendingStreamUpdate.latencyPatch = {
          ...pendingStreamUpdate.latencyPatch,
          llm_generation_ms: payload.llm_generation_ms,
        };
      }
    }

    return firstChunkMs;
  }

  function stopStreaming() {
    abortControllerRef.current?.abort();
  }

  const isChat = currentPath === "/chat";

  const currentSession = useMemo(
    () => chatSessions.find((s) => s.id === currentSessionId),
    [chatSessions, currentSessionId]
  );

  const activeConversationTitle = useMemo(() => {
    if (currentSession?.title) return currentSession.title;
    if (messages.length > 0) return deriveSessionTitle(messages);
    return "";
  }, [currentSession, messages]);

  function handleRenameSession(newTitle) {
    if (!newTitle || !newTitle.trim()) return;
    const trimmed = newTitle.trim();
    const currentDoc = documents.find((doc) => String(doc.id) === selectedDocumentId);
    saveChatSession({
      id: currentSessionId,
      title: trimmed,
      isCustomTitle: true,
      updatedAt: new Date().toISOString(),
      messages,
      selectedDocumentId,
      selectedDocumentName: currentDoc?.filename || "",
    });
    const updated = renameChatSession(currentSessionId, trimmed);
    setChatSessions(updated);
  }

  return (
    <div className={`app-shell ${isSidebarOpen ? "with-sidebar-open" : "with-sidebar-collapsed"}`}>
      <div className="ambient-glow ambient-glow-left" />
      <div className="ambient-glow ambient-glow-right" />

      {/* Modern Collapsible Left Sidebar */}
      <AppSidebar
        currentPath={currentPath}
        onNavigate={navigateTo}
        onNewChat={handleNewChat}
        sessions={chatSessions}
        currentSessionId={currentSessionId}
        onSelectSession={handleSelectSession}
        onDeleteSession={handleDeleteSession}
        onClearAllSessions={handleClearAllSessions}
        isOpen={isSidebarOpen}
        onToggle={handleToggleSidebar}
      />

      {/* Main Workspace Column */}
      <div className="workspace-main-column">
        {/* Minimal Top Header */}
        <WorkspaceHeader
          currentPath={currentPath}
          status={status}
          activeTitle={activeConversationTitle}
          onRenameTitle={handleRenameSession}
          hasActiveChat={isChat && messages.length > 0}
          onToggleTheme={toggleTheme}
          onOpenSettings={() => setDrawerOpen(true)}
          resolvedTheme={resolvedTheme}
          onToggleSidebar={handleToggleSidebar}
          isSidebarOpen={isSidebarOpen}
        />

        {/* Scrollable Content Region with Directional Slide Transition */}
        <div className="app-scroll-region" ref={scrollContainerRef}>
          <div className="app-scroll-inner">
            <AnimatePresence mode="wait" custom={transitionDirection} initial={false}>
              <motion.div
                key={currentPath}
                custom={transitionDirection}
                variants={pageVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                className="page-transition-wrapper"
              >
                {currentPath === "/documents" ? (
                  <DocumentsPage
                    deletingDocumentId={deletingDocumentId}
                    documentNotice={documentNotice}
                    documents={documents}
                    documentsError={documentsError}
                    documentsLoading={documentsLoading}
                    isUploading={isUploading}
                    onDeleteDocument={handleDeleteDocument}
                    onNavigateToChat={() => navigateTo("/chat")}
                    onReindexDocument={handleReindexDocument}
                    reindexingDocumentId={reindexingDocumentId}
                    onRefresh={() => loadDocuments()}
                    onSelectDocument={handleDocumentSelection}
                    onUpload={handleDocumentUpload}
                    onUploadFileChange={setUploadFile}
                    onUseAllDocuments={() => handleDocumentSelection("")}
                    selectedDocumentDetail={selectedDocumentDetail}
                    selectedDocumentId={selectedDocumentId}
                    uploadFile={uploadFile}
                    uploadInputRef={uploadInputRef}
                    apiBaseUrl={apiBaseUrl}
                  />
                ) : (
                  <ChatPage
                    detailsExpanded={detailsExpanded}
                    documents={documents}
                    isStreaming={isStreaming}
                    messages={messages}
                    onQuestionChange={setQuestion}
                    samplePromptsEnabled={samplePromptsEnabled}
                    selectedDocumentId={selectedDocumentId}
                    scrollContainerRef={scrollContainerRef}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {/* Floating Island Composer (Chat Only) */}
        {isChat ? (
          <ChatComposer
            canSend={canSend}
            documents={documents}
            error={error}
            isProviderBlocked={isProviderBlocked}
            isStreaming={isStreaming}
            onQuestionChange={setQuestion}
            onStopStreaming={stopStreaming}
            onSubmit={handleSubmit}
            question={question}
            samplePromptsEnabled={samplePromptsEnabled}
            selectedDocumentId={selectedDocumentId}
            selectedDocumentSummary={selectedDocumentSummary}
            onScopeChange={handleDocumentSelection}
            onNavigateToDocuments={() => navigateTo("/documents")}
            chatProvider={chatProvider}
            onProviderChange={setChatProvider}
            rerankStrategy={rerankStrategy}
            onRerankStrategyChange={setRerankStrategy}
            rerankStrategyOptions={rerankStrategyOptions}
            selectedProviderInfo={selectedProviderInfo}
          />
        ) : null}
      </div>

      {/* Settings Drawer */}
      <SettingsDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        detailsExpanded={detailsExpanded}
        onDetailsExpandedChange={handleDetailsExpandedChange}
        samplePromptsEnabled={samplePromptsEnabled}
        onSamplePromptsEnabledChange={handleSamplePromptsEnabledChange}
        onRetrievalModeChange={setRetrievalMode}
        onResponseModeChange={setResponseMode}
        onTopKChange={setTopK}
        retrievalMode={retrievalMode}
        retrievalModeOptions={retrievalModeOptions}
        responseMode={responseMode}
        topK={topK}
        chatProvider={chatProvider}
        documents={documents}
        isProviderBlocked={isProviderBlocked}
        onProviderChange={setChatProvider}
        onRerankStrategyChange={setRerankStrategy}
        onScopeChange={handleDocumentSelection}
        onNavigateToDocuments={() => {
          setDrawerOpen(false);
          navigateTo("/documents");
        }}
        rerankStrategy={rerankStrategy}
        rerankStrategyOptions={rerankStrategyOptions}
        selectedDocumentId={selectedDocumentId}
        selectedDocumentSummary={selectedDocumentSummary}
      />

      {/* Global Full-Screen Drag and Drop Overlay (Chat & Documents) */}
      <FullscreenDropOverlay
        onDropFile={(file) => {
          setUploadFile(file);
          navigateTo("/documents");
        }}
      />
    </div>
  );
}

export default AppRouter;
