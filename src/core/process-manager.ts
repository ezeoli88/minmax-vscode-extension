import { execSync } from "child_process";

export interface TrackedProcess {
  pid: number;
  port: number | null;
  command: string;
  startTime: number;
}

class ProcessManager {
  private processes = new Map<number, TrackedProcess>();

  register(proc: TrackedProcess): void {
    this.processes.set(proc.pid, proc);
  }

  stop(port: number): string {
    for (const [pid, proc] of this.processes) {
      if (proc.port === port) {
        return this.killProcess(pid);
      }
    }
    return `No process found on port ${port}`;
  }

  stopAll(): string {
    if (this.processes.size === 0) {
      return "No background processes running.";
    }
    const results: string[] = [];
    for (const pid of [...this.processes.keys()]) {
      results.push(this.killProcess(pid));
    }
    return results.join("\n");
  }

  list(): TrackedProcess[] {
    for (const [pid] of this.processes) {
      if (!this.isAlive(pid)) {
        this.processes.delete(pid);
      }
    }
    return Array.from(this.processes.values());
  }

  private killProcess(pid: number): string {
    const proc = this.processes.get(pid);
    const desc = proc
      ? `${proc.command} (PID ${pid}, port ${proc.port ?? "N/A"})`
      : `PID ${pid}`;
    try {
      if (process.platform === "win32") {
        execSync(`taskkill /T /F /PID ${pid}`, { stdio: "ignore" });
      } else {
        process.kill(-pid, "SIGTERM");
      }
      this.processes.delete(pid);
      return `Stopped: ${desc}`;
    } catch {
      this.processes.delete(pid);
      return `Process already stopped: ${desc}`;
    }
  }

  private isAlive(pid: number): boolean {
    try {
      if (process.platform === "win32") {
        const out = execSync(`tasklist /FI "PID eq ${pid}" /NH`, {
          stdio: "pipe",
          encoding: "utf-8",
        });
        return out.includes(String(pid));
      }
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }
}

export const processManager = new ProcessManager();
