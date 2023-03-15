interface RequestDetails {
  requestId: string;
  method: string;
  frameId: number;
  tabId: number;
  originUrl: string;
  responseHeaders?: browser.webRequest.HttpHeaders;
  statusCode?: number;
  statusLine?: string;
  url: string;
}
type BlockingResponse = browser.webRequest.BlockingResponse;

interface ManifestInfo {
  url: string;
  isDefault?: boolean;
  matches?: string[]; 
}

enum InjectState {
  before,
  within,
  after,
}

function manifestUrl(name: string): string {
  return browser.runtime.getURL(`manifests/${name}.json`);
}

const urls = [ "<all_urls>" ];
const DEFAULT_MANIFEST: ManifestInfo = {
  url: manifestUrl('default'),
  isDefault: true,
};
const MANIFESTS: { [domain: string]: ManifestInfo } = {
  'discord.com': {
    url: manifestUrl('discord'),
    matches: ['discord.com'],
  }
};

function getManifestForRequest(details: RequestDetails): ManifestInfo | null {
  const url = new URL(details.url); 
  const domain = url.hostname;

  const specificManifest = MANIFESTS[domain];
  if (specificManifest) {
    // TODO: Check matches
    return specificManifest;
  }

  // TODO: Use default manifest

  return null;
}

function manifestHTML(manifestInfo: ManifestInfo): string {
  return `<link rel="manifest" href="${manifestInfo.url}">`;
}

function injectManifest(details: RequestDetails) {
  const manifest = getManifestForRequest(details);
  if (!manifest) return;

  console.log("Filtering", details, manifest);
  const filter = browser.webRequest.filterResponseData(details.requestId);
  const decoder = new TextDecoder("utf-8");
  const encoder = new TextEncoder();

  let state = InjectState.before;
  let hasManifest = false;

  filter.ondata = (event) => {
    let data = decoder.decode(event.data, { stream: true });

    switch (state) {
      case InjectState.before:
        const headMatch = data.match(/<head[^>]*>/);
        if (!headMatch) break;
        state = InjectState.within;
        // Continue to within as may be in same chunk
      case InjectState.within:
        if (!hasManifest) {
          // Check for pre-existing manifests
          const manifestMatch = data.match(/<link[^>]*rel="?manifest"?[^>]*>/);
          if (manifestMatch) hasManifest = true;
        }
        const endMatch = data.match(/<\/head>/);
        if (endMatch) {
          state = InjectState.after;
          if (!hasManifest) {
            // Inject manifest tag
            // FIXME: Hacky casting here as typescript doesn't know about Symbol.replace
            data = data.replace(endMatch as unknown as RegExp, manifestHTML(manifest) + '</head>');
          }
        }
        break;
    }

    filter.write(encoder.encode(data));
  };

  filter.onstop = (event) => {
    filter.close();
  };
}

browser.webRequest.onBeforeRequest.addListener(
  injectManifest,
  // TODO: Only add listener for urls we care about
  { urls, types: ["main_frame"] },
  ["blocking"]
);

