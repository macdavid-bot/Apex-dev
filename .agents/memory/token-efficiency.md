---
name: Token Efficiency Actions
description: New orchestrator actions and rules added to reduce token usage on repo tasks
---

## New Actions
- `grep_file` — grep within a specific file, returns matching lines + N context lines. Works on GitHub (in-memory) and local (shell grep). Never reads whole file.
- `read_file_lines` — read a specific line range (start_line, end_line). Cap: end_line - start_line ≤ 500. Works GitHub + local (sed).
- `file_outline` — extract function/class/export names from any file using regex patterns. Returns symbols with line numbers. Works GitHub + local. No full content returned.

## read_file Auto-Truncation
GitHub `read_file` responses are capped at 400 lines. Files over this threshold return the first 400 lines with a notice: `…[TRUNCATED — file has N lines, showing first 400. Use read_file_lines or grep_file for specific sections]`

## System Prompt Rules
Added a **Token Efficiency — Critical Rules** section with 10 rules:
1. Search → Outline → Grep → Read → Edit order enforced
2. file_outline mandatory before read_file on files > 100 lines
3. grep_file preferred over read_file for lookup tasks
4. read_file_lines for targeted edits when line range is known
5. No "context" reads — only read files you will edit
6. No duplicate reads in one task
7. Minimal old_str (3-5 lines of context)
8. Skip package.json / lock files unless asked
9. Stop when task is done

**Why:** Without these rules the AI would read 10+ files for a simple 2-line change, burning tokens and hitting context limits.
