# Federation Composition

Supports all Federation versions prior to v2.4.0.

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

## Supergraph Composition

✅ Done

## Validation

🚧 Work in progress

### Validation rules

- [x] `NO_QUERIES`
- [x] `TYPE_KIND_MISMATCH`
- [x] `EXTENSION_WITH_NO_BASE`
- [x] `FIELD_TYPE_MISMATCH`
- [x] `FIELD_ARGUMENT_TYPE_MISMATCH`
- [x] `EXTERNAL_TYPE_MISMATCH`
- [x] `ENUM_VALUE_MISMATCH`
- [x] `EMPTY_MERGED_ENUM_TYPE`
- [x] `EMPTY_MERGED_INPUT_TYPE`
- [x] `OVERRIDE_SOURCE_HAS_OVERRIDE`
- [x] `EXTERNAL_MISSING_ON_BASE`
- [x] `REQUIRED_ARGUMENT_MISSING_IN_SOME_SUBGRAPH`
- [x] `REQUIRED_INPUT_FIELD_MISSING_IN_SOME_SUBGRAPH`
- [x] `EXTERNAL_ARGUMENT_MISSING`
- [x] `INPUT_FIELD_DEFAULT_MISMATCH`
- [x] `FIELD_ARGUMENT_DEFAULT_MISMATCH`
- [x] `DEFAULT_VALUE_USES_INACCESSIBLE`
- [x] `ONLY_INACCESSIBLE_CHILDREN`
- [x] `REFERENCED_INACCESSIBLE`
- [x] `INTERFACE_KEY_MISSING_IMPLEMENTATION_TYPE`
- [x] `INVALID_FIELD_SHARING`
- [x] `PROVIDES_INVALID_FIELDS_TYPE`
- [x] `INVALID_GRAPHQL`
- [x] `OVERRIDE_ON_INTERFACE`
- [x] `OVERRIDE_FROM_SELF_ERROR`
- [x] `QUERY_ROOT_TYPE_INACCESSIBLE`
- [x] `PROVIDES_UNSUPPORTED_ON_INTERFACE`
- [x] `REQUIRES_UNSUPPORTED_ON_INTERFACE`
- [x] `KEY_UNSUPPORTED_ON_INTERFACE`
- [x] `KEY_INVALID_FIELDS_TYPE`
- [x] `KEY_FIELDS_HAS_ARGS`
- [x] `KEY_FIELDS_SELECT_INVALID_TYPE`
- [x] `KEY_INVALID_FIELDS`
- [x] `REQUIRES_INVALID_FIELDS`
- [x] `REQUIRES_INVALID_FIELDS_TYPE`
- [x] `MERGED_DIRECTIVE_APPLICATION_ON_EXTERNAL`
- [x] `INTERFACE_KEY_NOT_ON_IMPLEMENTATION`
- [x] `PROVIDES_FIELDS_MISSING_EXTERNAL`
- [x] `REQUIRES_FIELDS_MISSING_EXTERNAL`
- [x] `PROVIDES_ON_NON_OBJECT_FIELD`
- [x] `INVALID_SUBGRAPH_NAME`
- [x] `PROVIDES_FIELDS_HAS_ARGS`
- [x] `PROVIDES_INVALID_FIELDS`
- [x] `EXTERNAL_UNUSED`
- [x] `DIRECTIVE_COMPOSITION_ERROR`
- [x] `ROOT_QUERY_USED`
- [x] `ROOT_MUTATION_USED`
- [x] `ROOT_SUBSCRIPTION_USED`
- [x] `INVALID_SHAREABLE_USAGE`
- [x] `DIRECTIVE_DEFINITION_INVALID`
- [x] `KEY_DIRECTIVE_IN_FIELDS_ARG`
- [x] `PROVIDES_DIRECTIVE_IN_FIELDS_ARG`
- [x] `REQUIRES_DIRECTIVE_IN_FIELDS_ARG`
- [x] `TYPE_DEFINITION_INVALID`
- [x] `OVERRIDE_COLLISION_WITH_ANOTHER_DIRECTIVE`
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

### TODOs

- [ ] `SATISFIABILITY_ERROR` - deeply nested key fields
- [ ] `SATISFIABILITY_ERROR` - fragments in keys
- [ ] `SATISFIABILITY_ERROR` - support interfaces... (kill me)
- [ ] `SATISFIABILITY_ERROR` - @require - check if fields defined by @require can be resolved by
      current subgraph or by moving to other subgraphs.
- [ ] `SATISFIABILITY_ERROR` - @provides?
- [ ] more accurate key fields comparison (I did string ≠ string but we need to make it better)
- [ ] support `@interfaceObject`
- [ ] support `@key(resolvable: false)`
- [ ] support `[String!]!` and `[String!]` comparison, not only `String!` vs `String`
