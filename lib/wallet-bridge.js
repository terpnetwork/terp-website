// wallet-bridge.js — PostMessage protocol for shell ↔ iframe wallet bridging
// Messages prefixed with "terp-shell:" to avoid collisions
//
// Security:
//   - Host validates e.origin === own origin and e.source is a registered iframe
//   - Client validates e.origin === parent origin
//   - All postMessage calls use explicit targetOrigin (never '*')
//   - Request IDs use crypto.randomUUID() to prevent spoofing

const PREFIX = 'terp-shell:';

// ── Host side (used by shell.html) ──────────────────────────────────────

export function createWalletHost() {
    const iframes = new Set();
    let currentState = { connected: false, address: null, chainId: null };
    let txHandler = null;
    const selfOrigin = window.location.origin;

    function isRegisteredSource(source) {
        for (const iframe of iframes) {
            if (iframe.contentWindow === source) return true;
        }
        return false;
    }

    function broadcast(type, data) {
        for (const iframe of iframes) {
            try {
                iframe.contentWindow?.postMessage(
                    { type: PREFIX + type, ...data },
                    selfOrigin
                );
            } catch {}
        }
    }

    // Listen for messages from iframes
    window.addEventListener('message', (e) => {
        // Validate origin — only accept same-origin messages
        if (e.origin !== selfOrigin) return;
        if (!e.data?.type?.startsWith(PREFIX)) return;
        // Validate source is a registered iframe
        if (!isRegisteredSource(e.source)) return;

        const type = e.data.type.slice(PREFIX.length);
        if (type === 'wallet-tx-request' && txHandler) {
            txHandler(e.data, e.source);
        }
        if (type === 'wallet-state-request') {
            try {
                e.source?.postMessage({
                    type: PREFIX + 'wallet-state',
                    ...currentState,
                }, selfOrigin);
            } catch {}
        }
    });

    return {
        registerIframe(iframe) { iframes.add(iframe); },
        unregisterIframe(iframe) { iframes.delete(iframe); },

        updateState(state) {
            currentState = { ...state };
            broadcast('wallet-state', currentState);
        },

        onTxRequest(handler) { txHandler = handler; },

        sendTxResult(targetWindow, result) {
            try {
                targetWindow.postMessage({
                    type: PREFIX + 'wallet-tx-result',
                    ...result,
                }, selfOrigin);
            } catch {}
        },
    };
}

// ── Client side (used by embedded pages) ─────────────────────────────────

export function createWalletClient() {
    const callbacks = [];
    const pending = new Map();
    // Determine the expected parent origin for validation
    const parentOrigin = isEmbedded() ? getParentOrigin() : null;

    window.addEventListener('message', (e) => {
        // Not embedded — reject all postMessage wallet events
        if (!parentOrigin) return;
        // Validate origin — only accept messages from expected parent
        if (e.origin !== parentOrigin) return;
        // Validate source is actually the parent frame
        if (e.source !== window.parent) return;
        if (!e.data?.type?.startsWith(PREFIX)) return;

        const type = e.data.type.slice(PREFIX.length);
        if (type === 'wallet-state') {
            for (const cb of callbacks) cb(e.data);
        }
        if (type === 'wallet-tx-result') {
            const entry = pending.get(e.data.requestId);
            if (entry) {
                pending.delete(e.data.requestId);
                clearTimeout(entry.timer);
                entry.resolve(e.data);
            }
        }
    });

    return {
        onWalletState(callback) {
            callbacks.push(callback);
            if (isEmbedded() && parentOrigin) {
                window.parent.postMessage(
                    { type: PREFIX + 'wallet-state-request' },
                    parentOrigin
                );
            }
        },

        requestTx(msgs, memo = '') {
            if (!isEmbedded()) return Promise.reject(new Error('Not embedded'));
            const id = crypto.randomUUID();
            return new Promise((resolve, reject) => {
                const timer = setTimeout(() => {
                    pending.delete(id);
                    reject(new Error('Tx request timed out (60s)'));
                }, 60_000);
                pending.set(id, { resolve, timer });
                window.parent.postMessage({
                    type: PREFIX + 'wallet-tx-request',
                    requestId: id,
                    msgs,
                    memo,
                }, parentOrigin);
            });
        },

        isEmbedded,
    };
}

export function isEmbedded() {
    try { return window.self !== window.top; } catch { return true; }
}

function getParentOrigin() {
    // For same-origin iframes, the parent shares our origin
    try {
        return window.parent.location.origin;
    } catch {
        // Cross-origin — fall back to our own origin (safe default for same-site)
        return window.location.origin;
    }
}
