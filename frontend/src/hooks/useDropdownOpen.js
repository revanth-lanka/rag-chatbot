import { useEffect, useRef, useState } from "react";

/**
 * Shared open-state hook for custom dropdowns. Handles outside-click and
 * Escape dismissal and exposes a container ref that the dropdown root must
 * attach to so the outside-click check can scope to it.
 */
export function useDropdownOpen() {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    function handleOutsideClick(event) {
      if (!containerRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    }

    function handleEscape(event) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  return [isOpen, setIsOpen, containerRef];
}
