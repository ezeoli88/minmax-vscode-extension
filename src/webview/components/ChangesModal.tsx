import type { FileChangeSummary } from "../../shared/protocol";

interface ChangesModalProps {
  fileChanges: FileChangeSummary[];
  onClose: () => void;
  onAcceptAllChanges: () => void;
  onRejectAllChanges: () => void;
  onOpenFileChange: (filePath: string) => void;
  onAcceptFileChange: (filePath: string) => void;
  onRejectFileChange: (filePath: string) => void;
}

export function ChangesModal({
  fileChanges,
  onClose,
  onAcceptAllChanges,
  onRejectAllChanges,
  onOpenFileChange,
  onAcceptFileChange,
  onRejectFileChange,
}: ChangesModalProps) {
  return (
    <div className="changes-modal-overlay" onClick={onClose}>
      <div className="changes-modal" onClick={(e) => e.stopPropagation()}>
        <div className="changes-modal-header">
          <span className="changes-modal-title">
            {fileChanges.length} file{fileChanges.length !== 1 ? "s" : ""} changed
          </span>
          <button className="changes-modal-close" onClick={onClose} title="Close">
            &times;
          </button>
        </div>
        <div className="changes-modal-actions">
          <button
            className="changes-modal-btn changes-modal-btn-accept"
            onClick={onAcceptAllChanges}
          >
            &#10003; Accept All
          </button>
          <button
            className="changes-modal-btn changes-modal-btn-reject"
            onClick={onRejectAllChanges}
          >
            &#10007; Reject All
          </button>
        </div>
        <div className="changes-modal-files">
          {fileChanges.map((fc) => {
            const fileName = fc.filePath.split(/[\\/]/).pop() || fc.filePath;
            const dirPath = fc.filePath.split(/[\\/]/).slice(-2, -1)[0] || "";
            return (
              <div key={fc.filePath} className="changes-modal-file">
                <div
                  className="changes-modal-file-info"
                  onClick={() => onOpenFileChange(fc.filePath)}
                  title={fc.filePath}
                >
                  <span className="changes-modal-file-name">
                    {fileName}
                    {fc.isNewFile && <span className="changes-badge-new">NEW</span>}
                  </span>
                  {dirPath && <span className="changes-modal-file-path">{dirPath}</span>}
                </div>
                <div className="changes-modal-file-stats">
                  {fc.addedLines > 0 && <span className="diff-stat-added">+{fc.addedLines}</span>}
                  {fc.removedLines > 0 && <span className="diff-stat-removed">-{fc.removedLines}</span>}
                </div>
                <div className="changes-modal-file-actions">
                  <button
                    className="changes-modal-icon-btn changes-modal-icon-accept"
                    onClick={() => onAcceptFileChange(fc.filePath)}
                    title="Accept"
                  >
                    &#10003;
                  </button>
                  <button
                    className="changes-modal-icon-btn changes-modal-icon-reject"
                    onClick={() => onRejectFileChange(fc.filePath)}
                    title="Reject"
                  >
                    &#10007;
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
