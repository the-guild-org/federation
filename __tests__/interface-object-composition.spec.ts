import { parse } from 'graphql';
import { describe, expect, test } from 'vitest';
import { composeServices, CompositionFailure, CompositionSuccess } from '../src';
import { testImplementations } from './shared/testkit';

testImplementations(_ => {
  describe('interface object composition', () => {
    test('if link directive is not present on all subgraphs, composition should fail', () => {
      const result = composeServices([
        {
          name: 'subgraphA',
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/v2.3"
                import: ["@key", "@interfaceObject"]
              )

            type Query {
              hello: String
            }

            interface MyInterface @key(fields: "id") {
              id: ID!
              field: String
            }
          `),
        },
        {
          name: 'subgraphB',
          typeDefs: parse(/* GraphQL */ `
            type Query {
              otherField: String
            }

            type MyInterface @key(fields: "id") @interfaceObject {
              id: ID!
              newField: String
            }
          `),
        },
      ]) as CompositionFailure;
      expect(result.errors).toMatchInlineSnapshot(`
        [
          [GraphQLError: [subgraphB] Unknown directive "@interfaceObject".],
        ]
      `);
    });

    test('link directive should have url pointing to federation > 2.3 to enable @interfaceObject on all subgraphs', () => {
      const result = composeServices([
        {
          name: 'subgraphA',
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/v2.1"
                import: ["@key", "@interfaceObject"]
              )

            type Query {
              hello: String
            }

            interface MyInterface @key(fields: "id") {
              id: ID!
              field: String
            }

            type MyType implements MyInterface @key(fields: "id") {
              id: ID!
              field: String
            }
          `),
        },
        {
          name: 'subgraphB',
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/v2.3"
                import: ["@key", "@interfaceObject"]
              )
            type Query {
              otherField: String
            }

            type MyInterface @key(fields: "id") @interfaceObject {
              id: ID!
              newField: String
            }
          `),
        },
      ]) as CompositionFailure;
      expect(result.errors).toMatchInlineSnapshot(`
        [
          [GraphQLError: [subgraphA] Cannot import unknown element "@interfaceObject".],
        ]
      `);

      // define success case
      const result2 = composeServices([
        {
          name: 'subgraphA',
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/v2.3"
                import: ["@key", "@interfaceObject"]
              )

            type Query {
              hello: String
            }

            interface MyInterface @key(fields: "id") {
              id: ID!
              field: String
            }

            type MyType implements MyInterface @key(fields: "id") {
              id: ID!
              field: String
            }
          `),
        },
        {
          name: 'subgraphB',
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/v2.3"
                import: ["@key", "@interfaceObject"]
              )
            type Query {
              otherField: String
            }

            type MyInterface @key(fields: "id") @interfaceObject {
              id: ID!
              newField: String
            }
          `),
        },
      ]) as CompositionSuccess;
      expect(result2.supergraphSdl).toBeDefined();
    });

    test(`link directive should have @interfaceObject in 'import' array on all subgraphs`, () => {
      const result = composeServices([
        {
          name: 'subgraphA',
          typeDefs: parse(/* GraphQL */ `
            extend schema @link(url: "https://specs.apollo.dev/federation/v2.3", import: ["@key"])

            type Query {
              hello: String
            }

            interface MyInterface @key(fields: "id") {
              id: ID!
              field: String
            }

            type MyType implements MyInterface @key(fields: "id") {
              id: ID!
              field: String
            }
          `),
        },
        {
          name: 'subgraphB',
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/v2.3"
                import: ["@key", "@interfaceObject"]
              )
            type Query {
              otherField: String
            }

            type MyInterface @key(fields: "id") @interfaceObject {
              id: ID!
              newField: String
            }
          `),
        },
      ]) as CompositionFailure;
      expect(result.errors).toMatchInlineSnapshot(`
        [
          [GraphQLError: For @interfaceObject to work, there is must be an entity interface defined in the different subgraph. Interface MyInterface in subgraph SUBGRAPH_A is good candidate, but it doesn't satisfy the requirements on version (>= 2.3) or imports (@key, @interfaceObject). Maybe check those?],
        ]
      `);
    });

    test(`target interface must have @key directive on subgraph where it's defined`, () => {
      const result = composeServices([
        {
          name: 'subgraphA',
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/v2.3"
                import: ["@key", "@interfaceObject"]
              )

            type Query {
              hello: String
            }

            interface MyInterface {
              id: ID!
              field: String
            }

            type MyType implements MyInterface @key(fields: "id") {
              id: ID!
              field: String
            }
          `),
        },
        {
          name: 'subgraphB',
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/v2.3"
                import: ["@key", "@interfaceObject"]
              )
            type Query {
              otherField: String
            }

            type MyInterface @key(fields: "id") @interfaceObject {
              id: ID!
              newField: String
            }
          `),
        },
      ]) as CompositionFailure;
      expect(result.errors).toMatchInlineSnapshot(`
        [
          [GraphQLError: @key directive must be present on interface type MyInterface in subgraph SUBGRAPH_A for @objectInterface to work],
        ]
      `);
    });

    // Subgraph A must define every entity type in your entire supergraph that implements MyInterface.
    // Certain other subgraphs can also define these entities, but Subgraph A must define all of them.
    // You can think of a subgraph that defines an entity interface as also owning every entity that implements that interface.
    // this case is really unclear.
    // documentation: https://www.apollographql.com/docs/federation/federated-types/interfaces/#usage-rules
    test.skip(`subgraph where interface is defined must have all entity types which implement that interface defined `, () => {
      const result = composeServices([
        {
          name: 'subgraphA',
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/v2.3"
                import: ["@key", "@interfaceObject"]
              )

            type Query {
              hello: String
            }

            interface MyInterface @key(fields: "id") {
              id: ID!
              field: String
            }
          `),
        },
        {
          name: 'subgraphB',
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/v2.3"
                import: ["@key", "@interfaceObject"]
              )
            type Query {
              otherField: String
            }

            type MyInterface @key(fields: "id") @interfaceObject {
              id: ID!
              newField: String
            }

            type MyType implements MyInterface @key(fields: "id") {
              id: ID!
              field: String
            }
          `),
        },
      ]) as CompositionFailure;
      expect(result.errors).toMatchInlineSnapshot(``);
      // should fail
    });

    describe(`@interfaceObject definition`, () => {
      describe(`at least one other subgraph must define an interface type with @key directive which has the same name as the object type with @interfaceObject`, () => {
        test(`interface type is not present on any subgraph. Should fail`, () => {
          const result = composeServices([
            {
              name: 'subgraphA',
              typeDefs: parse(/* GraphQL */ `
                extend schema
                  @link(
                    url: "https://specs.apollo.dev/federation/v2.3"
                    import: ["@key", "@interfaceObject"]
                  )

                type Query {
                  hello: String
                }
              `),
            },
            {
              name: 'subgraphB',
              typeDefs: parse(/* GraphQL */ `
                extend schema
                  @link(
                    url: "https://specs.apollo.dev/federation/v2.3"
                    import: ["@key", "@interfaceObject"]
                  )
                type Query {
                  otherField: String
                }

                type MyInterface @key(fields: "id") @interfaceObject {
                  id: ID!
                  newField: String
                }
              `),
            },
          ]) as CompositionFailure;
          expect(result.errors).toMatchInlineSnapshot(`
            [
              [GraphQLError: @interfaceObject MyInterface in subgraph SUBGRAPH_B doesn't have corresponding entity interface in the different subgraph.],
            ]
          `);
        });

        test(`interface type is present on other subgraph but doesn't have @key directive. Should fail`, () => {
          const result = composeServices([
            {
              name: 'subgraphA',
              typeDefs: parse(/* GraphQL */ `
                extend schema
                  @link(
                    url: "https://specs.apollo.dev/federation/v2.3"
                    import: ["@key", "@interfaceObject"]
                  )

                type Query {
                  hello: String
                }

                interface MyInterface {
                  id: ID!
                  field: String
                }

                type SomeType implements MyInterface @key(fields: "id") {
                  id: ID!
                  field: String
                }
              `),
            },
            {
              name: 'subgraphB',
              typeDefs: parse(/* GraphQL */ `
                extend schema
                  @link(
                    url: "https://specs.apollo.dev/federation/v2.3"
                    import: ["@key", "@interfaceObject"]
                  )
                type Query {
                  otherField: String
                }

                type MyInterface @interfaceObject {
                  id: ID!
                  newField: String
                }
              `),
            },
          ]) as CompositionFailure;
          expect(result.errors).toMatchInlineSnapshot(`
            [
              [GraphQLError: @key directive must be present on interface type MyInterface in subgraph SUBGRAPH_A for @objectInterface to work],
            ]
          `);
        });

        test(`interface type is present on other subgraph with @key directive. Should succeed and add fields from interfaceObject`, () => {
          const result = composeServices([
            {
              name: 'subgraphA',
              typeDefs: parse(/* GraphQL */ `
                extend schema
                  @link(
                    url: "https://specs.apollo.dev/federation/v2.3"
                    import: ["@key", "@interfaceObject"]
                  )

                type Query {
                  hello: String
                }

                interface MyInterface @key(fields: "id") {
                  id: ID!
                  field: String
                }

                type IimplementMyInterface implements MyInterface @key(fields: "id") {
                  id: ID!
                  field: String
                }
              `),
            },
            {
              name: 'subgraphB',
              typeDefs: parse(/* GraphQL */ `
                extend schema
                  @link(
                    url: "https://specs.apollo.dev/federation/v2.3"
                    import: ["@key", "@interfaceObject"]
                  )
                type Query {
                  otherField: String
                }

                type MyInterface @key(fields: "id") @interfaceObject {
                  id: ID!
                  hello: Int
                }
              `),
            },
          ]) as CompositionSuccess;

          expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
            type IimplementMyInterface implements MyInterface
              @join__type(graph: SUBGRAPH_A, key: "id")
              @join__implements(graph: SUBGRAPH_A, interface: "MyInterface") {
              id: ID!
              field: String
              hello: Int @join__field
            }
          `);
          expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
            interface MyInterface
              @join__type(graph: SUBGRAPH_A, key: "id")
              @join__type(graph: SUBGRAPH_B, isInterfaceObject: true, key: "id") {
              id: ID!
              field: String @join__field(graph: SUBGRAPH_A)
              hello: Int @join__field(graph: SUBGRAPH_B)
            }
          `);
        });
      });

      describe(`fields contribution`, () => {
        test(`several subgraphs contribute fields to the same interface through interfaceObject. Should succeed`, () => {
          const result = composeServices([
            {
              name: 'subgraphA',
              typeDefs: parse(/* GraphQL */ `
                extend schema
                  @link(
                    url: "https://specs.apollo.dev/federation/v2.3"
                    import: ["@key", "@interfaceObject"]
                  )

                type Query {
                  hello: String
                }

                interface MyInterface @key(fields: "id") {
                  id: ID!
                  field: String
                }

                type IimplementMyInterface implements MyInterface @key(fields: "id") {
                  id: ID!
                  field: String
                }
              `),
            },
            {
              name: 'subgraphB',
              typeDefs: parse(/* GraphQL */ `
                extend schema
                  @link(
                    url: "https://specs.apollo.dev/federation/v2.3"
                    import: ["@key", "@interfaceObject"]
                  )
                type Query {
                  otherField: String
                }

                type MyInterface @key(fields: "id") @interfaceObject {
                  id: ID!
                  hello: Int
                }
              `),
            },
            {
              name: 'subgraphC',
              typeDefs: parse(/* GraphQL */ `
                extend schema
                  @link(
                    url: "https://specs.apollo.dev/federation/v2.3"
                    import: ["@key", "@interfaceObject"]
                  )
                type Query {
                  someNewField: String
                }

                type MyInterface @key(fields: "id") @interfaceObject {
                  id: ID!
                  hello2: Int
                }
              `),
            },
          ]) as CompositionSuccess;

          expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
            type IimplementMyInterface implements MyInterface
              @join__type(graph: SUBGRAPH_A, key: "id")
              @join__implements(graph: SUBGRAPH_A, interface: "MyInterface") {
              id: ID!
              field: String
              hello: Int @join__field
              hello2: Int @join__field
            }
          `);
          expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
            interface MyInterface
              @join__type(graph: SUBGRAPH_A, key: "id")
              @join__type(graph: SUBGRAPH_B, isInterfaceObject: true, key: "id")
              @join__type(graph: SUBGRAPH_C, isInterfaceObject: true, key: "id") {
              id: ID!
              field: String @join__field(graph: SUBGRAPH_A)
              hello: Int @join__field(graph: SUBGRAPH_B)
              hello2: Int @join__field(graph: SUBGRAPH_C)
            }
          `);
        });

        test.skip(`interfaceObject tries to contribute field with conflicting type. Should Fail`, () => {});
        test.skip(`several interfaces and several interface objects. Should succeed`, () => {});
      });
    });
  });
});
