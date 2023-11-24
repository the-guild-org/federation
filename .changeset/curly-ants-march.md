---
'@theguild/federation-composition': minor
---

Remove `stripFederationFromSupergraph` in favor of `transformSupergraphToPublicSchema`.

Instead of stripping only federation specific types, `transformSupergraphToPublicSchema` yields the
public api schema as served by the gateway.
