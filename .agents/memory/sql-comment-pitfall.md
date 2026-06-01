---
name: SQL Comment Pitfall in JS Template Literals
description: Using SQL -- comment syntax between JS const declarations causes SyntaxError
---

## The Bug
In a JS file with adjacent template literals, placing a SQL `--` comment in the JS code between them causes `SyntaxError: Unexpected identifier`:

```js
const DDL = `...SQL...`;

-- This is a SQL comment but JS sees it as: minus-minus identifier
const ALTER_DDL = `...SQL...`;
```

## The Fix
Use JS `//` comments between template literals:

```js
const DDL = `...SQL...`;

// SQL comments that belong inside the template can use -- inside the backticks
const ALTER_DDL = `
-- This is fine inside the template literal
DO $$ BEGIN ... END $$;
`;
```

**Why:** JS parser sees `--` in source code as decrement operator followed by identifier, not a comment. Only `//` and `/* */` are JS comments.
