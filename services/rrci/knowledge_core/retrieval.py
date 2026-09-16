from collections import Counter, deque
import json
import math
import re
from .types import APIError

STOP = set("a an the what which who how when where is are was were of on at in to for and or with from our we it this that do does can should please explain tell me".split())


def tokens(value):
    return [w for w in re.findall(r"\w+", value.casefold()) if w not in STOP]


def rank_chunks(question, rows, provider=None):
    query = set(tokens(question))
    if not rows or not query:
        return [], "lexical"
    bags = [Counter(tokens(r["title"] + " " + r["content"])) for r in rows]
    avg_len = sum(sum(b.values()) for b in bags) / len(bags) or 1
    df = Counter(term for bag in bags for term in bag)
    scores = []
    for row, bag in zip(rows, bags):
        length = sum(bag.values())
        score = 0
        for term in query:
            freq = bag[term]
            if freq:
                idf = math.log(1 + (len(rows) - df[term] + .5) / (df[term] + .5))
                score += idf * (freq * 2.5) / (freq + 1.5 * (.25 + .75 * length / avg_len))
        if score > 0:
            scores.append((row["id"], score))
    lexical = sorted(scores, key=lambda x: (-x[1], x[0]))
    if not provider or provider.embedding_id == "none":
        return lexical, "lexical_bm25"
    if any(r["embedding_id"] != provider.embedding_id or not r["embedding"] for r in rows):
        raise APIError(409, "Re-ingest this collection with the configured embedding model before querying")
    qvector = provider.embed([question])[0]
    qnorm = math.sqrt(sum(n*n for n in qvector))
    semantic = []
    for row in rows:
        vector = json.loads(row["embedding"])
        if len(vector) != len(qvector):
            raise APIError(409, "Embedding dimensions differ; re-index with a fixed model version")
        similarity = sum(a*b for a, b in zip(qvector, vector)) / (qnorm * math.sqrt(sum(n*n for n in vector)))
        if similarity >= .25:
            semantic.append((row["id"], similarity))
    semantic.sort(key=lambda x: (-x[1], x[0]))
    # Reciprocal rank fusion; these scores are rankings, not confidence probabilities.
    fused = Counter()
    for ranking in (lexical, semantic):
        for rank, (chunk, _) in enumerate(ranking):
            fused[chunk] += 1 / (60 + rank + 1)
    return sorted(fused.items(), key=lambda x: (-x[1], x[0])), "bm25_vector_rrf"


def graph_starts(question, edges, seeds):
    labels = {e[k] for e in edges for k in ("source", "target")}
    by_name = {label.casefold(): label for label in sorted(labels)}
    if seeds:
        starts = [by_name[s.casefold()] for s in seeds if s.casefold() in by_name]
    else:
        question_folded = question.casefold()
        starts = [label for label in sorted(labels, key=lambda x: (-len(x), x))
                  if re.search(r"(?<!\w)" + re.escape(label.casefold()) + r"(?!\w)", question_folded)][:3]
    return list(dict.fromkeys(starts))


def graph_paths(question, edges, seeds, hops, limit=24):
    starts = graph_starts(question, edges, seeds)
    adjacent = {}
    for edge in edges:
        adjacent.setdefault(edge["source"], []).append((edge["target"], edge))
        adjacent.setdefault(edge["target"], []).append((edge["source"], edge))
    queue = deque((start, [start], []) for start in starts)
    paths, seen = [], set()
    while queue and len(paths) < limit:
        node, nodes, trail = queue.popleft()
        if len(trail) >= hops:
            continue
        for target, edge in adjacent.get(node, []):
            if target in nodes:
                continue
            path = trail + [edge]
            signature = tuple(e["id"] for e in path)
            if signature in seen:
                continue
            seen.add(signature)
            paths.append({"nodes": nodes + [target], "edges": path})
            queue.append((target, nodes + [target], path))
            if len(paths) >= limit:
                break
    return paths


def retrieve(question, rows, edges, mode, seeds, hops, top_k, provider=None, paths_override=None):
    by_id = {r["id"]: r for r in rows}
    ranking, method = rank_chunks(question, rows, provider) if mode != "graph" else ([], "graph_only")
    paths = (paths_override if paths_override is not None else graph_paths(question, edges, seeds, hops)) if mode != "rag" else []
    selected, selected_paths = [], []
    # Keep the supporting source of every traversed edge inside the context budget.
    for path in paths:
        needed = list(dict.fromkeys(e["chunk_id"] for e in path["edges"]))
        addition = [cid for cid in needed if cid not in selected]
        if len(selected) + len(addition) <= top_k:
            selected.extend(addition)
            selected_paths.append(path)
    for chunk_id, _ in ranking:
        if len(selected) >= top_k:
            break
        if chunk_id not in selected:
            selected.append(chunk_id)
    refs = {chunk_id: f"C{i + 1}" for i, chunk_id in enumerate(selected)}
    evidence = [{"citation_id": refs[cid], "chunk_id": cid, "document_id": by_id[cid]["document_id"],
                 "revision": by_id[cid]["revision"], "title": by_id[cid]["title"],
                 "source_uri": by_id[cid]["source_uri"], "quote": by_id[cid]["content"]} for cid in selected]
    public_paths = [{"nodes": path["nodes"], "edges": [{"id": e["id"], "source": e["source"],
                       "relation": e["relation"], "target": e["target"], "quote": e["quote"],
                       "citation_id": refs[e["chunk_id"]]} for e in path["edges"]]} for path in selected_paths]
    return evidence, public_paths, {"method": method, "ranked_chunks": [cid for cid, _ in ranking[:20]],
                                    "matched_paths": len(paths), "included_paths": len(public_paths)}
