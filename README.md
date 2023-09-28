# Federation Composition

Supports all Federation versions prior to v2.4.0. Drop-in replacement for `@apollo/composition`.

🚧 Work in progress, so please check [TODOs](#todos).

## Comparison with `@apollo/composition`

- Open Source (MIT License)
- identical API
- same set of validation rules and exact same error messages
- produces Supergraph SDL (can be used with Apollo Router and every tool that supports Supergraph
  SDL)
- does not support Hints

## Installation

```bash
# NPM
npm install @theguild/federation-composition
# PNPM
pnpm add @theguild/federation-composition
# Yarn
yarn add @theguild/federation-composition
```

## Usage

```ts
import { parse } from 'graphql'
import { composeServices, compositionHasErrors } from '@theguild/federation-composition'

const result = composeServices([
  {
    name: 'users',
    typeDefs: parse(/* GraphQL */ `
      extend schema @link(url: "https://specs.apollo.dev/federation/v2.3", import: ["@key"])

      type User @key(fields: "id") {
        id: ID!
        name: String!
      }

      type Query {
        users: [User]
      }
    `)
  },
  {
    name: 'comments',
    typeDefs: parse(/* GraphQL */ `
      extend schema
        @link(url: "https://specs.apollo.dev/federation/v2.3", import: ["@key", "@external"])

      extend type User @key(fields: "id") {
        id: ID! @external
        comments: [Comment]
      }

      type Comment {
        id: ID!
        text: String!
        author: User!
      }
    `)
  }
])

if (compositionHasErrors(result)) {
  console.error(result.errors)
} else {
  console.log(result.supergraphSdl)
}
```

## Contributing

Install the dependencies:

```bash
pnpm install
```

Run the tests:

```bash
pnpm test
```

### How to help?

- Grab one of the failing tests and fix it.
- Add new tests to cover more cases.
- Add missing rules.
- Look for `// TODO:` comments in the code and fix/implement them.
- Todos with `// TODO: T[NUMBER]` are on Notion.
- Look for `skipIf` or `skip` in the tests.
- Refactor code (piece by piece) if you feel like it.

## Supergraph SDL Composition

✅ Done

## Validation

🚧 Work in progress

### Validation rules

- ✅ `NO_QUERIES`
- ✅ `TYPE_KIND_MISMATCH`
- ✅ `EXTENSION_WITH_NO_BASE`
- ✅ `FIELD_TYPE_MISMATCH`
- ✅ `FIELD_ARGUMENT_TYPE_MISMATCH`
- ✅ `EXTERNAL_TYPE_MISMATCH`
- ✅ `ENUM_VALUE_MISMATCH`
- ✅ `EMPTY_MERGED_ENUM_TYPE`
- ✅ `EMPTY_MERGED_INPUT_TYPE`
- ✅ `OVERRIDE_SOURCE_HAS_OVERRIDE`
- ✅ `EXTERNAL_MISSING_ON_BASE`
- ✅ `REQUIRED_ARGUMENT_MISSING_IN_SOME_SUBGRAPH`
- ✅ `REQUIRED_INPUT_FIELD_MISSING_IN_SOME_SUBGRAPH`
- ✅ `EXTERNAL_ARGUMENT_MISSING`
- ✅ `INPUT_FIELD_DEFAULT_MISMATCH`
- ✅ `FIELD_ARGUMENT_DEFAULT_MISMATCH`
- ✅ `DEFAULT_VALUE_USES_INACCESSIBLE`
- ✅ `ONLY_INACCESSIBLE_CHILDREN`
- ✅ `REFERENCED_INACCESSIBLE`
- ✅ `INTERFACE_KEY_MISSING_IMPLEMENTATION_TYPE`
- ✅ `INVALID_FIELD_SHARING`
- ✅ `PROVIDES_INVALID_FIELDS_TYPE`
- ✅ `INVALID_GRAPHQL`
- ✅ `OVERRIDE_ON_INTERFACE`
- ✅ `OVERRIDE_FROM_SELF_ERROR`
- ✅ `QUERY_ROOT_TYPE_INACCESSIBLE`
- ✅ `PROVIDES_UNSUPPORTED_ON_INTERFACE`
- ✅ `REQUIRES_UNSUPPORTED_ON_INTERFACE`
- ✅ `KEY_UNSUPPORTED_ON_INTERFACE`
- ✅ `KEY_INVALID_FIELDS_TYPE`
- ✅ `KEY_FIELDS_HAS_ARGS`
- ✅ `KEY_FIELDS_SELECT_INVALID_TYPE`
- ✅ `KEY_INVALID_FIELDS`
- ✅ `REQUIRES_INVALID_FIELDS`
- ✅ `REQUIRES_INVALID_FIELDS_TYPE`
- ✅ `MERGED_DIRECTIVE_APPLICATION_ON_EXTERNAL`
- ✅ `INTERFACE_KEY_NOT_ON_IMPLEMENTATION`
- ✅ `PROVIDES_FIELDS_MISSING_EXTERNAL`
- ✅ `REQUIRES_FIELDS_MISSING_EXTERNAL`
- ✅ `PROVIDES_ON_NON_OBJECT_FIELD`
- ✅ `INVALID_SUBGRAPH_NAME`
- ✅ `PROVIDES_FIELDS_HAS_ARGS`
- ✅ `PROVIDES_INVALID_FIELDS`
- ✅ `EXTERNAL_UNUSED`
- ✅ `DIRECTIVE_COMPOSITION_ERROR`
- ✅ `ROOT_QUERY_USED`
- ✅ `ROOT_MUTATION_USED`
- ✅ `ROOT_SUBSCRIPTION_USED`
- ✅ `INVALID_SHAREABLE_USAGE`
- ✅ `DIRECTIVE_DEFINITION_INVALID`
- ✅ `KEY_DIRECTIVE_IN_FIELDS_ARG`
- ✅ `PROVIDES_DIRECTIVE_IN_FIELDS_ARG`
- ✅ `REQUIRES_DIRECTIVE_IN_FIELDS_ARG`
- ✅ `TYPE_DEFINITION_INVALID`
- ✅ `OVERRIDE_COLLISION_WITH_ANOTHER_DIRECTIVE`

### TODOs

- [ ] `INTERFACE_OBJECT_USAGE_ERROR`
- [ ] `INTERFACE_FIELD_NO_IMPLEM`
- [ ] `SATISFIABILITY_ERROR`
- [ ] `DISALLOWED_INACCESSIBLE`
- [ ] `DOWNSTREAM_SERVICE_ERROR`
- [ ] `EXTERNAL_ARGUMENT_DEFAULT_MISMATCH`
- [ ] `EXTERNAL_ARGUMENT_TYPE_MISMATCH`
- [ ] `EXTERNAL_COLLISION_WITH_ANOTHER_DIRECTIVE`
- [ ] `IMPLEMENTED_BY_INACCESSIBLE`
- [ ] `INVALID_FEDERATION_SUPERGRAPH`
- [ ] `LINK_IMPORT_NAME_MISMATCH`
- [ ] `REQUIRED_INACCESSIBLE`
- [ ] `SHAREABLE_HAS_MISMATCHED_RUNTIME_TYPES`
- [ ] `UNSUPPORTED_FEATURE`
- [ ] `UNSUPPORTED_LINKED_FEATURE`
- [ ] `SATISFIABILITY_ERROR` - deeply nested key fields
- [ ] `SATISFIABILITY_ERROR` - fragments in keys
- [ ] `SATISFIABILITY_ERROR` - support interfaces... (kill me)
- [ ] `SATISFIABILITY_ERROR` - @require - check if fields defined by @require can be resolved by
      current subgraph or by moving to other subgraphs.
- [ ] `SATISFIABILITY_ERROR` - @provides?
- [ ] more accurate key fields comparison (I did string ≠ string but we need to make it better)
- [ ] support `@interfaceObject`
- [ ] support `[String!]!` and `[String!]` comparison, not only `String!` vs `String`
