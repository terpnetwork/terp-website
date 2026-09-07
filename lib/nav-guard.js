// nav-guard.js — reads config.json defaultApps, dims disabled nav links,
// overlays "Coming Soon" on disabled pages, injects CSS once.

const STYLE_ID = 'nav-guard-styles';

function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
        .nav-link.nav-disabled,
        .page-nav-link.nav-disabled {
            opacity: 0.25;
            pointer-events: none;
            filter: blur(1px);
            user-select: none;
        }
        .nav-disabled-overlay {
            position: fixed;
            inset: 0;
            z-index: 9999;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            background: rgba(0, 0, 0, 0.75);
            backdrop-filter: blur(6px);
            -webkit-backdrop-filter: blur(6px);
        }
        .nav-disabled-overlay .coming-soon {
            font-family: var(--tn-font);
            font-size: 1.6rem;
            font-weight: 500;
            color: #6272a4;
            letter-spacing: 0.1em;
            text-transform: uppercase;
            margin-bottom: 0.75rem;
        }
        .nav-disabled-overlay .back-link {
            font-family: var(--tn-font);
            font-size: 0.85rem;
            color: #98e8c1;
            text-decoration: none;
            padding: 0.5rem 1.2rem;
            border: 1px solid rgba(152, 232, 193, 0.3);
            border-radius: 4px;
            transition: all 0.2s;
        }
        .nav-disabled-overlay .back-link:hover {
            background: rgba(152, 232, 193, 0.1);
            border-color: rgba(152, 232, 193, 0.5);
        }
    `;
    document.head.appendChild(style);
}

// Map page paths to app IDs
function pathToId(href) {
    const path = href.replace(/^\//, '').replace(/\.html$/, '');
    // Normalize known aliases
    const map = {
        'mint': 'mint',
        'tabs': 'tabs',
        'ibc': 'ibc',
        'no-rick': 'no-rick',
        'oline': 'oline',
        'admin': 'admin',
        'tx': 'tx',
        'passkey': 'passkey',
        'snapshots': 'snapshots',
        'snapshot': 'snapshots',
        'shell': 'shell',
        'headstash': 'headstash',
    };
    return map[path] || path;
}

function currentPageId() {
    const path = location.pathname.replace(/^\//, '').replace(/\.html$/, '');
    return pathToId(path);
}

export async function applyNavGuard() {
    injectStyles();

    let apps = [];
    try {
        const res = await fetch('/public/config.json');
        const cfg = await res.json();
        const chainId = location.hostname === 'localhost' ? '120u-1' : 'morocco-1';
        apps = cfg.chains?.[chainId]?.defaultApps || [];
    } catch {
        return; // Can't load config — skip guard
    }

    const disabledIds = new Set(
        apps.filter(a => a.disabled).map(a => a.id)
    );

    if (disabledIds.size === 0) return;

    // Dim disabled nav links
    document.querySelectorAll('.nav-link, .page-nav-link').forEach(link => {
        const href = link.getAttribute('href') || '';
        const id = pathToId(href);
        if (disabledIds.has(id)) {
            link.classList.add('nav-disabled');
            link.setAttribute('tabindex', '-1');
            link.setAttribute('aria-disabled', 'true');
        }
    });

    // If current page is disabled, overlay "Coming Soon"
    const pageId = currentPageId();
    if (disabledIds.has(pageId)) {
        const overlay = document.createElement('div');
        overlay.className = 'nav-disabled-overlay';
        overlay.innerHTML = `
            <div class="coming-soon">Coming Soon</div>
            <a href="/" class="back-link">Back to Home</a>
        `;
        document.body.appendChild(overlay);
    }
}
