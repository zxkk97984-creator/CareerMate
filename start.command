#!/bin/bash
cd -- "$(dirname -- "$0")"
bash ./start.sh "$@"
result=$?
if [ "$result" -ne 0 ]; then read -r -p 'Startup failed. Press Enter to close...' _; fi
exit "$result"
