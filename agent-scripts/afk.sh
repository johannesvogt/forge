#!/bin/bash
set -e

usage() {
  echo "Usage: $0 <claude|codex> [--todo-only | --review-only] [--model <model>] <iterations>"
}

if [ "$#" -eq 0 ]; then
  usage >&2
  exit 1
fi

agent=$1
shift

case "$agent" in
  claude|codex) ;;
  *)
    echo "Agent must be either 'claude' or 'codex'." >&2
    usage >&2
    exit 1
    ;;
esac

mode="all"
model=""
iterations=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    --todo-only)
      [ "$mode" = "all" ] || { echo "Only one of --todo-only and --review-only may be specified." >&2; usage >&2; exit 1; }
      mode="todo"
      ;;
    --review-only)
      [ "$mode" = "all" ] || { echo "Only one of --todo-only and --review-only may be specified." >&2; usage >&2; exit 1; }
      mode="review"
      ;;
    --model)
      if [ "$#" -lt 2 ] || [ -z "$2" ]; then
        echo "--model requires a model name." >&2
        usage >&2
        exit 1
      fi
      model=$2
      shift
      ;;
    -* )
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
    *)
      [ -z "$iterations" ] || { echo "Unexpected argument: $1" >&2; usage >&2; exit 1; }
      iterations=$1
      ;;
  esac
  shift
done

if ! [[ "$iterations" =~ ^[1-9][0-9]*$ ]]; then
  echo "iterations must be a positive integer." >&2
  usage >&2
  exit 1
fi

case "$mode" in
  todo)
    routing_rules="
  1. If any issue is in TODO column with description starting with 'implementation-issue' or 'refactoring-issue': pick the highest-priority one and invoke the process-implementation-issue skill.
  2. Else if any issue is in TODO column: pick the highest-priority one and invoke the process-general-issue skill.
  3. Else: output <promise>NO_ISSUES</promise> and stop."
    ;;
  review)
    routing_rules="
  1. If any issue is in NEEDS_AGENT_REVIEW column with description starting with 'implementation-issue' or 'refactoring-issue': pick the highest-priority one and invoke the review-implementation-issue skill.
  2. Else if any issue is in NEEDS_AGENT_REVIEW column: pick the highest-priority one and invoke the review-general-issue skill.
  3. Else: output <promise>NO_ISSUES</promise> and stop."
    ;;
  all)
    routing_rules="
  1. If any issue is in NEEDS_AGENT_REVIEW column with description starting with 'implementation-issue' or 'refactoring-issue': pick the highest-priority one and invoke the review-implementation-issue skill.
  2. Else if any issue is in NEEDS_AGENT_REVIEW column: pick the highest-priority one and invoke the review-general-issue skill.
  3. Else if any issue is in TODO column with description starting with 'implementation-issue' or 'refactoring-issue': pick the highest-priority one and invoke the process-implementation-issue skill.
  4. Else if any issue is in TODO column: pick the highest-priority one and invoke the process-general-issue skill.
  5. Else: output <promise>NO_ISSUES</promise> and stop."
    ;;
esac

prompt="Call list_skills to load available skills, then find and work exactly ONE issue using the routing rules below.

ROUTING RULES (apply in order):${routing_rules}

RULES:
- Work exactly ONE issue per run. Do not move to a second issue.
- Do not start work on an issue that is already assigned to another agent (agentAssignee is set and less than 4 hours old).
- LONG-RUNNING COMMANDS: npm install, npm ci, npm run build, and similar package/build commands can take 5-10 minutes on a cold cache. This is normal. When running these commands, always set the command timeout to at least 600000ms (10 minutes). Never kill, interrupt, or abandon a command just because it is slow. Do not exit the session until the command returns with output.
- Never end the session or declare work complete while a command is still running.
- Always wait for npm install, builds, tests, and any other shell commands to fully finish before reporting results or completing the session."

for ((i=1; i<=iterations; i++)); do
  echo "Starting $agent iteration $i"

  if [ "$agent" = "claude" ]; then
    agent_args=(--permission-mode bypassPermissions)
    [ -z "$model" ] || agent_args+=(--model "$model")
    result=$(sbx run claude -- "${agent_args[@]}" -p "$prompt")
  else
    agent_args=(exec)
    [ -z "$model" ] || agent_args+=(--model "$model")
    result=$(sbx run codex -- ${agent_args[@]} "$prompt")
  fi

  echo "$result"

  if [[ "$result" == *"<promise>NO_ISSUES</promise>" ]]; then
    echo "No open issues after $i iterations."
    exit 0
  fi
done
