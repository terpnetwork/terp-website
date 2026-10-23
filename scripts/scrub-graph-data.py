#!/usr/bin/env python3
"""Scrub operational detail out of the published graph data (WD3).

Removes internal hostnames, ports, home/file paths, container/bucket names,
internal repo paths, ticket refs and similar from the JSON embedded in
public/graphs/*.html and the generated JSON files. Idempotent; prints every
change so the removal list stays auditable.

  python3 scripts/scrub-graph-data.py [--check]
"""
import json, re, sys, pathlib

G = pathlib.Path(__file__).resolve().parent.parent / "public/graphs"
CHECK = "--check" in sys.argv
LEAK = re.compile(r"groot[\w-]*|\b\d{1,3}(?:\.\d{1,3}){3}\b|localhost|(?<![\w.:/])\:\d{2,5}\b|~/|/Users/|/home/|minio-terp[\w-]*|terp-core/(?:crates|websites)|\bREF t_\w+|\.toml\b|\.sh\b|dep\.py|admission\.rs|[A-Z][A-Z-]+\.md\b", re.I)

# Ordered text rewrites (pattern, replacement). Each hit is logged.
TEXT = [
    (r"\n## Operator start\n```bash\n(?:open [^\n]+\n)+```\n", "\n"),
    (r"Hermes \(groot SoR boards\)", "Hermes (private ops boards)"),
    (r"## Boards \(groot only\)", "## Boards"),
    (r"`community-gateway` · `event-ops` · `marketing-ops`  \nNo dual-mint secrets from laptop\.", "Private kanban boards for event, marketing and community work."),
    (r"Pack `ACCESS-HIERARCHY\.md` \+ `channels\.toml`\.", "Set by the event pack's access hierarchy and channel list."),
    (r"See `COMPUTE-INFRA-PULSE\.md` \+ INFRA-CHECKLIST §8b\.", "See the event compute and infra checklist."),
    (r"Private ops SoR on groot :9119\. Never public CF\. Boards: community-gateway, event-ops, marketing-ops, groot2-ops\.", "Private ops kanban (system of record for event, marketing and community boards). Not exposed publicly."),
    (r"Private ops SoR on groot :9119\. Never public CF\. Boards: .*$", "Private ops kanban for event, marketing and community boards. Not exposed publicly."),
    (r"Hermes kanban \(groot\)", "Hermes kanban"),
    (r"\(local compose or groot2 \+ public corridor ", "(local or lab relay + public corridor "),
    (r" marketing-ops board on groot\.", " Tracked on the marketing board."),
    (r" Mint on groot only\.", ""),
    (r"Pipeline epic REF t_\w+\. Groot SoR\.", "Pipeline epic for the event."),
    (r"Hermes boards: mint only on \*\*groot\*\* \(no dual-mint secrets from laptop\)\.", "Hermes boards are private and minted from one ops host."),
    (r"Hermes boards: mint only on groot \(no dual-mint secrets from laptop\)\.", "Hermes boards are private and minted from one ops host."),
    (r"dep\.py \+ dependency-matrix\.toml control plane", "Dependency-matrix control plane"),
    (r"dep\.py / just deps-\*", "Dependency matrix tooling"),
    (r"WORKFLOW\.md phases: ", "Workflow phases: "),
    (r"; sync-event-from-chain \+ sync-cw-orch-state-s3\.", "."),
    (r"spawn-buzz-relayer\.sh \+ seed-channels-from-pack", "Relay spawn + channel seeding from the pack"),
    (r" buzz-acp admission\.rs · IMPL-01\.", ""),
    (r" crates/inference-edge · IMPL-02\.", " inference-edge."),
    (r"channels\.toml, ACCESS-HIERARCHY, checklist, tasks/INFRA\+IMPL DELTAs\.", "Channel list, access hierarchy and checklists."),
    (r"Chain/docker/edge — presence ACK for rebuilds\.", "Chain and edge rebuilds: presence check-in."),
    (r"^ROUTES\.md$", "Routes"),
    (r"Pair with dependency-map\.html for crate SoT\.", "Pair with the crate dependency map."),
    (r"local HEAD not found on GitHub remote \(lab/groot-only tip\) — commit link omitted; use repo/branch when available", "commit not on the GitHub remote yet; links go to the repo and branch"),
    (r" \(groot\)$", ""),
    (r"consumer workspace \(websites/terp\.network/scripts\)", "consumer workspace (terp.network scripts)"),
    (r"^websites/terp\.network/scripts$", "terp.network scripts"),
]
DROP_KEYS = {  # (file, dotted key) removed outright
    "ops": ["content_brief", "related.dependency_json", "related.matrix", "related.grant_zk_page", "related.event_task_pulse", "related.event_task_hub", "related.stable", "related.ops_map_json", "nodes[].path", "sequences.*.path"],
    "dep": ["matrix_path", "monorepo_root", "repos[].local.path", "repos[].local.dirty"],
}
log = []

def rewrite(s, where):
    for pat, rep in TEXT:
        n = re.sub(pat, rep, s, flags=re.M)
        if n != s:
            log.append(f"{where}: /{pat[:60]}/ → {rep[:60]!r}")
            s = n
    return s

def walk(o, where):
    if isinstance(o, dict):
        return {k: walk(v, f"{where}.{k}") for k, v in o.items()}
    if isinstance(o, list):
        return [walk(v, f"{where}[]") for v in o]
    if isinstance(o, str):
        return rewrite(o, where)
    return o

def drop(d, spec, tag):
    def rec(o, parts, where):
        if not parts or o is None:
            return
        p, rest = parts[0], parts[1:]
        if p.endswith("[]"):
            for x in o.get(p[:-2], []) or []:
                rec(x, rest, where + "." + p)
        elif p == "*":
            for k, x in list(o.items()):
                rec(x, rest, where + "." + k) if rest else None
        elif not rest:
            if isinstance(o, dict) and p in o:
                log.append(f"{tag}: removed {where}.{p} = {json.dumps(o[p])[:80]}")
                del o[p]
        else:
            rec(o.get(p) if isinstance(o, dict) else None, rest, where + "." + p)
    for s in spec:
        rec(d, s.split("."), tag)

def html_json(path, tag):
    s = path.read_text()
    m = re.search(r'(<script id="DATA" type="application/json">)(.*?)(</script>)', s, re.S)
    d = json.loads(m.group(2))
    drop(d, DROP_KEYS.get(tag, []), tag)
    if tag == "ops":
        d["related"] = {k: v for k, v in (d.get("related") or {}).items()}
        d["related"]["grant_zk_url"] = d["related"].get("grant_zk_url") or "https://permissionless.money/zk"
        # graph-local links stay; nothing outside public/graphs
        d["related"] = {k: v for k, v in d["related"].items() if v.startswith("https://") or v in ("dependency-map.html",)}
    d = walk(d, tag)
    out = s[:m.start(2)] + json.dumps(d, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/") + s[m.end(2):]
    return path, s, out

def json_file(path, tag, fn):
    s = path.read_text(); d = json.loads(s); fn(d); return path, s, json.dumps(d, separators=(",", ":"))

def go_fix(d):
    src = d.get("source") or {}
    for k in ("host", "repo"):
        if k in src:
            log.append(f"go-deps.json: removed source.{k} = {src[k]!r}"); del src[k]
    src.setdefault("repo_url", "https://github.com/terpnetwork/terp-core")

def rust_fix(d):
    for r in d.get("roots", []):
        if "path" in r:
            log.append(f"rust-crates.json: removed roots[{r['id']}].path = {r['path']!r}"); del r["path"]

jobs = [html_json(G / "ops-resource-map.html", "ops"), html_json(G / "dependency-map.html", "dep"),
        json_file(G / "go-deps.json", "go", go_fix), json_file(G / "rust-crates.json", "rust", rust_fix)]
for p, old, new in jobs:
    left = sorted(set(m.group(0) for m in LEAK.finditer(new)))
    print(f"{p.name}: {'changed' if old != new else 'clean'}; residual pattern hits: {left[:20]}")
    if not CHECK and old != new:
        p.write_text(new)
print("\n".join(log))
