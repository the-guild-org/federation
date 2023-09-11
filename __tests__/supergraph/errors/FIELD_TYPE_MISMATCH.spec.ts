import { expect, test } from 'vitest';
import { graphql, testVersions } from '../../testkit.js';

testVersions((api, version) => {
  test('FIELD_TYPE_MISMATCH', () => {
    expect(
      api.composeServices([
        {
          name: 'users',
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])
            
            type Query {
              users: [User!]!
            }

            input Filter {
              ids: [ID!]!
            }

            type User @key(fields: "id") {
              id: ID
              name: String!
            }
          `,
        },
        {
          name: 'feed',
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])
            
            extend type User @key(fields: "id") {
              id: ID
              name: UserName!
            }

            input Filter {
              ids: [Int!]
            }

            type UserName {
              first: String!
              last: String!
            }
          `,
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining(
              `Type of field "User.name" is incompatible across subgraphs: it has type "UserName!" in subgraph "feed" but type "String!" in subgraph "users"`,
            ),
            extensions: expect.objectContaining({
              code: 'FIELD_TYPE_MISMATCH',
            }),
          }),
          expect.objectContaining({
            message: expect.stringContaining(
              `Type of field "Filter.ids" is incompatible across subgraphs: it has type "[Int!]" in subgraph "feed" but type "[ID!]!" in subgraph "users"`,
            ),
            extensions: expect.objectContaining({
              code: 'FIELD_TYPE_MISMATCH',
            }),
          }),
        ]),
      }),
    );
  });
});
