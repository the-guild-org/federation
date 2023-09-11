import { expect, test } from 'vitest';
import { graphql, testVersions } from '../../testkit.js';

testVersions((api, version) => {
  test.skipIf(api.library === 'guild')('INTERFACE_FIELD_NO_IMPLEM', () => {
    expect(
      api.composeServices([
        {
          name: 'users',
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key"])
            
            type Query {
              users: [User]
            }

            type RegisteredUser implements User @key(fields: "id") {
              id: ID!
              name: String!
              email: String
            }

            interface User {
              id: ID!
              name: String!
              email: String
            }
          `,
        },
        {
          name: 'feed',
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key"])
            
            interface User {
              id: ID!
              name: String!
            }

            type Author implements User @key(fields: "id") {
              id: ID!
              name: String!
            }
          `,
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining(
              `Interface field "User.email" is declared in subgraph "users" but type "Author", which implements "User" only in subgraph "feed" does not have field "email".`,
            ),
            extensions: expect.objectContaining({
              code: 'INTERFACE_FIELD_NO_IMPLEM',
            }),
          }),
        ]),
      }),
    );

    // KNOW: check all interface fields are implemented when one subgraph introduces a new field to the interface
  });
});
