#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"

# Download a private Node runtime only when a supported Node + npm is unavailable.
# No sudo, system installation, or global PATH changes.
if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1 || ! node -e 'process.exit([22,24].includes(+process.versions.node.split(".")[0]) ? 0 : 1)' 2>/dev/null; then
  version="v22.23.3"
  case "$(uname -s)" in Darwin) os=darwin ;; Linux) os=linux ;; *) echo 'Unsupported OS. Install Node.js 22 or 24, then run: node scripts/launch-review.mjs'; exit 1 ;; esac
  case "$(uname -m)" in x86_64|amd64) arch=x64 ;; arm64|aarch64) arch=arm64 ;; *) echo 'Only x64 and ARM64 are supported by this launcher.'; exit 1 ;; esac
  name="node-${version}-${os}-${arch}"
  runtime="$PWD/.runtime"
  if [[ ! -x "$runtime/$name/bin/node" ]]; then
    mkdir -p "$runtime"
    download() {
      if command -v curl >/dev/null 2>&1; then curl --fail --location --retry 3 --connect-timeout 20 "$1" --output "$2";
      elif command -v wget >/dev/null 2>&1; then wget -O "$2" "$1";
      else echo 'Install curl or wget and try again.'; exit 1; fi
    }
    echo "Downloading Node.js ${version} from nodejs.org..."
    download "https://nodejs.org/dist/$version/$name.tar.gz" "$runtime/$name.tar.gz"
    download "https://nodejs.org/dist/$version/SHASUMS256.txt" "$runtime/SHASUMS256.txt"
    expected="$(awk -v file="$name.tar.gz" '$2 == file {print $1}' "$runtime/SHASUMS256.txt")"
    if command -v sha256sum >/dev/null 2>&1; then actual="$(sha256sum "$runtime/$name.tar.gz" | awk '{print $1}')";
    else actual="$(shasum -a 256 "$runtime/$name.tar.gz" | awk '{print $1}')"; fi
    [[ -n "$expected" && "$actual" == "$expected" ]] || { echo 'Node.js checksum mismatch; download rejected.'; exit 1; }
    tar -xzf "$runtime/$name.tar.gz" -C "$runtime"
    rm "$runtime/$name.tar.gz"
  fi
  export PATH="$runtime/$name/bin:$PATH"
fi
exec node scripts/launch-review.mjs "$@"
