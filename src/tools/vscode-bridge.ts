type OpenBrowserFn = (url: string) => Promise<void>;

let _openBrowser: OpenBrowserFn | null = null;

export function setOpenBrowserHandler(fn: OpenBrowserFn): void {
  _openBrowser = fn;
}

export function getOpenBrowserHandler(): OpenBrowserFn | null {
  return _openBrowser;
}
