import { Compass } from "lucide-react";

import ChatTranscript from "../components/ChatTranscript";
import ConversationMinimap from "../components/ConversationMinimap";
import { getFlatSampleQuestions } from "../lib/chat";

function ChatPage({
  detailsExpanded,
  documents = [],
  isStreaming,
  messages,
  onQuestionChange,
  samplePromptsEnabled = true,
  selectedDocumentId = "",
  scrollContainerRef,
}) {
  const hasConversationStarted = messages.some((message) => message.role === "user");
  const sampleQuestions = getFlatSampleQuestions(documents, selectedDocumentId, 4);

  if (!hasConversationStarted) {
    return (
      <div className="chat-welcome">
        <div className="chat-welcome-inner">
          <p className="eyebrow">AI Document Assistant</p>
          <h2>Ask anything about your documents</h2>
          <p className="welcome-copy">
            Upload your documents (PDF, DOCX, or TXT) and ask questions. Get quick answers with direct
            citations pointing to the exact source.
          </p>

          {samplePromptsEnabled && sampleQuestions.length > 0 ? (
            <div className="welcome-horizontal-shelf">
              <div className="welcome-questions-horizontal-row">
                {sampleQuestions.map((sample, qIdx) => (
                  <button
                    key={qIdx}
                    type="button"
                    className="welcome-question-chip"
                    onClick={() => onQuestionChange(sample)}
                    disabled={isStreaming}
                  >
                    <Compass size={14} className="prompt-pill-icon" />
                    <span className="question-chip-text">{sample}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="chat-transcript-wrapper">
      <ChatTranscript
        messages={messages}
        scrollContainerRef={scrollContainerRef}
        detailsExpanded={detailsExpanded}
      />
      <ConversationMinimap
        messages={messages}
        scrollContainerRef={scrollContainerRef}
      />
    </div>
  );
}

export default ChatPage;
