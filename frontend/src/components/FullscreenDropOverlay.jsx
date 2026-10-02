import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Trash2, UploadCloud } from "lucide-react";

export default function FullscreenDropOverlay({ onDropFile }) {
  const dragCounter = useRef(0);
  const [isWindowDragging, setIsWindowDragging] = useState(false);
  const [isOverCancelDustbin, setIsOverCancelDustbin] = useState(false);

  useEffect(() => {
    function handleDragEnter(e) {
      if (e.dataTransfer && Array.from(e.dataTransfer.types).includes("Files")) {
        dragCounter.current += 1;
        setIsWindowDragging(true);
      }
    }

    function handleDragLeave(e) {
      dragCounter.current -= 1;
      if (dragCounter.current <= 0) {
        dragCounter.current = 0;
        setIsWindowDragging(false);
        setIsOverCancelDustbin(false);
      }
    }

    function handleDragOver(e) {
      e.preventDefault();
    }

    function handleDrop(e) {
      dragCounter.current = 0;
      setIsWindowDragging(false);
      setIsOverCancelDustbin(false);
    }

    window.addEventListener("dragenter", handleDragEnter);
    window.addEventListener("dragleave", handleDragLeave);
    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("drop", handleDrop);

    return () => {
      window.removeEventListener("dragenter", handleDragEnter);
      window.removeEventListener("dragleave", handleDragLeave);
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("drop", handleDrop);
    };
  }, []);

  return (
    <AnimatePresence>
      {isWindowDragging ? (
        <motion.div
          className="fullscreen-drop-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
        >
          <div
            className={`fullscreen-drop-zone ${!isOverCancelDustbin ? "active" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (isOverCancelDustbin) {
                setIsOverCancelDustbin(false);
              }
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              dragCounter.current = 0;
              setIsWindowDragging(false);
              setIsOverCancelDustbin(false);
              const droppedFiles = e.dataTransfer.files;
              if (droppedFiles && droppedFiles.length > 0 && onDropFile) {
                onDropFile(droppedFiles[0]);
              }
            }}
          >
            <UploadCloud size={46} className="fullscreen-drop-icon" />
            <h3 className="fullscreen-drop-title">Drop file here to stage for upload</h3>
            <p className="fullscreen-drop-subtext">
              Supports PDF, DOCX, TXT, MD, CSV up to 25MB
            </p>
          </div>

          <div
            className={`fullscreen-cancel-zone ${isOverCancelDustbin ? "active" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!isOverCancelDustbin) {
                setIsOverCancelDustbin(true);
              }
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              dragCounter.current = 0;
              setIsWindowDragging(false);
              setIsOverCancelDustbin(false);
            }}
          >
            <Trash2 size={24} className="fullscreen-cancel-icon" />
            <div className="fullscreen-cancel-text">
              <strong>Drop here to cancel</strong>
              <span>Release file here to discard without uploading</span>
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
