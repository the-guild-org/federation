---
'@theguild/federation-composition': patch
---

Unknown types are now always reported as GraphQLError (previously in some logic paths, it was an
exception).
