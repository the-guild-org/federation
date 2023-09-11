import { expect, test } from 'vitest';
import { assertCompositionSuccess, graphql, testVersions } from '../../shared/testkit.js';

testVersions((api, version) => {
  test('Fed v1: EXTENSION_WITH_NO_BASE', () => {
    expect(
      api.composeServices([
        {
          name: 'products',
          typeDefs: graphql`
            type Product @extends @key(fields: "id") {
              id: ID!
              name: String!
            }

            type Query {
              products: [Product]
            }
          `,
        },
        {
          name: 'reviews',
          typeDefs: graphql`
            type Query {
              reviews: [String]
            }
          `,
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining(
              `[products] Type "Product" is an extension type, but there is no type definition for "Product" in any subgraph.`,
            ),
            extensions: expect.objectContaining({
              code: 'EXTENSION_WITH_NO_BASE',
            }),
          }),
        ]),
      }),
    );

    assertCompositionSuccess(
      api.composeServices([
        {
          name: 'products',
          typeDefs: graphql`
            type Product @extends @key(fields: "id") {
              id: ID!
              name: String!
            }

            type Query {
              products: [Product]
            }
          `,
        },
        {
          name: 'reviews',
          typeDefs: graphql`
            type Product @extends @key(fields: "id") {
              id: ID!
              name: String!
              reviews: [String]
            }

            type Query {
              reviews: [String]
            }
          `,
        },
      ]),
    );

    assertCompositionSuccess(
      api.composeServices([
        {
          name: 'products',
          typeDefs: graphql`
            type Product @key(fields: "id") {
              id: ID!
            }

            extend type Product {
              name: String!
            }

            extend type Query {
              products: [Product]
            }
          `,
        },
        {
          name: 'reviews',
          typeDefs: graphql`
            type Product @extends @key(fields: "id") {
              id: ID! @external
              reviews: [String]
            }

            type Query {
              reviews: [String]
            }
          `,
        },
      ]),
    );
  });

  test('EXTENSION_WITH_NO_BASE', () => {
    expect(
      api.composeServices([
        {
          name: 'users',
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])
            
            type Query {
              users: [User]
            }

            type User @key(fields: "id") {
              id: ID
              profile: Profile
            }

            extend type Profile {
              name: String
            }
          `,
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining(
              `[users] Type "Profile" is an extension type, but there is no type definition for "Profile" in any subgraph.`,
            ),
            extensions: expect.objectContaining({
              code: 'EXTENSION_WITH_NO_BASE',
            }),
          }),
        ]),
      }),
    );

    assertCompositionSuccess(
      api.composeServices([
        {
          name: 'products',
          typeDefs: graphql`
              extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])
              
              type Product @key(fields: "id") {
                id: ID!
              }

              extend type Product {
                name: String
              }

              type Query {
                products: [Product]
              }
            `,
        },
        {
          name: 'reviews',
          typeDefs: graphql`
              extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key", "@extends", "@external"])
              type Product @key(fields: "id") @extends {
                id: ID! @external
                reviews: [String]
              }
            `,
        },
      ]),
    );

    assertCompositionSuccess(
      api.composeServices([
        {
          name: 'products',
          typeDefs: graphql`
              extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key", "@extends"])
              
              type Product @extends @key(fields: "id") {
                id: ID!
                name: String!
              }

              extend type Product {
                inStock: Boolean!
              }

              type Query {
                products: [Product]
              }
            `,
        },
        {
          name: 'reviews',
          typeDefs: graphql`
            type Query {
              reviews: [String]
            }
          `,
        },
      ]),
    );

    assertCompositionSuccess(
      api.composeServices([
        {
          name: 'products',
          typeDefs: graphql`
              extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key", "@extends"])
              
              type Product @extends @key(fields: "id") {
                id: ID!
                name: String!
              }

              type Query {
                products: [Product]
              }
            `,
        },
        {
          name: 'reviews',
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key", "@extends"])
            
            type Product @extends @key(fields: "id") {
              id: ID!
              reviews: [String]
            }

            type Query {
              reviews: [String]
            }
          `,
        },
      ]),
    );
  });
});
