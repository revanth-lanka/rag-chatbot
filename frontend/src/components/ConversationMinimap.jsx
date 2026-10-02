import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MessageSquareText } from "lucide-react";

import { formatTime } from "../lib/chat";

/**
 * Right-Edge Vertically Centered Timeline Dock
 * Floats on the right margin, vertically centered. Renders clean horizontal tick lines
 * for every user question. Active turn glows with brand accent. Hovering previews the
 * question in a floating leftward tooltip; clicking smooth-scrolls to that turn.
 */
function ConversationMinimap({ messages = [], scrollContainerRef }) {
  const [hoveredTurn, setHoveredTurn] = useState(null);
  const [tooltipTop, setTooltipTop] = useState(0);
  const [activeMessageId, setActiveMessageId] = useState(null);

  // Extract user question turns
  const userTurns = useMemo(() => {
    return messages
      .filter((msg) => msg.role === "user")
      .map((msg, idx) => ({
        id: msg.id,
        index: idx + 1,
        content: msg.content,
        time: msg.createdAt,
      }));
  }, [messages]);

  // Dismiss tooltip if switching chats
  useEffect(() => {
    setHoveredTurn(null);
  }, [messages]);

  // IntersectionObserver to highlight currently visible turn
  useEffect(() => {
    const container = scrollContainerRef?.current;
    if (!container || userTurns.length === 0) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const msgId = entry.target.getAttribute("data-message-id");
            if (msgId) {
              setActiveMessageId(msgId);
            }
          }
        }
      },
      {
        root: container,
        threshold: 0.25,
      }
    );

    userTurns.forEach((turn) => {
      const el = document.getElementById(`message-${turn.id}`);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [userTurns, scrollContainerRef]);

  // Keep active turn in sync when switching conversations
  useEffect(() => {
    if (userTurns.length > 0) {
      const stillExists = userTurns.some((t) => t.id === activeMessageId);
      if (!stillExists) {
        setActiveMessageId(userTurns[0].id);
      }
    } else {
      setActiveMessageId(null);
    }
  }, [userTurns, activeMessageId]);

  function handleScrollToTurn(turnId) {
    const targetEl = document.getElementById(`message-${turnId}`);
    if (targetEl) {
      targetEl.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  // Density limit: max 16 ticks displayed cleanly
  const maxDisplay = 16;
  const step = userTurns.length > maxDisplay ? Math.ceil(userTurns.length / maxDisplay) : 1;
  const visibleTurns = userTurns.filter((_, i) => i % step === 0 || i === userTurns.length - 1);

  return (
    <AnimatePresence>
      {userTurns.length > 1 && (
        <aside
          className="right-floating-dock"
          aria-label="Conversation timeline scrubber"
        >
          <motion.div
            className="right-dock-pill"
            initial={{ opacity: 0, x: 14 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 14 }}
            transition={{
              duration: 0.26,
              ease: [0.25, 1, 0.5, 1],
              layout: { duration: 0.32, ease: [0.25, 1, 0.5, 1] },
            }}
            layout
            style={{ borderRadius: 9999 }}
          >
            <div className="dock-ticks-track">
              <AnimatePresence mode="popLayout" initial={false}>
                {visibleTurns.map((turn, index) => {
                  const isActive = activeMessageId === turn.id;

                  return (
                    <motion.div
                      key={`tick-slot-${index}`}
                      layout="position"
                      className="dock-tick-wrapper"
                      initial={{ opacity: 0, scale: 0.5 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.4 }}
                      transition={{
                        duration: 0.14,
                        ease: "easeOut",
                        layout: { duration: 0.3, ease: [0.25, 1, 0.5, 1] },
                      }}
                      onMouseEnter={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        setTooltipTop(rect.top + rect.height / 2);
                        setHoveredTurn(turn);
                      }}
                      onMouseLeave={() => setHoveredTurn(null)}
                    >
                      <button
                        type="button"
                        className={`dock-tick-btn ${isActive ? "dock-tick-active" : ""}`}
                        onClick={() => handleScrollToTurn(turn.id)}
                        aria-label={`Jump to question ${turn.index}`}
                      >
                        <span className="dock-tick-line" />
                      </button>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </motion.div>

          <AnimatePresence>
            {hoveredTurn ? (
              <motion.div
                className="dock-tooltip"
                style={{ top: tooltipTop }}
                initial={{ opacity: 0, x: -8, scale: 0.96 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: -6, scale: 0.96 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
              >
                <div className="dock-tooltip-header">
                  <MessageSquareText size={12} />
                  <span>Q{hoveredTurn.index} · {formatTime(hoveredTurn.time)}</span>
                </div>
                <p className="dock-tooltip-text">
                  {hoveredTurn.content.length > 70 ? `${hoveredTurn.content.slice(0, 70)}...` : hoveredTurn.content}
                </p>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </aside>
      )}
    </AnimatePresence>
  );
}

export default ConversationMinimap;
