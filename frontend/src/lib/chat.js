export const defaultTopK = Number(import.meta.env.VITE_CHAT_TOP_K_DEFAULT || "3");
export const themeStorageKey = "rag-chatbot-theme";
export const detailsExpandedStorageKey = "rag-chatbot-details-expanded";
export const samplePromptsStorageKey = "rag-chatbot-sample-prompts-enabled";

export const providerOptions = [
  { value: "default", label: "Server Default" },
  { value: "mock", label: "Mock" },
  { value: "openai", label: "OpenAI" },
  { value: "gemini", label: "Gemini" },
  { value: "groq", label: "Groq" },
  { value: "openrouter", label: "OpenRouter" },
];

export const responseModeOptions = [
  { value: "stream", label: "Streaming" },
  { value: "ask", label: "Non-Streaming" },
];

export const rerankStrategyOptions = [
  { value: "default", label: "Server Default" },
  { value: "fast", label: "Custom" },
  { value: "hybrid", label: "Hybrid" },
  { value: "neural", label: "Neural" },
];

export const retrievalModeOptions = [
  { value: "default", label: "Server Default" },
  { value: "exact", label: "Exact" },
  { value: "ann_rerank", label: "ANN + Rerank" },
];

export function formatRerankStrategyLabel(value) {
  if (value === "fast") return "Custom";
  if (value === "hybrid") return "Hybrid";
  if (value === "neural") return "Neural";
  return value;
}

export function formatRetrievalModeLabel(value) {
  if (value === "ann_rerank") return "ANN + Rerank";
  if (value === "exact") return "Exact";
  return value;
}

/**
 * Curated sample documents and their benchmark query domains.
 */
export const categorizedSampleQuestions = [
  {
    documentFilename: "Evidence of Coverage 2026.pdf",
    matchFilename: "Evidence of Coverage 2026.pdf",
    category: "Evidence of Coverage 2026.pdf",
    format: "pdf",
    questions: [
      "What is the monthly premium for this plan in 2026?",
      "Who is eligible for membership in this plan?",
      "What is the copay for emergency room visits?",
    ],
  },
  {
    documentFilename: "Guide To Benefits.pdf",
    matchFilename: "Guide To Benefits.pdf",
    category: "Guide To Benefits.pdf",
    format: "pdf",
    questions: [
      "What happens if a member moves out of the service area?",
      "How far can a prescription drug appeal go?",
      "What is the difference between an appeal and a complaint?",
    ],
  },
  {
    documentFilename: "Ottoman_Empire.pdf",
    matchFilename: "Ottoman_Empire.pdf",
    category: "Ottoman_Empire.pdf",
    format: "pdf",
    questions: [
      "When was the Ottoman Empire founded and who was its first ruler?",
      "What was the significance of the Fall of Constantinople in 1453?",
      "How did the Ottoman Empire dissolve after World War I?",
    ],
  },
  {
    documentFilename: "company_faq.txt",
    matchFilename: "company_faq.txt",
    category: "company_faq.txt",
    format: "txt",
    questions: [
      "What is the response time for severity 1 support incidents?",
      "What encryption standards are used for customer data at rest?",
      "What is the company refund policy for milestone deliverables?",
    ],
  },
];

function normalizeDocName(name = "") {
  return name.toLowerCase().replace(/[-_ ]/g, "");
}

function matchesDoc(sampleMatchName, filename = "") {
  const s1 = normalizeDocName(sampleMatchName);
  const s2 = normalizeDocName(filename);
  return s2.includes(s1) || s1.includes(s2);
}

export function hasSampleDocuments(documents = []) {
  if (!documents || documents.length === 0) return false;
  return documents.some((doc) =>
    categorizedSampleQuestions.some((group) => matchesDoc(group.matchFilename, doc.filename))
  );
}

export function getRelevantSampleQuestions(documents = [], selectedDocumentId = "") {
  if (!documents || documents.length === 0) {
    return [];
  }

  // If a specific document is selected in scope
  if (selectedDocumentId) {
    const selectedDoc = documents.find((doc) => String(doc.id) === String(selectedDocumentId));
    if (selectedDoc) {
      const matchedGroup = categorizedSampleQuestions.find((group) =>
        matchesDoc(group.matchFilename, selectedDoc.filename)
      );
      // Strictly return questions only for known sample documents; custom docs return empty
      return matchedGroup ? [matchedGroup] : [];
    }
    return [];
  }

  // Otherwise (All documents scope), return matching sample groups only if benchmark sample documents are loaded
  const matchingGroups = categorizedSampleQuestions.filter((group) =>
    documents.some((doc) => matchesDoc(group.matchFilename, doc.filename))
  );

  return matchingGroups;
}

export const defaultSampleQuestions = [
  "What is the monthly premium for this plan in 2026?",
  "What happens if a member moves out of the service area?",
  "When was the Ottoman Empire founded and who was its first ruler?",
  "What is the response time for severity 1 support incidents?",
];

export function getFlatSampleQuestions(documents = [], selectedDocumentId = "", limit = 4) {
  const groups = getRelevantSampleQuestions(documents, selectedDocumentId);
  if (!groups || groups.length === 0) {
    // If a specific document is selected with no pre-configured benchmark questions, provide contextual questions
    if (selectedDocumentId) {
      const selectedDoc = documents.find((doc) => String(doc.id) === String(selectedDocumentId));
      const docName = selectedDoc?.filename || "this document";
      return [
        `What are the key points covered in ${docName}?`,
        `Summarize the main sections and conclusions of ${docName}`,
        `What specific guidelines or procedures are outlined in ${docName}?`,
      ].slice(0, limit);
    }
    // Otherwise fallback to curated prompts so sample questions never vanish
    return defaultSampleQuestions.slice(0, limit);
  }

  if (groups.length === 1) {
    return groups[0].questions.slice(0, limit);
  }

  // Interleave questions from matching groups so each loaded benchmark document is represented
  const results = [];
  let round = 0;
  let hasMore = true;

  while (results.length < limit && hasMore) {
    hasMore = false;
    for (const group of groups) {
      if (group.questions[round] && results.length < limit) {
        results.push(group.questions[round]);
      }
      if (group.questions[round + 1]) {
        hasMore = true;
      }
    }
    round++;
  }

  return results.length > 0 ? results : defaultSampleQuestions.slice(0, limit);
}

export const sampleQuestions = categorizedSampleQuestions.flatMap((group) => group.questions);

export function createMessage(role, content, extra = {}) {
  return {
    id: crypto.randomUUID(),
    role,
    content,
    createdAt: new Date().toISOString(),
    ...extra,
  };
}

export async function readErrorMessage(response) {
  try {
    const data = await response.json();
    return data.error?.message || data.detail || data.message || "";
  } catch {
    return "";
  }
}

export function formatDate(value, options) {
  if (!value) return "Unknown";
  return new Date(value).toLocaleString([], options);
}

export function formatCompactDateTime(value) {
  if (!value) return "Unknown";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Unknown";
  const datePart = d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const timePart = d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${datePart}, ${timePart}`;
}

export function formatTime(value) {
  return formatDate(value, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatLatency(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return null;
  }
  const numericValue = Number(value);
  if (numericValue >= 1000) {
    return `${(numericValue / 1000).toFixed(1)}s`;
  }
  if (numericValue > 0 && numericValue < 1) {
    return `${numericValue.toFixed(1)}ms`;
  }
  return `${Math.round(numericValue)}ms`;
}

export function formatSimilarity(score) {
  if (score === null || score === undefined || Number.isNaN(Number(score))) {
    return null;
  }
  const num = Number(score);
  return `${Math.round(num * 100)}%`;
}

export function formatBytes(bytes) {
  if (!bytes || Number.isNaN(Number(bytes)) || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function getFileBadgeInfo(filename = "") {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  if (ext === "pdf") {
    return { type: "pdf", label: "PDF", badgeClass: "badge-pdf" };
  }
  if (ext === "docx" || ext === "doc") {
    return { type: "docx", label: "DOCX", badgeClass: "badge-docx" };
  }
  if (ext === "txt" || ext === "md" || ext === "log") {
    return { type: "txt", label: ext.toUpperCase(), badgeClass: "badge-txt" };
  }
  return { type: "file", label: ext.toUpperCase() || "FILE", badgeClass: "badge-generic" };
}

export function getInitialThemePreference() {
  if (typeof window === "undefined") return "system";
  const stored = window.localStorage.getItem(themeStorageKey);
  if (stored === "light" || stored === "dark") return stored;
  return "system";
}

export function getInitialDetailsExpanded() {
  if (typeof window === "undefined") return false;
  const stored = window.localStorage.getItem(detailsExpandedStorageKey);
  if (stored === "true") return true;
  if (stored === "false") return false;
  return false; // Default closed
}

export function getInitialSamplePromptsEnabled() {
  if (typeof window === "undefined") return true;
  const stored = window.localStorage.getItem(samplePromptsStorageKey);
  if (stored === "false") return false;
  return true; // Default enabled
}

export function resolveTheme(themePreference, prefersDarkMode) {
  if (themePreference === "light" || themePreference === "dark") return themePreference;
  return prefersDarkMode ? "dark" : "light";
}

// Cache for incremental streaming markdown block parsing
const MAX_CHECKPOINT_ENTRIES = 16;
const streamCheckpoints = [];
const exactBlocksCache = new Map();

function cloneBlock(b) {
  if (b.type === "code") {
    return { type: "code", lang: b.lang, codeLines: [...b.codeLines] };
  }
  if (b.type === "list") {
    return { type: "list", isNum: b.isNum, items: [...b.items] };
  }
  return { ...b };
}

function findLongestCheckpoint(text) {
  let best = null;
  for (let i = 0; i < streamCheckpoints.length; i++) {
    const cp = streamCheckpoints[i];
    if (text.startsWith(cp.prefixText)) {
      if (!best || cp.prefixText.length > best.prefixText.length) {
        best = cp;
      }
    }
  }
  return best;
}

/**
 * Lightweight, safe streaming markdown parser utility for assistant messages.
 * Splits text into paragraphs, headers, bullet/numbered lists, blockquotes, and code blocks.
 * Employs incremental block checkpoint caching so streaming chunks do not re-parse from line 0.
 */
export function parseMarkdownBlocks(text = "") {
  if (!text) return [];

  // Fast path: exact match cache for repeated renders
  if (exactBlocksCache.has(text)) {
    return exactBlocksCache.get(text).map(cloneBlock);
  }

  const lines = text.split("\n");
  const checkpoint = findLongestCheckpoint(text);

  let blocks = [];
  let startLine = 0;
  let currentCodeBlock = null;
  let currentList = null;

  if (checkpoint && checkpoint.lineIndex < lines.length) {
    blocks = checkpoint.blocks.map(cloneBlock);
    startLine = checkpoint.lineIndex;
  }

  let lastCleanLineIndex = startLine;
  let cleanBlocksSnapshot = null;

  for (let i = startLine; i < lines.length; i++) {
    const line = lines[i];

    // Fenced Code Block
    if (line.trim().startsWith("```")) {
      if (currentCodeBlock) {
        blocks.push(currentCodeBlock);
        currentCodeBlock = null;
        // Clean boundary after closing a code fence
        if (currentList === null) {
          lastCleanLineIndex = i + 1;
          cleanBlocksSnapshot = blocks.map(cloneBlock);
        }
      } else {
        if (currentList) {
          blocks.push(currentList);
          currentList = null;
        }
        const lang = line.trim().slice(3).trim() || "plaintext";
        currentCodeBlock = { type: "code", lang, codeLines: [] };
      }
      continue;
    }

    if (currentCodeBlock) {
      currentCodeBlock.codeLines.push(line);
      continue;
    }

    // Unordered or Ordered List Item
    const bulletMatch = line.match(/^(\s*)([-*+])\s+(.*)/);
    const numMatch = line.match(/^(\s*)(\d+)\.\s+(.*)/);

    if (bulletMatch || numMatch) {
      const isNum = Boolean(numMatch);
      const content = isNum ? numMatch[3] : bulletMatch[3];

      if (!currentList || currentList.isNum !== isNum) {
        if (currentList) blocks.push(currentList);
        currentList = { type: "list", isNum, items: [] };
      }
      currentList.items.push(content);
      continue;
    } else if (currentList) {
      blocks.push(currentList);
      currentList = null;
    }

    // Headers
    const headerMatch = line.match(/^(#{1,3})\s+(.*)/);
    if (headerMatch) {
      const level = headerMatch[1].length;
      blocks.push({ type: "header", level, text: headerMatch[2] });
      continue;
    }

    // Blockquote
    const quoteMatch = line.match(/^>\s+(.*)/);
    if (quoteMatch) {
      blocks.push({ type: "quote", text: quoteMatch[1] });
      continue;
    }

    // Plain line or paragraph break
    if (line.trim() === "") {
      blocks.push({ type: "spacer" });
      // Clean boundary when encountering an empty line outside code/lists
      if (currentCodeBlock === null && currentList === null) {
        lastCleanLineIndex = i + 1;
        cleanBlocksSnapshot = blocks.map(cloneBlock);
      }
    } else {
      // Check if previous block was a paragraph to append or create new
      const lastBlock = blocks[blocks.length - 1];
      if (lastBlock && lastBlock.type === "paragraph") {
        lastBlock.text += "\n" + line;
      } else {
        blocks.push({ type: "paragraph", text: line });
      }
    }
  }

  if (currentCodeBlock) blocks.push(currentCodeBlock);
  if (currentList) blocks.push(currentList);

  // Update incremental checkpoint if a new clean boundary was established
  if (cleanBlocksSnapshot && lastCleanLineIndex > 0) {
    const prefixText = lines.slice(0, lastCleanLineIndex).join("\n") + "\n";
    const existingIdx = streamCheckpoints.findIndex((cp) => cp.prefixText === prefixText);
    const checkpointEntry = {
      prefixText,
      lineIndex: lastCleanLineIndex,
      blocks: cleanBlocksSnapshot,
    };
    if (existingIdx !== -1) {
      streamCheckpoints[existingIdx] = checkpointEntry;
    } else {
      if (streamCheckpoints.length >= MAX_CHECKPOINT_ENTRIES) {
        streamCheckpoints.shift();
      }
      streamCheckpoints.push(checkpointEntry);
    }
  }

  const finalBlocks = blocks.filter((block) => block.type !== "spacer");

  // Save to exact cache
  if (exactBlocksCache.size >= 64) {
    const firstKey = exactBlocksCache.keys().next().value;
    exactBlocksCache.delete(firstKey);
  }
  exactBlocksCache.set(text, finalBlocks.map(cloneBlock));

  return finalBlocks;
}
