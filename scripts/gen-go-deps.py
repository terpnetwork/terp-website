#!/usr/bin/env python3
"""Generate public/graphs/go-deps.json from terp-core's go.mod (direct deps only view).

Usage:
  python3 scripts/gen-go-deps.py                 # ssh groot-wan, ~/abstract/terp-core
  python3 scripts/gen-go-deps.py --local PATH    # run against a local terp-core checkout
Options: --host HOST --repo REPO --go GOBIN --out FILE
Uses `go mod edit -json` for the module list and `go mod graph` for edges.
Graph keeps only modules listed in go.mod (root + requires) at the go.mod-selected
version; every other module version is dropped. BFS depth is measured from the root; root edges go to direct requires only.
Also renders public/graphs/go-dependency-map.html from the Rust map
(public/graphs/dependency-map.html) so both views share one renderer.
"""
import argparse, collections, datetime, html, json, pathlib, re, shlex, subprocess

FORK_ORGS = ("github.com/permissionlessweb/",)

def run(cmd, host):
    if host:
        cmd = ["ssh", host, " ".join(shlex.quote(c) for c in cmd)]
    return subprocess.check_output(cmd, text=True)

def link(path, version=None):
    if path.startswith(("./", "../", "/")):
        return None
    if path.startswith("github.com/"):
        parts = path.split("/")
        if FORK_ORGS and path.startswith(FORK_ORGS):
            return "https://" + "/".join(parts[:3])
    return f"https://pkg.go.dev/{path}" + (f"@{version}" if version else "")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="groot-wan")
    ap.add_argument("--repo", default="~/abstract/terp-core")
    ap.add_argument("--local")
    ap.add_argument("--go", default="/usr/local/go/bin/go")
    ap.add_argument("--out", default=str(pathlib.Path(__file__).resolve().parent.parent / "public/graphs/go-deps.json"))
    a = ap.parse_args()
    host = None if a.local else a.host
    repo = a.local or a.repo
    sh = lambda s: run(["sh", "-c", f"cd {repo} && {s}"], host)
    mod = json.loads(sh(f"{a.go} mod edit -json"))
    commit, commit_date = sh("git log -1 --format='%H %cI'").split()
    reps = {r["Old"]["Path"]: r for r in mod.get("Replace") or []}
    deps = []
    for r in mod.get("Require") or []:
        p, v = r["Path"], r["Version"]
        d = {"path": p, "version": v, "direct": not r.get("Indirect", False), "url": link(p, v)}
        rp = reps.get(p)
        if rp:
            np, nv = rp["New"]["Path"], rp["New"].get("Version")
            d["replace"] = {"path": np, "version": nv,
                            "fork": np.startswith(FORK_ORGS), "local": nv is None and np.startswith("."),
                            "url": link(np, nv) if np.startswith(FORK_ORGS) else (None if np.startswith(".") else link(np, nv))}
        deps.append(d)
    replaces = [{"old": r["Old"]["Path"], "old_version": r["Old"].get("Version"),
                 "new": r["New"]["Path"], "new_version": r["New"].get("Version"),
                 "fork": r["New"]["Path"].startswith(FORK_ORGS)} for r in mod.get("Replace") or []]
    out = {
        "schema": "terp.go-deps/v1",
        "generated_at": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
        "source": {"file": "go.mod", "commit": commit, "commit_date": commit_date},
        "module": mod["Module"]["Path"], "go": mod.get("Go"), "toolchain": mod.get("Toolchain"),
        "counts": {"direct": sum(d["direct"] for d in deps), "indirect": sum(not d["direct"] for d in deps),
                   "replace": len(replaces), "fork": sum(r["fork"] for r in replaces)},
        "deps": deps, "replaces": replaces,
    }
    out["graph"] = build_graph(out, sh(f"{a.go} mod graph"))
    pathlib.Path(a.out).write_text(json.dumps(out, indent=1) + "\n")
    print(a.out, out["counts"], out["graph"]["by_depth"])
    page = render_page(out, pathlib.Path(a.out).parent)
    print(page)

def build_graph(out, graph_txt):
    root = out["module"]
    sel = {d["path"]: d["version"] for d in out["deps"]}
    direct = {d["path"]: d["direct"] for d in out["deps"]}
    keep = lambda tok: tok == root or ("@" in tok and sel.get(tok.rsplit("@", 1)[0]) == tok.rsplit("@", 1)[1])
    edges = set()
    for line in graph_txt.splitlines():
        parts = line.split()
        if len(parts) != 2 or not (keep(parts[0]) and keep(parts[1])):
            continue
        a, b = (t.rsplit("@", 1)[0] if t != root else t for t in parts)
        # go.mod lists every require under the root (pruned graph); only direct
        # requires count as root edges, so indirect modules get their real depth.
        if a != b and not (a == root and not direct.get(b)):
            edges.add((a, b))
    adj = collections.defaultdict(list)
    for a, b in sorted(edges):
        adj[a].append(b)
    depth, q = {root: 0}, collections.deque([root])
    while q:
        cur = q.popleft()
        for x in adj[cur]:
            if x not in depth:
                depth[x] = depth[cur] + 1
                q.append(x)
    by_depth = {}
    for D in (1, 2, 3):
        ns = {n for n, d in depth.items() if d <= D}
        by_depth[str(D)] = {"nodes": len(ns), "edges": sum(1 for a, b in edges if a in ns and b in ns)}
    by_depth["all"] = {"nodes": len(depth), "edges": sum(1 for a, b in edges if a in depth and b in depth)}
    return {"root": root, "default_depth": 2, "max_depth": max(depth.values()),
            "unreachable": sorted(set(sel) - set(depth)), "by_depth": by_depth,
            "nodes": [{"id": n, "depth": d} for n, d in sorted(depth.items(), key=lambda x: (x[1], x[0]))],
            "edges": [{"source": a, "target": b} for a, b in sorted(edges) if a in depth and b in depth]}


def _map_data(out, D):
    g = out["graph"]
    info = {d["path"]: d for d in out["deps"]}
    ns = {n["id"]: n["depth"] for n in g["nodes"] if n["depth"] <= D}
    es = [e for e in g["edges"] if e["source"] in ns and e["target"] in ns]
    deg = collections.Counter()
    for e in es:
        deg[e["source"]] += 1; deg[e["target"]] += 1
    nodes = []
    for nid, d in ns.items():
        if nid == out["module"]:
            nodes.append({"id": nid, "label": "terp-core", "kind": "consumer", "status": "aligned",
                          "url": "https://github.com/terpnetwork/terp-core", "depth": 0, "degree": deg[nid]})
            continue
        m = info[nid]; r = m.get("replace") or {}
        status = "diverged" if r.get("fork") else ("aligned" if m["direct"] else "local")
        label = nid.removeprefix("github.com/")
        nodes.append({"id": nid, "label": label, "kind": "repo", "status": status, "depth": d,
                      "url": r.get("url") or m.get("url") or "", "branch": r.get("version") or m["version"],
                      "subject": ("Replaced by " + r["path"]) if r else "", "degree": deg[nid]})
    return {"generated_at": out["generated_at"], "repos": [], "crates": [],
            "graph": {"nodes": nodes, "edges": [dict(e, crate="") for e in es]}}


def _rows(out):
    info = {d["path"]: d for d in out["deps"]}
    rows = []
    for n in out["graph"]["nodes"]:
        if n["id"] == out["module"]:
            continue
        m = info[n["id"]]; r = m.get("replace") or {}
        st = "diverged" if r.get("fork") else ("aligned" if m["direct"] else "local")
        rep = r.get("path", "") if r and r.get("path") != m["path"] else ("pinned" if r else "")
        e = html.escape
        rows.append(f'<tr data-status="{st}" data-dest="{e(n["id"])}" data-kind="repo"><td><code>{e(n["id"])}</code></td>'
                    f'<td><code>{e(r.get("version") or m["version"])}</code></td><td><span class="badge">{st}</span></td>'
                    f'<td><code>{e(rep or "—")}</code></td><td class="mono">{n["depth"]}</td></tr>')
    return "".join(rows)


# Text swaps on the Rust map so the shared renderer speaks about Go modules.
_SWAPS = [
    ("aligned: 'Aligned', drifted: 'Drifted', local: 'Local only', missing: 'Missing', app: 'Terp project'",
     "aligned: 'Direct', drifted: 'Fork', local: 'Indirect', missing: 'Missing', app: 'Terp node'"),
    ("aligned: 'On the release branch'", "aligned: 'Required directly in go.mod'"),
    ("drifted: 'On a different branch from the release'", "drifted: 'Replaced by a Terp-maintained fork'"),
    ("local: 'Not tracked on the release branch'", "local: 'Required indirectly'"),
    ("app: 'A Terp project that uses these libraries'", "app: 'The Terp node module'"),
    ("`${plural(counts.repo, 'repository', 'repositories')} · ${plural(counts.app, 'Terp project')} · ${plural(PAIRS.length, 'link')}`",
     "`${plural(counts.repo, 'module')} · ${plural(PAIRS.length, 'link')} · depth ${DEPTH}`"),
    ("branch <code>${esc(n.branch)}</code>", "<code>${esc(n.branch)}</code>"),
    ("['Release branch',", "['Version',"),
    ("['Latest change',", "['Replace',"),
    ("? 'Terp project' : 'Repository')", "? 'Terp node' : 'Module')"),
    ("rel=\"noopener\">GitHub</a>", "rel=\"noopener\">Module page</a>"),
    ("const id = tierFocus || selId || 'cosmwasm';", "const id = tierFocus || selId || ROOT;"),
    ("byId.cosmwasm ? 'cosmwasm' :", "byId[ROOT] ? ROOT :"),
    ("'Filter the list' : 'Find a repository'", "'Filter the list' : 'Find a module'"),
    ('placeholder="Find a repository"', 'placeholder="Find a module"'),
    ('aria-label="Find a repository"', 'aria-label="Find a module"'),
    ('>Find a repository<', '>Find a module<'),
    ('aria-label="Map of Terp repositories and the libraries they depend on"', 'aria-label="Map of the Go modules the Terp node depends on"'),
    ("plural(n, 'repository', 'repositories') : `${n} of ${repoRows.length} repositories`", "plural(n, 'module') : `${n} of ${repoRows.length} modules`"),
    ('data-list="repos" aria-selected="true">Repositories<', 'data-list="repos" aria-selected="true">Modules<'),
    ('<button type="button" class="g-view" role="tab" data-list="crates"', '<button type="button" class="g-view" role="tab" data-list="crates" hidden'),
    ("<th>Repository</th><th>Release branch</th><th>Status</th><th>Local branch</th><th>Commit</th>",
     "<th>Module</th><th>Version</th><th>Kind</th><th>Replaced by</th><th>Depth</th>"),
    ("const DATA = JSON.parse(document.getElementById('DATA').textContent);",
     "const ALL = JSON.parse(document.getElementById('DATA').textContent);\n"
     "  const DEPTH = ['1', '2', '3'].includes(new URLSearchParams(location.search).get('depth')) ? new URLSearchParams(location.search).get('depth') : String(ALL.default_depth);\n"
     "  const ROOT = ALL.root;\n  const DATA = ALL.by_depth[DEPTH];"),
]


def render_page(out, gdir):
    src = (gdir / "dependency-map.html").read_text()
    for a, b in _SWAPS:
        if a not in src:
            raise SystemExit(f"template changed, swap not found: {a[:60]}")
        src = src.replace(a, b)
    payload = {"root": out["module"], "default_depth": out["graph"]["default_depth"],
               "by_depth": {str(D): _map_data(out, D) for D in (1, 2, 3)}}
    blob = json.dumps(payload, separators=(",", ":")).replace("</", "<\\/")
    src = re.sub(r'(<script id="DATA" type="application/json">).*?(</script>)', lambda m: m.group(1) + blob + m.group(2), src, count=1, flags=re.S)
    src = re.sub(r'(<table id="repos">.*?<tbody>).*?(</tbody>)', lambda m: m.group(1) + _rows(out) + m.group(2), src, count=1, flags=re.S)
    src = re.sub(r'(<table id="crates">.*?<tbody>).*?(</tbody>)', lambda m: m.group(1) + m.group(2), src, count=1, flags=re.S)
    src = re.sub(r"<title>.*?</title>", "<title>Go module graph · Terp Network</title>", src, count=1, flags=re.S)
    dest = gdir / "go-dependency-map.html"
    dest.write_text(src)
    return dest

if __name__ == "__main__":
    main()
