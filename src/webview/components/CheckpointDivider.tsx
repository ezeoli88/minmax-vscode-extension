import type { CheckpointSummary } from "../../shared/protocol";

interface CheckpointDividerProps {
  checkpoint: CheckpointSummary;
  index: number;
  isLoading: boolean;
  onRestore: (checkpointId: string) => void;
}

export function CheckpointDivider({ checkpoint, index, isLoading, onRestore }: CheckpointDividerProps) {
  const time = new Date(checkpoint.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const handleRestore = () => {
    if (confirm(`Restore to this checkpoint? This will revert files and remove all messages after this point.`)) {
      onRestore(checkpoint.id);
    }
  };

  return (
    <div className="checkpoint-divider">
      <div className="checkpoint-line" />
      <span className="checkpoint-label">
        Checkpoint {index} ({time})
      </span>
      <button
        className="checkpoint-restore-btn"
        onClick={handleRestore}
        disabled={isLoading}
        title="Restore conversation and files to this point"
      >
        Restore
      </button>
      <div className="checkpoint-line" />
    </div>
  );
}
