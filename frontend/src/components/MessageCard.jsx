import { memo, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  Copy,
  Cpu,
  FileStack,
  Layers,
  Zap,
} from "lucide-react";

import {
  formatDate,
  formatLatency,
  formatRerankStrategyLabel,
  formatRetrievalModeLabel,
  formatSimilarity,
  formatTime,
  getFileBadgeInfo,
  parseMarkdownBlocks,
} from "../lib/chat";

function CodeBlock({ code, lang }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="markdown-code-card">
      <div className="code-card-header">
        <span className="code-lang-badge">{lang || "code"}</span>
        <button
          type="button"
          className="code-copy-button"
          onClick={handleCopy}
          aria-label="Copy code block"
        >
          {copied ? <Check size={13} className="text-success" /> : <Copy size={13} />}
          <span>{copied ? "Copied!" : "Copy code"}</span>
        </button>
      </div>
      <pre className="code-card-body">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function renderInlineText(text) {
  if (!text) return "";
  const parts = [];
  const regex = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith("**") && token.endsWith("**")) {
      parts.push(<strong key={match.index}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("`") && token.endsWith("`")) {
      parts.push(
        <code key={match.index} className="inline-code">
          {token.slice(1, -1)}
        </code>
      );
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts.length > 0 ? parts : text;
}

function RenderedMarkdown({ content }) {
  const blocks = useMemo(() => parseMarkdownBlocks(content), [content]);

  if (blocks.length === 0) {
    return <p className="message-content">{content || "No response received."}</p>;
  }

  return (
    <div className="markdown-body">
      {blocks.map((block, idx) => {
        if (block.type === "code") {
          return <CodeBlock key={idx} code={block.codeLines.join("\n")} lang={block.lang} />;
        }

        if (block.type === "header") {
          const Tag = block.level === 1 ? "h3" : block.level === 2 ? "h4" : "h5";
          return <Tag key={idx} className="markdown-header">{renderInlineText(block.text)}</Tag>;
        }

        if (block.type === "list") {
          const Tag = block.isNum ? "ol" : "ul";
          return (
            <Tag key={idx} className="markdown-list">
              {block.items.map((item, itemIdx) => (
                <li key={itemIdx}>{renderInlineText(item)}</li>
              ))}
            </Tag>
          );
        }

        if (block.type === "quote") {
          return (
            <blockquote key={idx} className="markdown-quote">
              {renderInlineText(block.text)}
            </blockquote>
          );
        }

        return (
          <p key={idx} className="message-content">
            {renderInlineText(block.text)}
          </p>
        );
      })}
    </div>
  );
}

function CitationCard({ refItem }) {
  const [expanded, setExpanded] = useState(false);
  const badgeInfo = getFileBadgeInfo(refItem.filename);
  const similarityFormatted = formatSimilarity(refItem.similarity_score);
  const similarityPercent = refItem.similarity_score
    ? Math.min(100, Math.max(0, Math.round(Number(refItem.similarity_score) * 100)))
    : null;

  return (
    <div className="citation-card">
      <button
        type="button"
        className="citation-card-header"
        onClick={() => setExpanded((curr) => !curr)}
        aria-expanded={expanded}
      >
        <span className={`file-badge ${badgeInfo.badgeClass}`}>{badgeInfo.label}</span>
        <div className="citation-info">
          <strong className="citation-filename">{refItem.filename}</strong>
          <span className="citation-meta">Chunk {refItem.chunk_index}</span>
        </div>

        {similarityPercent !== null ? (
          <div className="citation-score-block">
            <span className="citation-score-text">{similarityFormatted} match</span>
            <div className="citation-score-track">
              <div className="citation-score-fill" style={{ width: `${similarityPercent}%` }} />
            </div>
          </div>
        ) : null}

        <ChevronRight
          size={14}
          className={`citation-chevron ${expanded ? "citation-chevron-open" : ""}`}
        />
      </button>

      <AnimatePresence>
        {expanded && refItem.chunk_text ? (
          <motion.div
            className="citation-excerpt-body"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            <p className="excerpt-text">{refItem.chunk_text}</p>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function MessageMetadata({ meta }) {
  if (!meta) return null;

  const totalLatency = meta.latency?.total_ms;
  const retrievalLatency = meta.latency?.retrieval?.total_ms;
  const rerankLatency = meta.latency?.rerank_ms;
  const generationLatency = meta.latency?.llm_generation_ms;
  const serverTtft =
    meta.latency?.server_ttft_ms ||
    meta.latency?.server_first_chunk_ms ||
    meta.stage_timings?.server_ttft_ms ||
    meta.latency?.stage_timings?.server_ttft_ms;
  const clientTtft =
    meta.latency?.client_perceived_ttft_ms ||
    meta.latency?.stream_first_chunk_ms;
  const waterfall =
    meta.latency?.waterfall_timings ||
    meta.stage_timings ||
    meta.latency?.stage_timings;

  const sourceRefs = meta.context_refs || [];
  const providerUsed = meta.provider_used !== false;
  const retrievalMode = meta.retrieval_mode;
  const rerankStrategy = meta.rerank_strategy;

  const answerOriginLabel = providerUsed ? meta.provider : "No provider call";
  const rerankLabel = rerankStrategy ? `Rerank ${formatRerankStrategyLabel(rerankStrategy)}` : null;
  const retrievalLabel = retrievalMode ? `Retrieval ${formatRetrievalModeLabel(retrievalMode)}` : null;
  const totalLabel = totalLatency ? formatLatency(totalLatency) : null;

  return (
    <motion.div
      className="details-groups"
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
    >
      <div className="detail-group">
        <span className="detail-group-title">Model & Pipeline</span>
        <div className="detail-group-items">
          {answerOriginLabel ? (
            <span className="meta-chip">
              <Cpu size={13} /> {answerOriginLabel}
            </span>
          ) : null}
          {rerankLabel ? (
            <span className="meta-chip">
              <Layers size={13} /> {rerankLabel}
            </span>
          ) : null}
          {retrievalLabel ? (
            <span className="meta-chip">
              <FileStack size={13} /> {retrievalLabel}
            </span>
          ) : null}
        </div>
      </div>

      {sourceRefs.length > 0 ? (
        <div className="detail-group">
          <span className="detail-group-title">Grounding Sources ({sourceRefs.length})</span>
          <div className="citation-grid">
            {sourceRefs.map((ref, idx) => (
              <CitationCard key={`${ref.chunk_id || idx}-${ref.chunk_index}`} refItem={ref} />
            ))}
          </div>
        </div>
      ) : null}

      <div className="detail-group">
        <span className="detail-group-title">Performance Timings</span>
        <div className="detail-group-items">
          {totalLabel ? (
            <span className="meta-chip chip-accent">
              <Clock3 size={13} /> <span className="chip-value">Total {totalLabel}</span>
            </span>
          ) : null}
          {serverTtft ? (
            <span className="meta-chip" title="Server First Chunk Dispatch (Stages 3-11)">
              <Zap size={13} /> <span className="chip-value">Server TTFT {formatLatency(serverTtft)}</span>
            </span>
          ) : null}
          {clientTtft && clientTtft !== serverTtft ? (
            <span className="meta-chip chip-accent" title="Client-Perceived First Token Render (Stages 1-14)">
              <Zap size={13} /> <span className="chip-value">Client TTFT {formatLatency(clientTtft)}</span>
            </span>
          ) : null}
          {retrievalLatency ? (
            <span className="meta-chip">
              <Clock3 size={13} /> <span className="chip-value">Retrieval {formatLatency(retrievalLatency)}</span>
            </span>
          ) : null}
          {rerankLatency ? (
            <span className="meta-chip">
              <Clock3 size={13} /> <span className="chip-value">Rerank {formatLatency(rerankLatency)}</span>
            </span>
          ) : null}
          {generationLatency ? (
            <span className="meta-chip">
              <Clock3 size={13} /> <span className="chip-value">Gen {formatLatency(generationLatency)}</span>
            </span>
          ) : null}
        </div>
      </div>

      {waterfall ? (
        <div className="detail-group">
          <span className="detail-group-title">14-Stage Latency Waterfall</span>
          <div className="detail-group-items">
            {waterfall.stage1_client_pre_request_ms !== undefined &&
            waterfall.stage1_client_pre_request_ms !== null ? (
              <span className="meta-chip" title="Stage 1: User Action to Request Dispatch">
                <Clock3 size={13} />{" "}
                <span className="chip-value">
                  S1 Pre-Req {formatLatency(waterfall.stage1_client_pre_request_ms)}
                </span>
              </span>
            ) : null}
            {waterfall.stage2_network_transit_to_backend_ms ||
            waterfall.stage2_client_network_transit_ms ? (
              <span className="meta-chip" title="Stage 2: Network Transit to Backend">
                <Clock3 size={13} />{" "}
                <span className="chip-value">
                  S2 Net Up{" "}
                  {formatLatency(
                    waterfall.stage2_network_transit_to_backend_ms ||
                      waterfall.stage2_client_network_transit_ms
                  )}
                </span>
              </span>
            ) : null}
            {waterfall.stage3_backend_acceptance_ms ? (
              <span className="meta-chip" title="Stage 3: Backend Acceptance & Auth/Session">
                <Clock3 size={13} />{" "}
                <span className="chip-value">
                  S3 Accept {formatLatency(waterfall.stage3_backend_acceptance_ms)}
                </span>
              </span>
            ) : null}
            {waterfall.stage5_query_preprocessing_embedding_ms ? (
              <span className="meta-chip" title="Stage 5: Query Preprocessing & Embedding">
                <Clock3 size={13} />{" "}
                <span className="chip-value">
                  S5 Embed {formatLatency(waterfall.stage5_query_preprocessing_embedding_ms)}
                </span>
              </span>
            ) : null}
            {waterfall.stage6_pgvector_similarity_search_ms ? (
              <span className="meta-chip" title="Stage 6: pgvector Similarity Search">
                <Clock3 size={13} />{" "}
                <span className="chip-value">
                  S6 Search {formatLatency(waterfall.stage6_pgvector_similarity_search_ms)}
                </span>
              </span>
            ) : null}
            {waterfall.stage7_reranking_ms ? (
              <span className="meta-chip" title="Stage 7: Reranking Duration">
                <Clock3 size={13} />{" "}
                <span className="chip-value">
                  S7 Rerank {formatLatency(waterfall.stage7_reranking_ms)}
                </span>
              </span>
            ) : null}
            {waterfall.stage8_prompt_assembly_ms ? (
              <span className="meta-chip" title="Stage 8: Prompt Assembly & Context Compaction">
                <Clock3 size={13} />{" "}
                <span className="chip-value">
                  S8 Prompt {formatLatency(waterfall.stage8_prompt_assembly_ms)}
                </span>
              </span>
            ) : null}
            {waterfall.stage9_llm_handshake_ttft_ms ? (
              <span className="meta-chip" title="Stage 9: LLM Connection Handshake & TTFT">
                <Zap size={13} />{" "}
                <span className="chip-value">
                  S9 LLM TTFT {formatLatency(waterfall.stage9_llm_handshake_ttft_ms)}
                </span>
              </span>
            ) : null}
            {waterfall.stage12_network_transit_to_client_ms ? (
              <span className="meta-chip" title="Stage 12: Network Transit to Client">
                <Clock3 size={13} />{" "}
                <span className="chip-value">
                  S12 Net Down {formatLatency(waterfall.stage12_network_transit_to_client_ms)}
                </span>
              </span>
            ) : null}
            {waterfall.stage13_frontend_stream_parsing_ms ? (
              <span className="meta-chip" title="Stage 13: Frontend Stream Parsing Latency">
                <Clock3 size={13} />{" "}
                <span className="chip-value">
                  S13 Parse {formatLatency(waterfall.stage13_frontend_stream_parsing_ms)}
                </span>
              </span>
            ) : null}
            {waterfall.stage14_frontend_first_token_render_ms ? (
              <span className="meta-chip" title="Stage 14: Frontend First Token Render Latency">
                <Zap size={13} />{" "}
                <span className="chip-value">
                  S14 Paint {formatLatency(waterfall.stage14_frontend_first_token_render_ms)}
                </span>
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
    </motion.div>
  );
}

function TypingIndicator() {
  return (
    <span className="typing-indicator" aria-label="Assistant is responding">
      <span />
      <span />
      <span />
    </span>
  );
}

function areMessageCardPropsEqual(prevProps, nextProps) {
  if (prevProps.isDetailsOpen !== nextProps.isDetailsOpen) return false;
  if (prevProps.isCopied !== nextProps.isCopied) return false;
  if (prevProps.index !== nextProps.index) return false;
  if (prevProps.totalMessages !== nextProps.totalMessages) return false;
  if (prevProps.onToggleDetails !== nextProps.onToggleDetails) return false;
  if (prevProps.onCopyMessage !== nextProps.onCopyMessage) return false;

  const prevMsg = prevProps.message;
  const nextMsg = nextProps.message;

  if (prevMsg === nextMsg) return true;
  if (prevMsg.id !== nextMsg.id) return false;
  if (prevMsg.content !== nextMsg.content) return false;
  if (prevMsg.isLoading !== nextMsg.isLoading) return false;
  if (prevMsg.isStreaming !== nextMsg.isStreaming) return false;
  if (prevMsg.isError !== nextMsg.isError) return false;
  if (prevMsg.errorMessage !== nextMsg.errorMessage) return false;
  if (prevMsg.role !== nextMsg.role) return false;
  if (prevMsg.meta !== nextMsg.meta) return false;

  return true;
}

const MessageCard = memo(function MessageCard({
  message,
  index,
  totalMessages,
  isDetailsOpen,
  onToggleDetails,
  isCopied,
  onCopyMessage,
}) {
  const isAssistant = message.role === "assistant";
  const showWaitingState = Boolean(message.isLoading && !message.content);
  const showStreamingState = Boolean(message.isStreaming);
  const meta = message.meta;

  const totalLatencyFormatted = meta?.latency?.total_ms
    ? formatLatency(meta.latency.total_ms)
    : meta?.latency?.client_perceived_ttft_ms
    ? `TTFT ${formatLatency(meta.latency.client_perceived_ttft_ms)}`
    : meta?.latency?.server_ttft_ms
    ? `TTFT ${formatLatency(meta.latency.server_ttft_ms)}`
    : meta?.latency?.stream_first_chunk_ms
    ? `TTFT ${formatLatency(meta.latency.stream_first_chunk_ms)}`
    : null;

  const sourceCount = meta?.context_count || (meta?.context_refs?.length || 0);

  return (
    <motion.article
      id={`message-${message.id}`}
      data-message-id={message.id}
      className={`message-card message-${message.role}`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.22,
        ease: "easeOut",
        delay: index > totalMessages - 3 ? 0.03 : 0,
      }}
    >
      {isAssistant ? (
        <>
          <div className="message-header">
            <div className="message-author">
              <span className="message-avatar message-avatar-assistant">
                <Bot size={14} />
              </span>
              <div className="message-author-meta">
                <strong>Assistant</strong>
                <span className="message-author-time">{formatTime(message.createdAt)}</span>
              </div>
            </div>

            {showStreamingState ? (
              <span className="stream-badge" aria-label="Streaming response in progress">
                <span className="stream-badge-dot" />
                Streaming
              </span>
            ) : null}
          </div>

          {showWaitingState ? (
            <div className="message-content message-content-waiting">
              <TypingIndicator />
              {showStreamingState ? (
                <span className="typing-text">
                  {meta
                    ? "Context retrieved. Generating response..."
                    : "Retrieving context and streaming answer..."}
                </span>
              ) : null}
            </div>
          ) : message.isError ? (
            <div className="message-error-card" role="alert">
              <div className="message-error-header">
                <AlertTriangle size={15} className="message-error-icon" />
                <span className="message-error-title">Provider Error</span>
              </div>
              <p className="message-error-desc">
                {message.content || message.errorMessage || "An unexpected error occurred while communicating with the provider."}
              </p>
            </div>
          ) : (
            <RenderedMarkdown content={message.content} />
          )}

          {message.content ? (
            <div className="assistant-card-footer">
              {meta && !message.isError ? (
                <button
                  type="button"
                  className="response-disclosure-toggle"
                  onClick={() => onToggleDetails(message.id)}
                  aria-expanded={isDetailsOpen}
                  title="Click to toggle sources and pipeline breakdown"
                >
                  <ChevronDown
                    size={13}
                    className={`disclosure-chevron ${isDetailsOpen ? "disclosure-chevron-open" : ""}`}
                  />
                  <span className="disclosure-text">
                    {sourceCount > 0
                      ? `${sourceCount} source${sourceCount === 1 ? "" : "s"} cited`
                      : "Response details"}
                  </span>
                  {totalLatencyFormatted ? (
                    <>
                      <span className="disclosure-sep">·</span>
                      <span className="disclosure-timing">{totalLatencyFormatted}</span>
                    </>
                  ) : null}
                </button>
              ) : (
                <div />
              )}

              <button
                type="button"
                className="message-action-button"
                onClick={() => onCopyMessage(message.id, message.content)}
                title="Copy assistant response"
                aria-label="Copy assistant response"
              >
                {isCopied ? (
                  <Check size={12} className="text-success" />
                ) : (
                  <Copy size={12} />
                )}
                <span>{isCopied ? "Copied!" : "Copy"}</span>
              </button>
            </div>
          ) : null}

          {meta ? (
            <AnimatePresence>
              {isDetailsOpen ? <MessageMetadata meta={message.meta} /> : null}
            </AnimatePresence>
          ) : null}
        </>
      ) : (
        <div className="message-user-wrap">
          <p className="message-content">{message.content}</p>
          <span className="message-user-time" title={formatDate(message.createdAt)}>
            {formatTime(message.createdAt)}
          </span>
        </div>
      )}
    </motion.article>
  );
}, areMessageCardPropsEqual);

export default MessageCard;
