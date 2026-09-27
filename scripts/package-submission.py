#!/usr/bin/env python3
"""Export a minimal review ZIP. Secrets enter only with explicit --with-api."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parent.parent
TOP_LEVEL = {
    ".env.example", "package.json", "package-lock.json", "next.config.ts",
    "postcss.config.mjs", "tsconfig.json", "start.sh", "start.command", "start.bat",
}
RUNTIME_SCRIPTS = {"scripts/launch-review.mjs", "scripts/bootstrap-windows.ps1"}
PRISMA_FILES = {"prisma/schema.prisma", "prisma/review-seed.ts", "prisma/seed-data.ts"}


def included(path):
    if path in TOP_LEVEL | RUNTIME_SCRIPTS | PRISMA_FILES:
        return True
    if path.startswith("prisma/migrations/"):
        return path.endswith((".sql", ".toml"))
    if path.startswith("public/"):
        return not path.endswith((".gitkeep", ".md"))
    if path.startswith("src/"):
        if re.search(r"\.(test|spec)\.", path) or path.startswith("src/test/"):
            return False
        if path.startswith("src/agentic-v2/"):
            return path in {
                "src/agentic-v2/skills/evidence-parser/parser.ts",
                "src/agentic-v2/skills/evidence-parser/schema.ts",
                "src/agentic-v2/skills/growth-analyzer/analyzer.ts",
                "src/agentic-v2/skills/growth-analyzer/schema.ts",
            }
        return path.endswith((".ts", ".tsx", ".css", ".json", ".svg", ".ico", ".woff", ".woff2"))
    return False


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--with-api", action="store_true", help="Include authorized API configuration from local .env")
    parser.add_argument("--output", type=Path, default=ROOT / "submission")
    args = parser.parse_args()
    os.umask(0o077)
    paths = subprocess.check_output(
        ["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"], cwd=ROOT,
    ).decode().split("\0")
    commit = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    dirty = bool(subprocess.check_output(["git", "status", "--porcelain"], cwd=ROOT))
    files = {}
    for name in sorted(set(paths)):
        if not included(name):
            continue
        file = ROOT / name
        if file.is_symlink():
            raise SystemExit(f"Refusing symlink in submission: {name}")
        if file.is_file():
            files[name] = file.read_bytes()
    files["README.md"] = (ROOT / "scripts/submission/README.md").read_bytes()
    manifest = json.loads(files["package.json"])
    manifest["scripts"] = {
        "launch": "node scripts/launch-review.mjs",
        "dev": "next dev --webpack", "build": "next build --webpack", "start": "next start",
        "prisma:generate": "prisma generate", "db:migrate:deploy": "prisma migrate deploy",
    }
    manifest.pop("prisma", None)  # No destructive development seed in the review package.
    for name in ("@eslint/eslintrc", "@playwright/test", "eslint", "eslint-config-next", "vitest"):
        manifest["devDependencies"].pop(name, None)
    files["package.json"] = (json.dumps(manifest, indent=2, ensure_ascii=False) + "\n").encode()
    # Let npm prune the lock graph, preserving exact versions of the retained packages.
    # This temporary directory contains no credentials and runs no install scripts.
    with tempfile.TemporaryDirectory(prefix="careermate-lock-") as temp:
        staging = Path(temp)
        (staging / "package.json").write_bytes(files["package.json"])
        lock = json.loads(files["package-lock.json"])
        lock["packages"][""]["devDependencies"] = manifest["devDependencies"]
        (staging / "package-lock.json").write_text(json.dumps(lock))
        subprocess.run(
            ["npm.cmd" if os.name == "nt" else "npm", "install", "--package-lock-only",
             "--ignore-scripts", "--no-audit", "--no-fund", "--registry=https://registry.npmjs.org"],
            cwd=staging, check=True, stdout=subprocess.DEVNULL,
        )
        files["package-lock.json"] = (staging / "package-lock.json").read_bytes()
    if args.with_api:
        # Node's dotenv parser handles quotes/comments; only known application keys are copied.
        script = """import {readFileSync} from 'node:fs'; import {parseEnv} from 'node:util';
const allowed=parseEnv(readFileSync('.env.example','utf8'));
const current=parseEnv(readFileSync('.env','utf8'));
const result=Object.fromEntries(Object.keys(allowed).map(k=>[k,current[k]??allowed[k]]));
result.DATABASE_URL='file:./review.db'; result.NEXT_PUBLIC_APP_URL='http://localhost:3000';
if(result.TBOX_MODE!=='api'||!result.TBOX_API_KEY||result.TBOX_API_KEY==='placeholder'||!result.TBOX_AGENT_ID)process.exit(2);
process.stdout.write(Object.entries(result).map(([k,v])=>k+'='+JSON.stringify(v)).join('\\n')+'\\n');"""
        try:
            files[".env"] = subprocess.check_output(["node", "--input-type=module", "-e", script], cwd=ROOT, stderr=subprocess.DEVNULL)
        except subprocess.CalledProcessError:
            raise SystemExit("Valid API configuration was not found in .env; no archive created.") from None
    else:
        files["README.md"] = files["README.md"].replace(
            "本次交付包的 `.env` 已附带作者授权提供的 API 配置，评委无需填写密钥。".encode(),
            "本包不含 API 密钥；首次启动使用 mock 模式，真实 AI 需自行配置 `.env`。".encode(),
        )
    release = {
        "project": "CareerMate", "sourceCommit": commit, "uncommittedChanges": dirty,
        "includesApiConfiguration": args.with_api, "database": "fresh-on-first-launch",
        "sha256": {name: hashlib.sha256(data).hexdigest() for name, data in sorted(files.items())},
    }
    files["release-manifest.json"] = (json.dumps(release, indent=2, ensure_ascii=False) + "\n").encode()
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    label = "CareerMate-review" if args.with_api else "CareerMate-source"
    target = output / f"{label}-{commit[:8]}{'-preview' if dirty else ''}.zip"
    # Atomic output: an interrupted export never leaves a partial final ZIP.
    with tempfile.NamedTemporaryFile(dir=output, suffix=".zip", delete=False) as tmp:
        temp_path = Path(tmp.name)
    try:
        with zipfile.ZipFile(temp_path, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
            for name, data in sorted(files.items()):
                info = zipfile.ZipInfo(f"CareerMate/{name}")
                info.create_system = 3
                mode = 0o755 if name.endswith((".sh", ".command")) else 0o600 if name == ".env" else 0o644
                info.external_attr = (0o100000 | mode) << 16
                archive.writestr(info, data, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
        temp_path.replace(target)
    finally:
        temp_path.unlink(missing_ok=True)
    digest = hashlib.sha256(target.read_bytes()).hexdigest()
    target.with_suffix(".zip.sha256").write_text(f"{digest}  {target.name}\n")
    print(json.dumps({"archive": str(target), "files": len(files), "bytes": target.stat().st_size,
                      "apiIncluded": args.with_api, "sourceCommit": commit, "dirty": dirty}, ensure_ascii=False))


if __name__ == "__main__":
    main()
