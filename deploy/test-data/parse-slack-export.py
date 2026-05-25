#!/usr/bin/env python3
"""
Parse a Slack channel copy-paste export into the STM import JSON format.

Usage:
    python3 parse-slack-export.py <input.txt> [--output import-payload.json] [--team-id T_IMPORT]

The parser detects messages in the format:
    Name  [HH:MM AM/PM]
    message text...

Messages with [topic] tags at the start are grouped into the same thread.
Standalone messages become single-message threads.
"""

import argparse
import json
import re
import sys
import hashlib
from collections import defaultdict

# Matches "Name  [10:50 AM]" or "Name  [2:19 PM]" etc.
MSG_HEADER_RE = re.compile(
    r'^([A-Z][A-Za-z\s\-\.]+?)\s{2,}\[(\d{1,2}:\d{2}\s*[AP]M)\]\s*$'
)

# Matches [topic tag] at start of message body
TOPIC_RE = re.compile(r'^\[([^\]]{3,80})\]')

# Skip these "system" messages
SKIP_PATTERNS = [
    'was added to',
    'joined via invite',
    'made updates to',
    'Canvas updated',
]


def parse_messages(lines):
    """Parse raw lines into a list of {user, time, text} dicts."""
    messages = []
    current_user = None
    current_time = None
    current_lines = []

    def flush():
        if current_user and current_lines:
            text = '\n'.join(current_lines).strip()
            if text and not any(p in text for p in SKIP_PATTERNS):
                messages.append({
                    'user': current_user,
                    'time': current_time,
                    'text': text,
                })

    for line in lines:
        line = line.rstrip('\n')
        m = MSG_HEADER_RE.match(line)
        if m:
            flush()
            current_user = m.group(1).strip()
            current_time = m.group(2).strip()
            current_lines = []
        else:
            if current_user is not None:
                current_lines.append(line)

    flush()
    return messages


def user_id(name):
    """Generate a stable short user ID from a display name."""
    h = hashlib.md5(name.encode()).hexdigest()[:8].upper()
    slug = re.sub(r'[^A-Za-z]', '', name.split()[0]).upper()[:6]
    return f'U_{slug}_{h}'


def group_into_threads(messages):
    """Group messages into threads by [topic] tag. Standalone messages become solo threads."""
    threads = defaultdict(list)
    standalone = []

    for msg in messages:
        topic_match = TOPIC_RE.match(msg['text'])
        if topic_match:
            topic = topic_match.group(1).strip().lower()
            threads[topic].append(msg)
        else:
            standalone.append(msg)

    result = []
    for topic, msgs in threads.items():
        result.append(msgs)
    for msg in standalone:
        result.append([msg])

    return result


def build_import_payload(threads, team_id):
    """Convert grouped threads into the STM import JSON payload."""
    slack_messages = []
    base_ts = 7777700000

    for thread_idx, thread_msgs in enumerate(threads):
        thread_base = base_ts + (thread_idx * 100)
        parent_ts = f'{thread_base}.000000'

        for msg_idx, msg in enumerate(thread_msgs):
            ts = f'{thread_base + msg_idx}.000000'
            entry = {
                'type': 'message',
                'user': user_id(msg['user']),
                'text': msg['text'],
                'ts': ts,
            }
            if msg_idx > 0:
                entry['thread_ts'] = parent_ts

            slack_messages.append(entry)

    return {
        'slackTeamId': team_id,
        'messages': slack_messages,
    }


def main():
    parser = argparse.ArgumentParser(description='Parse Slack export to STM import JSON')
    parser.add_argument('input', help='Path to raw Slack text export')
    parser.add_argument('--output', '-o', default=None, help='Output JSON file (default: stdout)')
    parser.add_argument('--team-id', default='T_EOS_IMPORT', help='Slack team ID for the import')
    args = parser.parse_args()

    with open(args.input, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    messages = parse_messages(lines)
    print(f'Parsed {len(messages)} messages', file=sys.stderr)

    threads = group_into_threads(messages)
    print(f'Grouped into {len(threads)} threads ({sum(1 for t in threads if len(t) > 1)} multi-message)', file=sys.stderr)

    payload = build_import_payload(threads, args.team_id)
    print(f'Total Slack messages in payload: {len(payload["messages"])}', file=sys.stderr)

    output = json.dumps(payload, indent=2, ensure_ascii=False)

    if args.output:
        with open(args.output, 'w', encoding='utf-8') as f:
            f.write(output)
        print(f'Written to {args.output}', file=sys.stderr)
    else:
        print(output)


if __name__ == '__main__':
    main()
