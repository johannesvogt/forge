#!/bin/bash
set -e

if [ -z "$1" ]; then
  echo "Usage: $0 <iterations>"
  exit 1
fi

for ((i=1; i<=$1; i++)); do
  echo "Starting iteration $i"
  result=$(docker sandbox run claude -- --permission-mode bypassPermissions -p " \
  1. Find the highest-priority task in the forge issues.
  2. Use process-implementation-issue or process-general-issue skills to process. \
  ONLY WORK ON A SINGLE TASK. \
  If there are not issues to pick up, output <promise>NO_ISSUES</promise>. \
  IMPORTANT: Never end the session or declare work complete while a command is still running. \
  Always wait for npm install, builds, tests, and any other shell commands to fully finish \
  before reporting results or completing the session.")

  echo "$result"

  if [[ "$result" == *"<promise>NO_ISSUES</promise>"* ]]; then
    echo "No open issues after $i iterations."
    exit 0
  fi
done
