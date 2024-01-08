---
'@theguild/federation-composition': patch
---

Ignore inaccessible field arguments within the `DEFAULT_VALUE_USES_INACCESSIBLE` rule.

Fixes an issue where an inaccessible field argument uses a default value that is inaccessible would
cause a false error.

```graphql
type User @key(fields: "id") {
  id: ID
  friends(type: FriendType = FAMILY @inaccessible): [User!]!
}

enum FriendType {
  FAMILY @inaccessible
  FRIEND
}
```
