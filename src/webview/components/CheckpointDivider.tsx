import { useState, useRef, useEffect } from "react";
import type { CheckpointSummary } from "../../shared/protocol";

interface CheckpointDividerProps {
  checkpoint: CheckpointSummary;
  index: number;
  isLoading: boolean;
  onRestore: (checkpointId: string) => void;
}

export function CheckpointDivider({ checkpoint, index, isLoading, onRestore }: CheckpointDividerProps) {
  const [showPopover, setShowPopover] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const time = new Date(checkpoint.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  // Close popover on outside click
  useEffect(() => {
    if (!showPopover) return;
    const handleClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setShowPopover(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showPopover]);

  const handleRestore = () => {
    onRestore(checkpoint.id);
    setShowPopover(false);
  };

  return (
    <div className="checkpoint-divider">
      <div className="checkpoint-line" />
      <span className="checkpoint-label">
        Checkpoint {index} ({time})
      </span>
      <div className="checkpoint-restore-wrapper" ref={popoverRef}>
        <button
          className="checkpoint-restore-btn"
          onClick={() => setShowPopover(!showPopover)}
          disabled={isLoading}
          title="Restore conversation and files to this point"
        >
          Restore
        </button>
        {showPopover && (
          <div className="checkpoint-popover">
            <button className="checkpoint-popover-action" onClick={handleRestore}>
              <span className="checkpoint-popover-icon">↺</span>
              Restore Files &amp; Task
            </button>
            <span className="checkpoint-popover-desc">
              Revert files and clear messages after this point
            </span>
          </div>
        )}
      </div>
      <div className="checkpoint-line" />
    </div>
  );
}
