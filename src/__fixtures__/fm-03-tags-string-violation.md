---
tags: single-tag-as-string
status: archived
updated: "2024-01-01"
source: design
---
# Tags as plain string (Doc shape contract violation)
tags is a plain string instead of string[]. Parser must not crash.
Contract: if tags is not an array, it violates DocFrontmatter shape.
