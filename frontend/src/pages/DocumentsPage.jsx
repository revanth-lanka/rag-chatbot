import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Check,
  FileCode,
  FileSpreadsheet,
  FileText,
  FileUp,
  Plus,
  RefreshCw,
  SlidersHorizontal,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";

import {
  formatBytes,
  formatCompactDateTime,
  formatDate,
  getFileBadgeInfo,
} from "../lib/chat";

function getDocumentIcon(filename = "") {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  if (["py", "js", "ts", "jsx", "tsx", "html", "css", "json"].includes(ext)) {
    return <FileCode size={17} />;
  }
  if (["csv", "tsv", "xlsx", "xls"].includes(ext)) {
    return <FileSpreadsheet size={17} />;
  }
  return <FileText size={17} />;
}

function DeleteConfirmationModal({ documentItem, onConfirm, onCancel, isDeleting }) {
  if (!documentItem) return null;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <motion.div
        className="modal-card"
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 8 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
      >
        <div className="modal-header">
          <div className="modal-title-row">
            <span className="modal-icon-warning">
              <AlertTriangle size={18} />
            </span>
            <h3>Delete Document</h3>
          </div>
          <button
            type="button"
            className="icon-button-sm"
            onClick={onCancel}
            aria-label="Cancel deletion"
          >
            <X size={15} />
          </button>
        </div>

        <div className="modal-body">
          <p>
            Are you sure you want to delete <strong>"{documentItem.filename}"</strong>?
          </p>
          <p className="modal-subtext">
            This action will permanently purge all <strong>{documentItem.chunk_count || 0} chunks</strong> and
            their vector embeddings from the PostgreSQL database.
          </p>
        </div>

        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onCancel} disabled={isDeleting}>
            Cancel
          </button>
          <button
            type="button"
            className="danger-button"
            onClick={onConfirm}
            disabled={isDeleting}
          >
            <Trash2 size={15} />
            {isDeleting ? "Deleting..." : "Delete Document"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function ReindexConfirmationModal({ documentItem, onConfirm, onCancel, isReindexing }) {
  if (!documentItem) return null;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <motion.div
        className="modal-card"
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 8 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
      >
        <div className="modal-header">
          <div className="modal-title-row">
            <span className="modal-icon-info">
              <RefreshCw size={18} />
            </span>
            <h3>Re-index Document</h3>
          </div>
          <button
            type="button"
            className="icon-button-sm"
            onClick={onCancel}
            aria-label="Cancel re-indexing"
          >
            <X size={15} />
          </button>
        </div>

        <div className="modal-body">
          <p>
            Are you sure you want to re-index <strong>"{documentItem.filename}"</strong>?
          </p>
          <p className="modal-subtext">
            This will re-parse the document and re-generate vector embeddings for all{" "}
            <strong>{documentItem.chunk_count || 0} chunks</strong> using the active embedding model.
          </p>
        </div>

        <div className="modal-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={onCancel}
            disabled={isReindexing}
          >
            Cancel
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={onConfirm}
            disabled={isReindexing}
          >
            <RefreshCw
              size={14}
              className={isReindexing ? "is-spinning" : ""}
            />
            {isReindexing ? "Re-indexing..." : "Re-index Document"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function DocumentInspectorDrawer({
  documentItem,
  detail,
  isLoadingDetail,
  onClose,
  isSelectedScope,
  onSelectScope,
  onClearScope,
  onReindex,
  isReindexing,
  onDelete,
}) {
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (!documentItem) return null;

  const badgeInfo = getFileBadgeInfo(documentItem.filename);
  const chunkCount = detail?.chunk_count ?? documentItem.chunk_count ?? 0;
  const embeddedCount = detail?.embedded_chunk_count ?? documentItem.embedded_chunk_count ?? 0;
  const isEmbedded100 = chunkCount > 0 && embeddedCount === chunkCount;
  const chunkPreviews = detail?.chunk_previews || [];

  return (
    <div className="drawer-portal">
      <motion.div
        className="drawer-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.16 }}
        onClick={onClose}
      />

      <motion.aside
        className="document-inspector-panel"
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        role="dialog"
        aria-modal="true"
        aria-label="Document Inspector"
      >
        <div className="drawer-header">
          <div className="drawer-title-group">
            <span className={`file-badge ${badgeInfo.badgeClass}`}>
              {badgeInfo.label}
            </span>
            <div className="drawer-title-text">
              <h3 title={documentItem.filename}>{documentItem.filename}</h3>
              <span className="drawer-doc-id">Document ID: {documentItem.id}</span>
            </div>
          </div>
          <button
            type="button"
            className="icon-button-sm drawer-close-btn"
            onClick={onClose}
            aria-label="Close inspector"
          >
            <X size={16} />
          </button>
        </div>

        <div className="drawer-scope-bar">
          {isSelectedScope ? (
            <div className="drawer-scope-active-box">
              <span className="drawer-scope-indicator">
                <Check size={13} /> Active Chat Scope
              </span>
              <button
                type="button"
                className="ghost-button-sm"
                onClick={onClearScope}
              >
                Clear (Use All)
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="secondary-button-sm drawer-scope-btn"
              onClick={onSelectScope}
            >
              Set as Active Chat Scope
            </button>
          )}
        </div>

        <div className="drawer-body">
          <div className="drawer-section">
            <h4 className="drawer-section-title">Vector & Metadata</h4>
            <div className="drawer-meta-grid">
              <div className="drawer-meta-item">
                <span className="drawer-meta-label">Total Chunks</span>
                <strong className="drawer-meta-val">{chunkCount}</strong>
              </div>
              <div className="drawer-meta-item">
                <span className="drawer-meta-label">Embedded Chunks</span>
                <strong className="drawer-meta-val">
                  {embeddedCount} {isEmbedded100 ? "(100%)" : ""}
                </strong>
              </div>
              <div className="drawer-meta-item">
                <span className="drawer-meta-label">Embedding Model</span>
                <strong className="drawer-meta-val">
                  {detail?.embedding_provider || documentItem.embedding_provider || "Local ONNX"}
                </strong>
              </div>
              <div className="drawer-meta-item">
                <span className="drawer-meta-label">Parser</span>
                <strong className="drawer-meta-val">
                  {detail?.parser_name || documentItem.parser_name || "Standard"}
                </strong>
              </div>
              <div className="drawer-meta-item">
                <span className="drawer-meta-label">Format</span>
                <strong className="drawer-meta-val">
                  {detail?.source_format || documentItem.source_format || "File"}
                </strong>
              </div>
              <div className="drawer-meta-item">
                <span className="drawer-meta-label">Date Ingested</span>
                <strong className="drawer-meta-val">
                  {formatCompactDateTime(documentItem.created_at)}
                </strong>
              </div>
            </div>

            {(detail?.content_hash || documentItem.content_hash) ? (
              <div className="drawer-hash-box">
                <span className="drawer-hash-label">Content SHA-256 Hash:</span>
                <code className="drawer-hash-value">
                  {detail?.content_hash || documentItem.content_hash}
                </code>
              </div>
            ) : null}
          </div>

          <div className="drawer-section">
            <div className="drawer-chunks-header">
              <h4 className="drawer-section-title">
                Chunk Previews ({chunkPreviews.length})
              </h4>
              {onReindex ? (
                <button
                  type="button"
                  className="ghost-button-sm drawer-reindex-btn"
                  onClick={onReindex}
                  disabled={isReindexing}
                  title="Re-index document vector embeddings"
                >
                  <RefreshCw
                    size={12}
                    className={isReindexing ? "is-spinning" : ""}
                  />
                  <span>{isReindexing ? "Re-indexing..." : "Re-index"}</span>
                </button>
              ) : null}
            </div>

            {isLoadingDetail ? (
              <div className="drawer-chunks-loading">
                <RefreshCw size={14} className="is-spinning" />
                <span>Loading chunk previews...</span>
              </div>
            ) : chunkPreviews.length > 0 ? (
              <div className="drawer-chunks-list">
                {chunkPreviews.map((chunk) => (
                  <article key={chunk.id} className="drawer-chunk-card">
                    <div className="drawer-chunk-header">
                      <strong className="drawer-chunk-idx">Chunk {chunk.chunk_index}</strong>
                      <span className="drawer-chunk-chars">{chunk.character_count} chars</span>
                    </div>
                    <p className="drawer-chunk-text">{chunk.preview_text}</p>
                  </article>
                ))}
              </div>
            ) : (
              <div className="drawer-chunks-empty">
                <p>No preview chunks stored for this document.</p>
              </div>
            )}
          </div>
        </div>

        <div className="drawer-footer">
          <button
            type="button"
            className="danger-button-sm drawer-delete-btn"
            onClick={onDelete}
          >
            <Trash2 size={13} />
            <span>Delete Document</span>
          </button>
          <button
            type="button"
            className="secondary-button-sm drawer-close-action-btn"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </motion.aside>
    </div>
  );
}

function DocumentsPage({
  apiBaseUrl,
  deletingDocumentId,
  documentNotice,
  documents,
  documentsError,
  documentsLoading,
  isUploading,
  onDeleteDocument,
  onNavigateToChat,
  onReindexDocument,
  onRefresh,
  onSelectDocument,
  onUpload,
  onUploadFileChange,
  onUseAllDocuments,
  reindexingDocumentId,
  selectedDocumentDetail,
  selectedDocumentId,
  uploadFile,
  uploadInputRef,
}) {
  const [documentToDelete, setDocumentToDelete] = useState(null);
  const [documentToReindex, setDocumentToReindex] = useState(null);
  const [inspectingDoc, setInspectingDoc] = useState(null);
  const [inspectingDetail, setInspectingDetail] = useState(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  // 180ms threshold for initial load to prevent flash of loading state
  const [showInitialLoader, setShowInitialLoader] = useState(false);

  useEffect(() => {
    let timer;
    if (documentsLoading && documents.length === 0) {
      timer = setTimeout(() => {
        setShowInitialLoader(true);
      }, 180);
    } else {
      setShowInitialLoader(false);
    }
    return () => clearTimeout(timer);
  }, [documentsLoading, documents.length]);



  function handleConfirmDelete() {
    if (!documentToDelete) return;
    if (inspectingDoc?.id === documentToDelete.id) {
      setInspectingDoc(null);
      setInspectingDetail(null);
    }
    onDeleteDocument(documentToDelete);
    setDocumentToDelete(null);
  }

  function handleConfirmReindex() {
    if (!documentToReindex) return;
    onReindexDocument(documentToReindex.id);
    setDocumentToReindex(null);
  }

  async function handleInspect(doc) {
    setInspectingDoc(doc);
    // If detail is already cached for this document, use it
    if (selectedDocumentDetail && String(selectedDocumentDetail.id) === String(doc.id)) {
      setInspectingDetail(selectedDocumentDetail);
      return;
    }
    // Fetch detail on demand without altering chat scope
    setIsLoadingDetail(true);
    try {
      const base = apiBaseUrl || "http://localhost:8000";
      const res = await fetch(`${base}/documents/${doc.id}`);
      if (res.ok) {
        const data = await res.json();
        setInspectingDetail(data);
      }
    } catch (err) {
      console.error("Failed to load document details for inspection:", err);
    } finally {
      setIsLoadingDetail(false);
    }
  }

  const totalChunks = documents.reduce((acc, d) => acc + (d.chunk_count || 0), 0);
  const activeScopeDoc = documents.find((doc) => String(doc.id) === selectedDocumentId);
  const activeScopeName = activeScopeDoc?.filename || "All documents";

  return (
    <div className="documents-page">


      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {documentToDelete ? (
          <DeleteConfirmationModal
            documentItem={documentToDelete}
            onConfirm={handleConfirmDelete}
            onCancel={() => setDocumentToDelete(null)}
            isDeleting={deletingDocumentId === documentToDelete.id}
          />
        ) : null}
      </AnimatePresence>

      {/* Re-index Confirmation Modal */}
      <AnimatePresence>
        {documentToReindex ? (
          <ReindexConfirmationModal
            documentItem={documentToReindex}
            onConfirm={handleConfirmReindex}
            onCancel={() => setDocumentToReindex(null)}
            isReindexing={reindexingDocumentId === documentToReindex.id}
          />
        ) : null}
      </AnimatePresence>

      {/* Slide-over Chunk Inspector Drawer */}
      <AnimatePresence>
        {inspectingDoc ? (
          <DocumentInspectorDrawer
            documentItem={inspectingDoc}
            detail={inspectingDetail || (String(selectedDocumentDetail?.id) === String(inspectingDoc.id) ? selectedDocumentDetail : null)}
            isLoadingDetail={isLoadingDetail}
            onClose={() => {
              setInspectingDoc(null);
              setInspectingDetail(null);
            }}
            isSelectedScope={String(inspectingDoc.id) === selectedDocumentId}
            onSelectScope={() => onSelectDocument(String(inspectingDoc.id))}
            onClearScope={onUseAllDocuments}
            onReindex={onReindexDocument ? () => setDocumentToReindex(inspectingDoc) : null}
            isReindexing={reindexingDocumentId === inspectingDoc.id}
            onDelete={() => setDocumentToDelete(inspectingDoc)}
          />
        ) : null}
      </AnimatePresence>

      {/* Header Toolbar */}
      <header className="documents-header-bar">
        <div className="documents-title-group">
          <div className="documents-title-row">
            <h2 className="documents-page-title">Knowledge Base</h2>
            <div className="documents-meta-badges">
              <span className="meta-badge-count">{documents.length} files</span>
              <span className="meta-badge-dot">·</span>
              <span className="meta-badge-chunks">{totalChunks.toLocaleString()} chunks indexed</span>
            </div>
          </div>
        </div>

        <div className="documents-toolbar-actions">
          <div className="active-scope-pill" title={`Active chat scope: ${activeScopeName}`}>
            <span className="scope-pill-label">Scope:</span>
            <strong className="scope-pill-value">{activeScopeName}</strong>
            {selectedDocumentId ? (
              <button
                type="button"
                className="scope-reset-btn"
                onClick={onUseAllDocuments}
                title="Reset scope to search all documents"
              >
                Use All
              </button>
            ) : null}
          </div>

          <div className="documents-toolbar-right-actions">
            <button
              type="button"
              className="header-refresh-btn"
              onClick={onRefresh}
              disabled={documentsLoading}
              aria-label="Refresh documents"
              title="Refresh document library"
            >
              <RefreshCw size={14} className={documentsLoading ? "is-spinning" : ""} />
            </button>

            <button
              type="button"
              className="primary-button-sm compact-header-upload-btn"
              onClick={() => uploadInputRef.current?.click()}
              title="Upload and ingest a new document"
            >
              <Plus size={15} />
              <span>Upload</span>
            </button>
          </div>
        </div>
      </header>

      {/* Compact Dropzone Strip */}
      <form className="compact-dropzone-form" onSubmit={onUpload}>
        <div
          className="compact-dropzone-strip"
          onClick={() => uploadInputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              uploadInputRef.current?.click();
            }
          }}
        >
          <input
            ref={uploadInputRef}
            type="file"
            style={{ display: "none" }}
            accept=".txt,.md,.csv,.log,.json,.py,.js,.ts,.tsx,.jsx,.html,.css,.pdf,.docx"
            onChange={(event) => onUploadFileChange(event.target.files?.[0] || null)}
          />

          {!uploadFile ? (
            <div className="compact-dropzone-idle">
              <div className="compact-dropzone-text">
                <UploadCloud size={16} className="compact-dropzone-icon" />
                <span className="compact-dropzone-label">
                  Drag and drop a file here, or click to browse
                </span>
                <span className="compact-dropzone-hint">
                  (PDF, DOCX, TXT, MD, CSV up to 25MB)
                </span>
              </div>
              <button
                type="button"
                className="ghost-button compact-browse-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  uploadInputRef.current?.click();
                }}
              >
                Browse Files
              </button>
            </div>
          ) : (
            <div className="compact-staged-row" onClick={(e) => e.stopPropagation()}>
              <div className="compact-staged-info">
                <span className={`file-badge ${getFileBadgeInfo(uploadFile.name).badgeClass}`}>
                  {getFileBadgeInfo(uploadFile.name).label}
                </span>
                <strong className="compact-staged-filename" title={uploadFile.name}>
                  {uploadFile.name}
                </strong>
                <span className="compact-staged-size">{formatBytes(uploadFile.size)}</span>
                <button
                  type="button"
                  className="icon-button-sm compact-remove-btn"
                  onClick={() => {
                    onUploadFileChange(null);
                    if (uploadInputRef.current) uploadInputRef.current.value = "";
                  }}
                  aria-label="Remove selected file"
                  title="Remove file"
                >
                  <X size={14} />
                </button>
              </div>

              <button
                type="submit"
                className="primary-button compact-upload-btn"
                disabled={isUploading}
              >
                <FileUp size={14} />
                {isUploading ? "Uploading & Ingesting..." : "Upload & Ingest"}
              </button>
            </div>
          )}
        </div>
      </form>

      {documentNotice ? <div className="document-notice">{documentNotice}</div> : null}
      {documentsError ? <p className="error-banner">{documentsError}</p> : null}

      {/* Modern Document Library Cards Feed */}
      <section className="documents-cards-section">
        {showInitialLoader && documents.length === 0 ? (
          <div className="documents-cards-loading">
            <RefreshCw size={18} className="is-spinning" />
            <span>Loading documents...</span>
          </div>
        ) : documents.length === 0 && !documentsLoading ? (
          <div className="documents-cards-empty">
            <p className="empty-title">No documents ingested yet</p>
            <p className="empty-subtitle">
              Upload your first PDF, DOCX, TXT, or MD file to start grounding answers in your own content.
            </p>
          </div>
        ) : (
          <div className="doc-cards-list">
            {documents.map((document) => {
              const isSelected = String(document.id) === selectedDocumentId;
              const badgeInfo = getFileBadgeInfo(document.filename);
              const isEmbedded100 =
                document.chunk_count > 0 &&
                document.embedded_chunk_count === document.chunk_count;

              return (
                <div
                  key={document.id}
                  className={`doc-card-item ${isSelected ? "doc-card-scoped" : ""}`}
                  onClick={() => handleInspect(document)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleInspect(document);
                    }
                  }}
                  title="Click to inspect document chunks and metadata"
                >
                  <div className="doc-card-main-group">
                    <div className={`doc-card-icon-tile ${badgeInfo.badgeClass}`} aria-hidden="true">
                      {getDocumentIcon(document.filename)}
                    </div>

                    <div className="doc-card-info">
                      <div className="doc-card-title-row">
                        <span className="doc-card-filename" title={document.filename}>
                          {document.filename}
                        </span>
                      </div>
                      <div className="doc-card-meta-row">
                        <span className="doc-card-meta-item">
                          {document.chunk_count} {document.chunk_count === 1 ? "chunk" : "chunks"}
                        </span>
                        <span className="doc-card-meta-dot">·</span>
                        <span
                          className={`doc-embedding-tag ${isEmbedded100 ? "status-complete" : "status-partial"}`}
                        >
                          <span className="status-dot" />
                          {isEmbedded100 ? "100% Embedded" : `${document.embedded_chunk_count} embedded`}
                        </span>
                        <span className="doc-card-meta-dot doc-card-date-dot">·</span>
                        <span className="doc-card-meta-item doc-card-date">
                          Added {formatCompactDateTime(document.created_at)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="doc-card-actions" onClick={(e) => e.stopPropagation()}>
                    {isSelected ? (
                      <button
                        type="button"
                        className="doc-scope-badge is-active"
                        onClick={onUseAllDocuments}
                        title="Currently selected as chat search scope. Click to clear scope."
                      >
                        <Check size={12} />
                        <span>Active Scope</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="doc-scope-badge"
                        onClick={() => onSelectDocument(String(document.id))}
                        title="Click to scope chat to this document only"
                      >
                        <span>Select Scope</span>
                      </button>
                    )}

                    <div className="doc-card-btn-cluster">
                      <button
                        type="button"
                        className="doc-card-action-btn"
                        onClick={() => handleInspect(document)}
                        title="Inspect document chunks and metadata"
                        aria-label="Inspect chunks"
                      >
                        <SlidersHorizontal size={13} />
                        <span className="doc-action-btn-label">Inspect</span>
                      </button>

                      {onReindexDocument ? (
                        <button
                          type="button"
                          className="doc-card-action-btn"
                          onClick={() => setDocumentToReindex(document)}
                          disabled={reindexingDocumentId === document.id}
                          title="Re-index document vector embeddings"
                          aria-label="Re-index embeddings"
                        >
                          <RefreshCw
                            size={13}
                            className={reindexingDocumentId === document.id ? "is-spinning" : ""}
                          />
                        </button>
                      ) : null}

                      <button
                        type="button"
                        className="doc-card-action-btn danger"
                        onClick={() => setDocumentToDelete(document)}
                        disabled={deletingDocumentId === document.id}
                        title="Delete document"
                        aria-label="Delete document"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

export default DocumentsPage;
