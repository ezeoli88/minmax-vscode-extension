import type { SubAgentTask } from "../../shared/protocol";

interface SubAgentIndicatorProps {
  tasks: SubAgentTask[];
}

export function SubAgentIndicator({ tasks }: SubAgentIndicatorProps) {
  if (tasks.length === 0) return null;

  const allDone = tasks.every((t) => t.status === "completed" || t.status === "error");

  return (
    <div className="subagent-indicator">
      <div className="subagent-header">
        {allDone ? "Exploration complete" : "Exploring..."}
      </div>
      <div className="subagent-tasks">
        {tasks.map((task) => (
          <div key={task.taskId} className={`subagent-task subagent-task-${task.status}`}>
            <span className="subagent-task-icon">
              {task.status === "completed" && "\u2713"}
              {task.status === "error" && "\u2717"}
              {task.status === "running" && (
                <span className="subagent-spinner" />
              )}
            </span>
            <span className="subagent-task-desc">{task.description}</span>
            {task.status === "running" && task.currentTool && (
              <span className="subagent-task-tool">{task.currentTool}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
