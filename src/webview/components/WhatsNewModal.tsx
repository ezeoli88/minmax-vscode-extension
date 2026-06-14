interface WhatsNewModalProps {
  version: string;
  onDismiss: () => void;
}

export function WhatsNewModal({ version, onDismiss }: WhatsNewModalProps) {
  return (
    <div className="changes-modal-overlay">
      <div className="whats-new-modal">
        <div className="whats-new-header">
          <span className="whats-new-title">What's New in v{version}</span>
        </div>
        <div className="whats-new-body">
          <p className="whats-new-highlight">🎉 MiniMax M3 is here!</p>
          <ul className="whats-new-list">
            <li>
              <strong>MiniMax-M3</strong> — The latest M-series model for coding and agent workflows, now available as the default.
            </li>
            <li>
              1M-token context window for larger codebases and longer sessions.
            </li>
            <li>
              Previous models (M2.7, M2.5, M2.1) remain available in the model picker.
            </li>
          </ul>
          <p className="whats-new-note">
            Select your preferred model from the status bar at the bottom of the chat panel.
          </p>
        </div>
        <div className="whats-new-footer">
          <button className="whats-new-continue-btn" onClick={onDismiss}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
