#!/usr/bin/env python3
"""Extract the project files in MSME_PROJECT_PACK.md without overwriting changes.

Uses Python's standard library. It performs no network requests and writes only
under the destination chosen on the command line.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import sys

BLOCK = re.compile(
    r"^<!-- PROJECT_FILE (.+?) -->\n"
    r"`````(?:markdown|yaml|text)\n"
    r"(.*?)"
    r"^`````\n<!-- END_PROJECT_FILE -->",
    re.MULTILINE | re.DOTALL,
)

def read_bundle(path: Path) -> list[tuple[PurePosixPath, bytes]]:
    text = path.read_text(encoding="utf-8")
    declared = re.search(r"^<!-- PROJECT_FILE_COUNT (\d+) -->$", text, re.MULTILINE)
    if declared is None:
        raise ValueError("The bundle is missing its file-count marker.")
    matches = list(BLOCK.finditer(text))
    if not 1 <= len(matches) <= 256:
        raise ValueError("Unexpected number of project files.")
    if len(matches) != int(declared.group(1)):
        raise ValueError("The bundle is incomplete or has malformed file blocks.")
    files = []
    seen = set()
    for match in matches:
        metadata = json.loads(match.group(1))
        if set(metadata) != {"path", "sha256", "bytes"}:
            raise ValueError("Unexpected file metadata.")
        raw = metadata["path"]
        if not isinstance(raw, str) or "\\" in raw or ":" in raw:
            raise ValueError("Invalid project path.")
        relative = PurePosixPath(raw)
        if relative.is_absolute() or any(part in {"", ".", ".."} for part in relative.parts):
            raise ValueError("Project paths must stay inside the destination.")
        if relative.as_posix() != raw:
            raise ValueError("Project paths must use normalized relative paths.")
        allowed = raw in {"AGENTS.md", "PROJECT_GUIDE.md"} or raw.startswith(".agents/skills/")
        if not allowed or relative.suffix not in {".md", ".yaml"}:
            raise ValueError("The bundle contains an unexpected destination.")
        if raw.casefold() in seen:
            raise ValueError("Duplicate project path.")
        seen.add(raw.casefold())
        data = match.group(2).encode("utf-8")
        if len(data) != metadata["bytes"]:
            raise ValueError("File length does not match the bundle metadata: " + raw)
        if hashlib.sha256(data).hexdigest() != metadata["sha256"]:
            raise ValueError("File checksum does not match the bundle metadata: " + raw)
        files.append((relative, data))
    return files

def destination_for(root: Path, relative: PurePosixPath) -> Path:
    candidate = root.joinpath(*relative.parts)
    current = root
    for part in relative.parts:
        current = current / part
        if current.is_symlink():
            raise ValueError("Refusing to traverse a symlink: " + str(current))
    if not candidate.resolve().is_relative_to(root):
        raise ValueError("A project file escapes the destination.")
    return candidate

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("bundle", type=Path)
    parser.add_argument("--destination", required=True, type=Path)
    parser.add_argument("--check", action="store_true", help="Verify files and print the plan without writing")
    args = parser.parse_args()
    files = read_bundle(args.bundle)
    root = args.destination.expanduser().resolve()
    if root.exists() and not root.is_dir():
        raise ValueError("The destination is not a directory.")
    planned = []
    unchanged = 0
    conflicts = []
    for relative, data in files:
        destination = destination_for(root, relative)
        if destination.exists():
            if not destination.is_file() or destination.read_bytes() != data:
                conflicts.append(str(destination))
            else:
                unchanged += 1
        else:
            for parent in destination.parents:
                if parent == root:
                    break
                if parent.exists() and not parent.is_dir():
                    conflicts.append(str(parent))
                    break
            planned.append((destination, data))
    if conflicts:
        print("No files were written. Existing files differ or block the destination:", file=sys.stderr)
        for path in sorted(set(conflicts)):
            print("  " + path, file=sys.stderr)
        print("Extract to a fresh folder, then merge your existing project instructions deliberately.", file=sys.stderr)
        return 2
    if args.check:
        print(f"Verified {len(files)} files; {len(planned)} would be created; {unchanged} already match.")
        return 0
    for destination, data in planned:
        destination.parent.mkdir(parents=True, exist_ok=True)
        with destination.open("xb") as output:
            output.write(data)
    print(f"Created {len(planned)} files; {unchanged} already matched.")
    print("Project folder: " + str(root))
    print("Read PROJECT_GUIDE.md and merge AGENTS.md with any existing repository instructions.")
    print("No global agent configuration or application code was changed.")
    return 0

if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, KeyError, TypeError) as error:
        print("Cannot extract project pack: " + str(error), file=sys.stderr)
        raise SystemExit(1)

