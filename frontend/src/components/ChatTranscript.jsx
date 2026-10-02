import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import MessageCard from "./MessageCard";

function ChatTranscript({ messages, scrollContainerRef, detailsExpanded }) {
  const shouldStickToBottomRef = useRef(true);
  const [copiedMessageId, setCopiedMessageId] = useState(null);
  const [openDetailsMap, setOpenDetailsMap] = useState({});

  const latestMessage = messages[messages.length - 1] || null;

  const latestMessageSignature = useMemo(() => {
    if (!latestMessage) return "empty";
    return `${latestMessage.id}:${latestMessage.content.length}:${latestMessage.isStreaming}:${latestMessage.isLoading}`;
  }, [latestMessage]);

  function updateScrollState() {
    const container = scrollContainerRef?.current;
    if (!container) return;
    const nextCanScroll = container.scrollHeight > container.clientHeight + 120;
    const nextNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 120;
    shouldStickToBottomRef.current = !nextCanScroll || nextNearBottom;
  }

  // Passively track scroll position on user interaction without layout thrashing
  useEffect(() => {
    const container = scrollContainerRef?.current;
    if (!container) return undefined;
    updateScrollState();

    function handleScroll() {
      updateScrollState();
    }
    function handleResize() {
      updateScrollState();
    }

    container.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleResize);

    return () => {
      container.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleResize);
    };
  }, [scrollContainerRef]);

  // Decoupled autoscroll: only perform write operation when stick-to-bottom is true,
  // without intermediate synchronous scrollHeight/scrollTop layout query reads.
  useEffect(() => {
    if (shouldStickToBottomRef.current) {
      scrollToLatest(latestMessage?.isStreaming || latestMessage?.isLoading ? "auto" : "smooth");
    }
  }, [latestMessage, latestMessageSignature]);

  function scrollToLatest(behavior = "smooth") {
    const container = scrollContainerRef?.current;
    if (!container) return;
    if (behavior === "auto") {
      container.scrollTop = container.scrollHeight;
    } else {
      container.scrollTo({ top: container.scrollHeight, behavior });
    }
  }

  const handleCopyMessage = useCallback((msgId, text) => {
    navigator.clipboard.writeText(text);
    setCopiedMessageId(msgId);
    setTimeout(() => setCopiedMessageId(null), 2000);
  }, []);

  const toggleMessageDetails = useCallback((msgId) => {
    setOpenDetailsMap((curr) => {
      const currentVal = curr[msgId] !== undefined ? curr[msgId] : detailsExpanded;
      return { ...curr, [msgId]: !currentVal };
    });
  }, [detailsExpanded]);

  return (
    <section className="chat-stream" role="log" aria-live="polite" aria-label="Conversation">
      {messages.map((message, index) => (
        <MessageCard
          key={message.id}
          message={message}
          index={index}
          totalMessages={messages.length}
          isDetailsOpen={
            openDetailsMap[message.id] !== undefined
              ? openDetailsMap[message.id]
              : detailsExpanded
          }
          onToggleDetails={toggleMessageDetails}
          isCopied={copiedMessageId === message.id}
          onCopyMessage={handleCopyMessage}
        />
      ))}
    </section>
  );
}

export { MessageCard };
export default memo(ChatTranscript);
