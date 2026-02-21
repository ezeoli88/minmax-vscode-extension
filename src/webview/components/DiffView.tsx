import type { FileChangeData } from "../../shared/protocol";

interface DiffViewProps {
  data: FileChangeData;
}

export function DiffView({ data }: DiffViewProps) {
  const added = data.diffLines.filter((l) => l.type === "added").length;
  const removed = data.diffLines.filter((l) => l.type === "removed").length;

  return (
    <div className="diff-view">
      <div className="diff-header">
        <span className="diff-filepath">{data.filePath}</span>
        {data.isNewFile ? (
          <span className="diff-badge-new">NEW</span>
        ) : (
          <span className="diff-stats">
            {added > 0 && <span className="diff-stat-added">+{added}</span>}
            {removed > 0 && <span className="diff-stat-removed">-{removed}</span>}
          </span>
        )}
      </div>
      <div className="diff-lines">
        {data.diffLines.map((line, i) => (
          <div key={i} className={`diff-line diff-line-${line.type}`}>
            <span className="diff-line-marker">
              {line.type === "added" ? "+" : line.type === "removed" ? "-" : " "}
            </span>
            <span className="diff-line-content">{line.content || "\n"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
