# @theguild/federation-composition

## 0.6.1

### Patch Changes

- [`55343ba`](https://github.com/the-guild-org/federation/commit/55343baf4a71984bc938c0f89d49a86bb8407a26)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Fix missing join\_\_field

- [`55343ba`](https://github.com/the-guild-org/federation/commit/55343baf4a71984bc938c0f89d49a86bb8407a26)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Fix default values

- [`55343ba`](https://github.com/the-guild-org/federation/commit/55343baf4a71984bc938c0f89d49a86bb8407a26)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - fix: cannot move subgraphs without @key
  and common query path

- [`55343ba`](https://github.com/the-guild-org/federation/commit/55343baf4a71984bc938c0f89d49a86bb8407a26)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Ignore specified directives and scalars
  when printing supergraph

## 0.6.0

### Minor Changes

- [`9195942`](https://github.com/the-guild-org/federation/commit/9195942c97646d5bcd326632358713a8676115b3)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Detect composed directives without spec

### Patch Changes

- [`3196317`](https://github.com/the-guild-org/federation/commit/3196317a479d289d52f051255c5d24db1c673936)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Fix field sharing logic for Federation
  v1

- [`af15843`](https://github.com/the-guild-org/federation/commit/af15843269c919ead82cec7d8c37d61c9bcde9ec)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Fix OVERRIDE_SOURCE_HAS_OVERRIDE rule
  to find circular refs

- [`c182a8a`](https://github.com/the-guild-org/federation/commit/c182a8a581fcc1cff2e08253b70f39592ed796b7)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Fix discoverability of directive
  definitions

- [`c182a8a`](https://github.com/the-guild-org/federation/commit/c182a8a581fcc1cff2e08253b70f39592ed796b7)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Fix descriptions on arguments of object
  type fields

- [`cab3b49`](https://github.com/the-guild-org/federation/commit/cab3b49195a8a2e920c4d1d08ddb4bd030e8b3b8)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Fix adding unnecessary
  `@join__type(extension:true)`

- [`af15843`](https://github.com/the-guild-org/federation/commit/af15843269c919ead82cec7d8c37d61c9bcde9ec)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Prevent shareable fields on root level
  subscription object

## 0.5.0

### Minor Changes

- [#28](https://github.com/the-guild-org/federation/pull/28)
  [`21fa482`](https://github.com/the-guild-org/federation/commit/21fa482171d286f94cecd57b10461a30d0044b64)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Support v2.4, v2.5 and v2.6

## 0.4.0

### Minor Changes

- [#25](https://github.com/the-guild-org/federation/pull/25)
  [`c17a037`](https://github.com/the-guild-org/federation/commit/c17a037f8ed1ce151bac275a3a31f3d4cd2d0728)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - PROVIDES_INVALID_FIELDS: empty
  selection set

### Patch Changes

- [#26](https://github.com/the-guild-org/federation/pull/26)
  [`3c45c20`](https://github.com/the-guild-org/federation/commit/3c45c20e7356d5a133dd8c0fa0dcc549538f7718)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - INVALID_FIELD_SHARING: adjust the check
  to detect valid override directive

## 0.3.0

### Minor Changes

- [#23](https://github.com/the-guild-org/federation/pull/23)
  [`2d72e03`](https://github.com/the-guild-org/federation/commit/2d72e039929022d3eefedacdc6e5a7a1d85f7650)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Add sortSDL function to sort
  DocumentNode (type system definitions and extensions)

## 0.2.0

### Minor Changes

- [#21](https://github.com/the-guild-org/federation/pull/21)
  [`443283e`](https://github.com/the-guild-org/federation/commit/443283e22e89934a268b7a6318c02ffc3bfbf464)
  Thanks [@n1ru4l](https://github.com/n1ru4l)! - Remove `stripFederationFromSupergraph` in favor of
  `transformSupergraphToPublicSchema`.

  Instead of stripping only federation specific types, `transformSupergraphToPublicSchema` yields
  the public api schema as served by the gateway.

## 0.1.4

### Patch Changes

- [#19](https://github.com/the-guild-org/federation/pull/19)
  [`e0ef0bb`](https://github.com/the-guild-org/federation/commit/e0ef0bb1201225aa2f1e5b400803c07eeed6b29a)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Make `stripFederationFromSupergraph`
  less strict and remove only Federation directives

## 0.1.3

### Patch Changes

- [#17](https://github.com/the-guild-org/federation/pull/17)
  [`a508ad2`](https://github.com/the-guild-org/federation/commit/a508ad247773e0bacca1773cafd2b7a39d93b4e7)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - SATISFIABILITY_ERROR - allow to resolve
  a field via entity type's child

## 0.1.2

### Patch Changes

- [#15](https://github.com/the-guild-org/federation/pull/15)
  [`37e164c`](https://github.com/the-guild-org/federation/commit/37e164c66c0c3219791e4c074a602774accd08b2)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Add join**FieldSet, link**Import,
  link\_\_Purpose to stripFederationFromSupergraph

## 0.1.1

### Patch Changes

- [#12](https://github.com/the-guild-org/federation/pull/12)
  [`75d2117`](https://github.com/the-guild-org/federation/commit/75d2117dd6e5864888ed6c336aec1a334902c845)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Add repository to package.json

## 0.1.0

### Minor Changes

- [`8574d45`](https://github.com/the-guild-org/federation/commit/8574d455c9a5cc03190d12191c1b0a7ae29f85be)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Release v0.1.0

## 0.0.0

### Minor Changes

- [#9](https://github.com/the-guild-org/federation/pull/9)
  [`b37a82d`](https://github.com/the-guild-org/federation/commit/b37a82de85347866bf027f825c17be9f122d6ff9)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Initial version

### Patch Changes

- [`1196bde`](https://github.com/the-guild-org/federation/commit/1196bde67a6db8fe4eb32d2c1ad9dcd2a0793912)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Report error when interfaceObject
  directive is detected

- [`1196bde`](https://github.com/the-guild-org/federation/commit/1196bde67a6db8fe4eb32d2c1ad9dcd2a0793912)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Fix a case when all fields are marked
  as external and are only used by key directive

- [`1196bde`](https://github.com/the-guild-org/federation/commit/1196bde67a6db8fe4eb32d2c1ad9dcd2a0793912)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Init

- [`1196bde`](https://github.com/the-guild-org/federation/commit/1196bde67a6db8fe4eb32d2c1ad9dcd2a0793912)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Add validateSubgraph function
