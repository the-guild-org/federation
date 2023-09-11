import { expect, test } from 'vitest';
import { graphql, testVersions } from '../../testkit.js';

testVersions((api, version) => {
  test('PROVIDES_INVALID_FIELDS', () => {
    expect(
      api.composeServices([
        {
          name: 'users',
          typeDefs: graphql`
            extend schema
            @link(
                url: "https://specs.apollo.dev/federation/${version}"
                import: ["@key"]
              )
            
            type Query {
              users: [User]
            }

            type User @key(fields: "id") {
              id: ID!
            }
          `,
        },
        {
          name: 'feed',
          typeDefs: graphql`
          extend schema
            @link(
                url: "https://specs.apollo.dev/federation/${version}"
                import: ["@key", "@external", "@provides"]
              )

            type Query {
              feed: [Post]
            }

            type Post @key(fields: "id") {
              id: ID!
              author: User @provides(fields: "userId")
            }

            extend type User @key(fields: "id") {
              id: ID! @external
            }
          `,
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining(
              `[feed] On field "Post.author", for @provides(fields: "userId"): Cannot query field "userId" on type "User" (if the field is defined in another subgraph, you need to add it to this subgraph with @external).`,
            ),
            extensions: expect.objectContaining({
              code: 'PROVIDES_INVALID_FIELDS',
            }),
          }),
        ]),
      }),
    );
  });
});
