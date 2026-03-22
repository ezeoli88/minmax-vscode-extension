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
          <p className="whats-new-highlight">🎉 MiniMax M2.7 is here!</p>
          <ul className="whats-new-list">
            <li>
              <strong>MiniMax-M2.7</strong> — The latest and most capable MiniMax model, now available as the default.
            </li>
            <li>
              <strong>MiniMax-M2.7-highspeed</strong> — High-speed variant for faster responses with great quality.
            </li>
            <li>
              All previous models (M2.5, M2.1) remain available in the model picker.
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
