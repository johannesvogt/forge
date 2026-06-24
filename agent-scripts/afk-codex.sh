#!/bin/bash
set -e

if [ -z "$1" ]; then
  echo "Usage: $0 <iterations>"
  exit 1
fi

for ((i=1; i<=$1; i++)); do
  echo "Starting iteration $i"
  result=$(sbx run codex -- --approval-mode full-auto -p " \
  Call list_skills to load available skills, then find and work exactly ONE issue using the routing rules below. \
  \
  ROUTING RULES (apply in order): \
  1. If any issue is in NEEDS_AGENT_REVIEW column with description starting with 'implementation-issue' or 'refactoring-issue': pick the highest-priority one and invoke the review-implementation-issue skill. \
  2. Else if any issue is in NEEDS_AGENT_REVIEW column: pick the highest-priority one and invoke the review-general-issue skill. \
  3. Else if any issue is in TODO column with description starting with 'implementation-issue': pick the highest-priority one and invoke the process-implementation-issue skill. \
  4. Else if any issue is in TODO column: pick the highest-priority one and invoke the process-general-issue skill. \
  5. Else: output <promise>NO_ISSUES</promise> and stop. \
  \
  RULES: \
  - Work exactly ONE issue per run. Do not move to a second issue. \
  - Do not start work on an issue that is already assigned to another agent (agentAssignee is set and less than 4 hours old). \
  - Never end the session or declare work complete while a command is still running. \
  - Always wait for npm install, builds, tests, and any other shell commands to fully finish before reporting results or completing the session.")

  echo "$result"

  if [[ "$result" == *"<promise>NO_ISSUES</promise>"* ]]; then
    echo "No open issues after $i iterations."
    exit 0
  fi
done
