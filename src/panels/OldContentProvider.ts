import * as vscode from "vscode";

export class OldContentProvider implements vscode.TextDocumentContentProvider {
  static readonly scheme = "minimax-diff";

  private contents = new Map<string, string>();

  set(key: string, content: string): vscode.Uri {
    this.contents.set(key, content);
    return vscode.Uri.parse(`${OldContentProvider.scheme}:${key}`);
  }

  delete(key: string): void {
    this.contents.delete(key);
  }

  clearAll(): void {
    this.contents.clear();
  }

  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.contents.get(uri.path) ?? "";
  }
}
