#!/usr/bin/env python3
"""Offline, opt-in preflight for ChatGPT privacy exports; NO robot integration.

Never uploads or extracts an archive; only processes current, visible text-only
messages. No private archive or derived capsule belongs in a public repository.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import zipfile

SCHEMA = "soulbridge.capsule.v1"
MAX_FILES = 4000
MAX_MEMBER = 200 * 1024 * 1024
MAX_AGGREGATE = 300 * 1024 * 1024
MAX_EXCERPTS = 18
MAX_PER_CONVERSATION = 6
MAX_TEXT = 1500
PATTERN = re.compile(r"conversations(?:[-_]\d+)?\.json\Z", re.I)

class ImportErrorSafe(ValueError):
    pass

def _members(zf):
    infos = zf.infolist()
    if len(infos) > MAX_FILES:
        raise ImportErrorSafe("ARCHIVE_TOO_MANY_FILES")
    matches = []
    total = 0
    for entry in infos:
        # Only exact root-level JSON names. No extraction or traversal.
        if "/" in entry.filename or "\\" in entry.filename:
            continue
        if not PATTERN.fullmatch(entry.filename):
            continue
        if entry.file_size > MAX_MEMBER or entry.file_size < 1:
            raise ImportErrorSafe("CONVERSATIONS_JSON_SIZE_LIMIT")
        total += entry.file_size
        if total > MAX_AGGREGATE:
            raise ImportErrorSafe("EXPORT_JSON_SIZE_LIMIT")
        if entry.compress_size and entry.file_size / max(entry.compress_size, 1) > 300:
            raise ImportErrorSafe("SUSPICIOUS_COMPRESSION_RATIO")
        matches.append(entry)
    if not matches:
        raise ImportErrorSafe("CONVERSATIONS_JSON_NOT_FOUND")
    return matches

def load_export(archive):
    """Read only conversation JSON, never extract anything from ZIP."""
    result = {}
    try:
        with zipfile.ZipFile(archive) as zf:
            for info in _members(zf):
                with zf.open(info) as f:
                    data = f.read(MAX_MEMBER + 1)
                if len(data) > MAX_MEMBER:
                    raise ImportErrorSafe("CONVERSATIONS_JSON_SIZE_LIMIT")
                try:
                    parsed = json.loads(data)
                except (ValueError, UnicodeDecodeError) as e:
                    raise ImportErrorSafe("INVALID_CONVERSATIONS_JSON") from e
                if isinstance(parsed, dict):
                    parsed = parsed.get("conversations")
                if not isinstance(parsed, list):
                    raise ImportErrorSafe("UNSUPPORTED_EXPORT_STRUCTURE")
                for conv in parsed:
                    if not isinstance(conv, dict):
                        continue
                    cid = conv.get("id") or conv.get("conversation_id")
                    if not isinstance(cid, str) or not cid or len(cid) > 200:
                        continue
                    if cid in result:
                        raise ImportErrorSafe("DUPLICATED_CONVERSATION_ID")
                    result[cid] = conv
    except (zipfile.BadZipFile, OSError) as e:
        raise ImportErrorSafe("CANNOT_READ_EXPORT_ARCHIVE") from e
    return result

def visible_history(conv):
    """Follow current_node parent chain, never flattened alternative branches."""
    graph = conv.get("mapping")
    current = conv.get("current_node")
    if not isinstance(graph, dict) or not isinstance(current, str):
        return []
    chain, seen = [], set()
    while current is not None:
        if current in seen or len(seen) > 50000:
            raise ImportErrorSafe("INVALID_CONVERSATION_GRAPH")
        seen.add(current)
        node = graph.get(current)
        if not isinstance(node, dict):
            raise ImportErrorSafe("BROKEN_CURRENT_CONVERSATION_BRANCH")
        msg = node.get("message")
        if isinstance(msg, dict):
            author = msg.get("author")
            role = author.get("role") if isinstance(author, dict) else None
            metadata = msg.get("metadata") or {}
            recipient = msg.get("recipient", "all")
            if (role in {"user", "assistant"} and recipient in ("all", None) and
                    not (isinstance(metadata, dict) and metadata.get("is_visually_hidden_from_conversation"))):
                content = msg.get("content")
                parts = content.get("parts", []) if isinstance(content, dict) else []
                if isinstance(parts, list):
                    txt = "\n".join(part for part in parts if isinstance(part, str)).strip()
                    if txt:
                        chain.append({"role": role, "text": txt[:MAX_TEXT]})
        current = node.get("parent")
    return chain[::-1]

def inventory(archive):
    conversations = load_export(archive)
    usable = sum(bool(visible_history(c)) for c in conversations.values())
    return {"conversations": len(conversations), "conversations_with_visible_text": usable,
            "data_sent_to_network": False, "private_capsule_created": False}

def _reject_git_path(destination):
    dest = Path(destination).expanduser().resolve()
    for ancestor in (dest.parent, *dest.parents):
        if (ancestor / ".git").exists():
            raise ImportErrorSafe("OUTPUT_INSIDE_GIT_REPOSITORY_FORBIDDEN")
    if dest.is_symlink() or dest.exists():
        raise ImportErrorSafe("OUTPUT_ALREADY_EXISTS")
    if not dest.parent.is_dir():
        raise ImportErrorSafe("OUTPUT_PARENT_MISSING")
    return dest

def make_private_capsule(archive, ids, output, *, consent=False):
    if not consent:
        raise ImportErrorSafe("EXPLICIT_CONSENT_REQUIRED")
    if not ids or len(ids) > 3 or len(set(ids)) != len(ids):
        raise ImportErrorSafe("SELECT_ONE_TO_THREE_UNIQUE_CONVERSATIONS")
    dest = _reject_git_path(output)
    records = load_export(archive)
    if any(i not in records for i in ids):
        raise ImportErrorSafe("SELECTED_CONVERSATION_NOT_FOUND")
    excerpts = []
    for cid in ids:
        history = visible_history(records[cid])[-MAX_PER_CONVERSATION:]
        for turn in history:
            excerpts.append({"source_title": "conversation-" + hashlib.sha256(cid.encode()).hexdigest()[:12],
                             "role": turn["role"], "text": turn["text"]})
    if not excerpts or len(excerpts) > MAX_EXCERPTS:
        raise ImportErrorSafe("NO_SUPPORTED_VISIBLE_TEXT")
    capsule = {
        "schema": SCHEMA,
        "assistant_name": "Non spécifié : continuité logicielle uniquement",
        "relationship_style": "Aucune affirmation d'identité ni de conscience transférée.",
        "memories": "",
        "excerpts": excerpts,
        "claims": {"consciousness_transfer": False, "robot_control": False,
                   "identity_equivalence": False},
        "processing": {"source": "chatgpt_export_local_private", "local_import": True,
                       "selected_conversations": len(ids), "explicit_consent": True,
                       "approved_for_public_demo": False, "robot_runtime_enabled": False,
                       "network_access": False},
    }
    raw = (json.dumps(capsule, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    if len(raw) > 150000:
        raise ImportErrorSafe("PRIVATE_CAPSULE_SIZE_LIMIT")
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    fd = os.open(str(dest), flags, 0o600)
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(raw)
    except BaseException:
        dest.unlink(missing_ok=True)
        raise
    return {"selected_conversations": len(ids), "excerpts": len(excerpts),
            "capsule_sha256": hashlib.sha256(raw).hexdigest(),
            "source": "chatgpt_export_local_private", "robot_runtime_enabled": False,
            "data_sent_to_network": False}

def main(argv=None):
    parser = argparse.ArgumentParser(description="ASTRA SOULBRIDGE Ω — pré-import local privé")
    sub = parser.add_subparsers(dest="action", required=True)
    sub.add_parser("inventory").add_argument("archive")
    preview = sub.add_parser("list-ids", help="Affiche des titres privés localement seulement")
    preview.add_argument("archive")
    prep = sub.add_parser("prepare", help="Extrait jusqu'à trois conversations sélectionnées")
    prep.add_argument("archive")
    prep.add_argument("--select", nargs="+", required=True)
    prep.add_argument("--output", required=True)
    prep.add_argument("--consent", action="store_true", required=True)
    args = parser.parse_args(argv)
    try:
        if args.action == "inventory":
            answer = inventory(args.archive)
        elif args.action == "list-ids":
            conv = load_export(args.archive)
            answer = [{"id": key, "title": val.get("title", "")}
                      for key, val in conv.items() if visible_history(val)]
        else:
            answer = make_private_capsule(args.archive, args.select, args.output,
                                          consent=args.consent)
        print(json.dumps(answer, ensure_ascii=False, indent=2))
        return 0
    except ImportErrorSafe as err:
        print("SOULBRIDGE_IMPORT_FAIL: " + str(err), file=sys.stderr)
        return 2

if __name__ == "__main__":
    sys.exit(main())
