# @theguild/federation-composition

## 0.10.0

### Minor Changes

- [#51](https://github.com/the-guild-org/federation/pull/51)
  [`8cd5287`](https://github.com/the-guild-org/federation/commit/8cd52870faa34ca174bc31a79c41d11b66197464)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Proper implementation of
  SATISFIABILITY_ERROR

### Patch Changes

- [#51](https://github.com/the-guild-org/federation/pull/51)
  [`8cd5287`](https://github.com/the-guild-org/federation/commit/8cd52870faa34ca174bc31a79c41d11b66197464)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Fix REQUIRES_FIELDS_MISSING_EXTERNAL in
  Fed v1

- [#51](https://github.com/the-guild-org/federation/pull/51)
  [`8cd5287`](https://github.com/the-guild-org/federation/commit/8cd52870faa34ca174bc31a79c41d11b66197464)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Fix FIELD_TYPE_MISMATCH for unions and
  union members

- [#51](https://github.com/the-guild-org/federation/pull/51)
  [`8cd5287`](https://github.com/the-guild-org/federation/commit/8cd52870faa34ca174bc31a79c41d11b66197464)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Fix PROVIDES_FIELDS_MISSING_EXTERNAL in
  Fed v1

- [#51](https://github.com/the-guild-org/federation/pull/51)
  [`8cd5287`](https://github.com/the-guild-org/federation/commit/8cd52870faa34ca174bc31a79c41d11b66197464)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Fix REQUIRES_INVALID_FIELDS_TYPE for
  enum value

## 0.9.0

### Minor Changes

- [#49](https://github.com/the-guild-org/federation/pull/49)
  [`d6da339`](https://github.com/the-guild-org/federation/commit/d6da339adf8e1e8b71a06a60e0defb3b12ff0df8)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Adds CompositionSuccess.publicSdl - SDL
  with only the queryable fields

## 0.8.2

### Patch Changes

- [#46](https://github.com/the-guild-org/federation/pull/46)
  [`cfa9950`](https://github.com/the-guild-org/federation/commit/cfa9950c513747b26e4fd67412a9e0d5b931c6c0)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Add `requiresScopes__Scope` and
  `policy__Policy` to `transformSupergraphToPublicSchema`

- [#44](https://github.com/the-guild-org/federation/pull/44)
  [`de983b0`](https://github.com/the-guild-org/federation/commit/de983b02479bdb4aee80bd42f6faece62586a45f)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Add containsSupergraphSpec to detect if
  Supergraph related scalars, enums or directives are used

## 0.8.1

### Patch Changes

- [#42](https://github.com/the-guild-org/federation/pull/42)
  [`f858c3f`](https://github.com/the-guild-org/federation/commit/f858c3fd1fac62915cf2d354f5bf001a369104b9)
  Thanks [@n1ru4l](https://github.com/n1ru4l)! - Fix REQUIRED_INACCESSIBLE occurring on inaccessible
  fields/input types

## 0.8.0

### Minor Changes

- [#40](https://github.com/the-guild-org/federation/pull/40)
  [`4cba351`](https://github.com/the-guild-org/federation/commit/4cba35100e751fee5a9e531931b85d586f35a01c)
  Thanks [@n1ru4l](https://github.com/n1ru4l)! - Implement validation rules for
  `REQUIRED_INACCESSIBLE` for input types and field arguments.

## 0.7.1

### Patch Changes

- [#36](https://github.com/the-guild-org/federation/pull/36)
  [`fdba937`](https://github.com/the-guild-org/federation/commit/fdba937f5a3fd6317d08a496129d4242f2c38df4)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Visit every field in provides and
  requires directives

- [#36](https://github.com/the-guild-org/federation/pull/36)
  [`fdba937`](https://github.com/the-guild-org/federation/commit/fdba937f5a3fd6317d08a496129d4242f2c38df4)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Fix unnecessary
  join\_\_field(override:) on Query fields when it points to non-existing subgraph

- [#36](https://github.com/the-guild-org/federation/pull/36)
  [`fdba937`](https://github.com/the-guild-org/federation/commit/fdba937f5a3fd6317d08a496129d4242f2c38df4)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Deduplicate composed directives

- [#39](https://github.com/the-guild-org/federation/pull/39)
  [`e77eb2c`](https://github.com/the-guild-org/federation/commit/e77eb2c4e7d4ab09aeb08946d9c241e4d5b7757b)
  Thanks [@n1ru4l](https://github.com/n1ru4l)! - Ignore inaccessible field arguments within the
  `DEFAULT_VALUE_USES_INACCESSIBLE` rule.

  Fixes an issue where an inaccessible field argument uses a default value that is inaccessible
  would cause a false error.

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

- [#36](https://github.com/the-guild-org/federation/pull/36)
  [`fdba937`](https://github.com/the-guild-org/federation/commit/fdba937f5a3fd6317d08a496129d4242f2c38df4)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Remove duplicated link spec definitions

- [#36](https://github.com/the-guild-org/federation/pull/36)
  [`fdba937`](https://github.com/the-guild-org/federation/commit/fdba937f5a3fd6317d08a496129d4242f2c38df4)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Drop unused fields marked with
  @external only in a single type in Fed v1

- [`220dfc0`](https://github.com/the-guild-org/federation/commit/220dfc0a760da4cb94c811a113641c16212868a7)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Fix missing usedOverridden on
  non-external key field

## 0.7.0

### Minor Changes

- [`88a3fd0`](https://github.com/the-guild-org/federation/commit/88a3fd0bcda6f8f8fbd90c8829be6809c60d368e)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Validate directive definitions

### Patch Changes

- [`a578a92`](https://github.com/the-guild-org/federation/commit/a578a9298a71c532a3f81234d182656e2a327091)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Fix missing @join\_\_field on
  non-external, but shareable fields, with @override in some graphs

- [`56b6c95`](https://github.com/the-guild-org/federation/commit/56b6c9526a071dd0676024c88a273f04e58968a7)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Fix FIELD_TYPE_MISMATCH - support
  [User!] vs [User] in output types

- [`a578a92`](https://github.com/the-guild-org/federation/commit/a578a9298a71c532a3f81234d182656e2a327091)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Support @join\_\_field(usedOverridden:)

- [`ee34815`](https://github.com/the-guild-org/federation/commit/ee348151caf0d7fe0a3099c8765d2f89f714f584)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Fix ProvidedArgumentsOnDirectivesRule
  and allow to use "[]" when "[String]" is expected

- [`a578a92`](https://github.com/the-guild-org/federation/commit/a578a9298a71c532a3f81234d182656e2a327091)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - delete subgraph spec according to
  schema definition/extension object

- [`88a3fd0`](https://github.com/the-guild-org/federation/commit/88a3fd0bcda6f8f8fbd90c8829be6809c60d368e)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - fix: allow to overwrite specified
  directives

- [`a578a92`](https://github.com/the-guild-org/federation/commit/a578a9298a71c532a3f81234d182656e2a327091)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Ignore inaccessible enum values in
  ENUM_VALUE_MISMATCH rule

- [`56b6c95`](https://github.com/the-guild-org/federation/commit/56b6c9526a071dd0676024c88a273f04e58968a7)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Improve SATISFIABILITY_ERROR - resolve
  query path step by step

- [`a578a92`](https://github.com/the-guild-org/federation/commit/a578a9298a71c532a3f81234d182656e2a327091)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Fix description of fields with
  @override

- [`a578a92`](https://github.com/the-guild-org/federation/commit/a578a9298a71c532a3f81234d182656e2a327091)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Allow @key(fields: ["a", "b"]) in
  Federation v1

- [`56b6c95`](https://github.com/the-guild-org/federation/commit/56b6c9526a071dd0676024c88a273f04e58968a7)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Fix unnecessary join\_\_field(external)
  for extension type where field is not needed by the query planner

- [`56b6c95`](https://github.com/the-guild-org/federation/commit/56b6c9526a071dd0676024c88a273f04e58968a7)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Fix unnecessary join\_\_field(external:
  true) on key fields

- [`a8a253d`](https://github.com/the-guild-org/federation/commit/a8a253d9a7181f12583699652b3ecd4cfb2ed302)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - SATISFIABILITY_ERROR improvements

- [`a578a92`](https://github.com/the-guild-org/federation/commit/a578a9298a71c532a3f81234d182656e2a327091)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Fix @join\_\_field(external: true)
  missing when field is overridden

- [`56b6c95`](https://github.com/the-guild-org/federation/commit/56b6c9526a071dd0676024c88a273f04e58968a7)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Improve SATISFIABILITY_ERROR - check
  satisfiability of non-entity types

## 0.6.2

### Patch Changes

- [`1ddf34e`](https://github.com/the-guild-org/federation/commit/1ddf34e0d3e55815cf2d9393a4ea58547cf2157e)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Fix EXTERNAL_ARGUMENT_MISSING - include
  nullable arguments as well

- [`1ddf34e`](https://github.com/the-guild-org/federation/commit/1ddf34e0d3e55815cf2d9393a4ea58547cf2157e)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Merge type definitions and type
  extensions when validating fields used in @requires, @provides and @key

- [`2525a24`](https://github.com/the-guild-org/federation/commit/2525a24e07f758d9b6898aa11f885bafd90e504e)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Support [T!]! type in @key(fields),
  @provides(fields) and @requires(fields)

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
