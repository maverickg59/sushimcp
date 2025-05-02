**Config with custom sources combined using `--urls`:**

```json
{
  "sushimcp": {
    "command": "npx",
    "args": [
      "@chriswhiterocks/sushimcp@latest",
      "--urls",
      "hono:https://hono.dev/llms-full.txt drizzle:https://orm.drizzle.team/llms.txt"
    ]
  }
}
```

**Config with custom sources one by one**

```json
{
  "sushimcp": {
    "command": "npx",
    "args": [
      "@chriswhiterocks/sushimcp@latest",
      "--url",
      "hono:https://hono.dev/llms-full.txt",
      "--url",
      "drizzle:https://orm.drizzle.team/llms.txt"
    ]
  }
}
```
