import { parse } from 'graphql';
import { beforeAll, describe, expect, test } from 'vitest';
import { composeServices } from '../src';
import { testImplementations } from './shared/testkit';

testImplementations(_ => {
  describe('interface object composition', () => {
    test.skip('if link directive is not present on all subgraphs, composition should fail', () => {
      const result = composeServices([
        {
          name: 'subgraphA',
          typeDefs: parse(/* GraphQL */ `
          @link(url: "https://specs.apollo.dev/federation/v2.3", import: ["@key", "@interfaceObject"])

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
      ]);
      // compoisition must fail
    });

    test.skip('link directive should have url pointing to federation > 2.3 to enable @interfaceObject on all subgraphs', () => {
      const result = composeServices([
        {
          name: 'subgraphA',
          typeDefs: parse(/* GraphQL */ `
          @link(url: "https://specs.apollo.dev/federation/v2.3", import: ["@key", "@interfaceObject"])

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
          @link(url: "https://specs.apollo.dev/federation/v2.1", import: ["@key", "@interfaceObject"])
            type Query {
              otherField: String
            }

            type MyInterface @key(fields: "id") @interfaceObject {
              id: ID!
              newField: String
            }
          `),
        },
      ]);
      // should fail
    });

    test.skip(`link directive should have @interfaceObject in 'import' array on all subgraphs`, () => {
      const result = composeServices([
        {
          name: 'subgraphA',
          typeDefs: parse(/* GraphQL */ `
              @link(url: "https://specs.apollo.dev/federation/v2.3", import: ["@key"])
    
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
              @link(url: "https://specs.apollo.dev/federation/v2.3", import: ["@key", "@interfaceObject"])
                type Query {
                  otherField: String
                }
    
                type MyInterface @key(fields: "id") @interfaceObject {
                  id: ID!
                  newField: String
                }
              `),
        },
      ]);
      // should fail
    });

    test.skip(`target interface must have @key directive on subgraph where it's defined`, () => {
      const result = composeServices([
        {
          name: 'subgraphA',
          typeDefs: parse(/* GraphQL */ `
              @link(url: "https://specs.apollo.dev/federation/v2.3", import: ["@key", "@interfaceObject"])
    
                type Query {
                  hello: String
                }
    
                interface MyInterface {
                    id: ID!
                    field: String
                }
              `),
        },
        {
          name: 'subgraphB',
          typeDefs: parse(/* GraphQL */ `
              @link(url: "https://specs.apollo.dev/federation/v2.3", import: ["@key", "@interfaceObject"])
                type Query {
                  otherField: String
                }
    
                type MyInterface @key(fields: "id") @interfaceObject {
                  id: ID!
                  newField: String
                }
              `),
        },
      ]);
      // should fail
    });

    test.skip(`all types implementing interface must have @key directive`, () => {
      const result = composeServices([
        {
          name: 'subgraphA',
          typeDefs: parse(/* GraphQL */ `
              @link(url: "https://specs.apollo.dev/federation/v2.3", import: ["@key", "@interfaceObject"])
    
                type Query {
                  hello: String
                }
    
                interface MyInterface @key(fields: "id") {
                    id: ID!
                    field: String
                }

                type MyType implements MyInterface {
                    id: ID!
                    field: String
                }
              `),
        },
        {
          name: 'subgraphB',
          typeDefs: parse(/* GraphQL */ `
              @link(url: "https://specs.apollo.dev/federation/v2.3", import: ["@key", "@interfaceObject"])
                type Query {
                  otherField: String
                }
    
                type MyInterface @key(fields: "id") @interfaceObject {
                  id: ID!
                  newField: String
                }
              `),
        },
      ]);
      // should fail
    });

    // Subgraph A must define every entity type in your entire supergraph that implements MyInterface.
    // Certain other subgraphs can also define these entities, but Subgraph A must define all of them.
    // You can think of a subgraph that defines an entity interface as also owning every entity that implements that interface.
    test.skip(`subgraph where interface is defined must have all entity types which implement that interface defined `, () => {
      const result = composeServices([
        {
          name: 'subgraphA',
          typeDefs: parse(/* GraphQL */ `
                @link(url: "https://specs.apollo.dev/federation/v2.3", import: ["@key", "@interfaceObject"])
        
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
                @link(url: "https://specs.apollo.dev/federation/v2.3", import: ["@key", "@interfaceObject"])
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
      ]);
      // should fail
    });

    test.skip(`every entity that implements interface must include all @keys from the MyInterface definition.`, () => {});

    test.skip(`entities implementing interface can optionally define additional @keys if needed.`, () => {});

    describe(`@interfaceObject definition`, () => {
      test.skip(`at least one other subgraph must define an interface type with @key directive which has the same name as the object type with @interfaceObject`, () => {});

      test.skip(`every subgraph which defines an interface type as object type must apply @interfaceObject directive to that type`, () => {});

      test.skip(`every subgraph which defines an interface type as object type must apply @key directive`, () => {});

      test.skip(`other subgraphs must not define interface with the same name`, () => {});

      test.skip(`subgraph where interfaceObject is defined can't have entity objects implementing interface type`, () => {});
    });
  });
});
