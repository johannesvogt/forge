#!/bin/bash
set -e

if [ -z "$1" ]; then
  echo "Usage: $0 <iterations>"
  exit 1
fi

for ((i=1; i<=$1; i++)); do
  echo "Starting iteration $i"
  result=$(docker sandbox run claude -- --permission-mode bypassPermissions -p " \
  Call list_skills to load available skills, then find and work exactly ONE issue using the routing rules below. \
  \
  ROUTING RULES (apply in order): \
  1. If any issue is in NEEDS_AGENT_REVIEW column with description starting with 'implementation-issue' or 'refactoring-issue': pick the highest-priority one and invoke the review-implementation-issue skill. \
  2. Else if any issue is in NEEDS_AGENT_REVIEW column: pick the highest-priority one and invoke the review-general-issue skill. \
  3. Else if any issue is in TODO column with description starting with 'implementation-issue': pick the highest-priority one and invoke the process-implementation-issue skill. \
  4. Else if any issue is in TODO column with description starting with 'refactoring-issue': pick the highest-priority one and invoke the process-implementation-issue skill. \
  5. Else if any issue is in TODO column: pick the highest-priority one and invoke the process-general-issue skill. \
  6. Else: output <promise>NO_ISSUES</promise> and stop. \
  \
  RULES: \
  - Work exactly ONE issue per run. Do not move to a second issue. \
  - Do not start work on an issue that is already assigned to another agent (agentAssignee is set and less than 4 hours old). \
  - LONG-RUNNING COMMANDS: npm install, npm ci, npm run build, and similar package/build commands can take 5-10 minutes on a cold cache. This is normal. When running these commands, always set the bash tool timeout to at least 600000ms (10 minutes). Never kill, interrupt, or abandon a command just because it is slow. Do not exit the session until the command tool call returns with output. \
  - Never end the session or declare work complete while a command is still running. \
  - Always wait for npm install, builds, tests, and any other shell commands to fully finish before reporting results or completing the session.")

  echo "$result"

  if [[ "$result" == *"<promise>NO_ISSUES</promise>"* ]]; then
    echo "No open issues after $i iterations."
    exit 0
  fi
done
