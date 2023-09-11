import { expect, test } from 'vitest';
import { graphql, testVersions } from '../../testkit.js';

testVersions((api, version) => {
  test('INVALID_FIELD_SHARING', () => {
    expect(
      api.composeServices([
        {
          name: 'users',
          typeDefs: graphql`
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/${version}"
                import: ["@key", "@shareable"]
              )

            type Query {
              users: [User]
            }

            type User @key(fields: "id") {
              id: ID
              profile: Profile
            }

            type Profile @shareable {
              name: String
            }
          `,
        },
        {
          name: 'feed',
          typeDefs: graphql`
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/${version}"
                import: ["@key", "@shareable"]
              )

            type User @key(fields: "id") {
              id: ID
              profile: Profile
            }

            type Profile @shareable {
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
              `Non-shareable field "User.profile" is resolved from multiple subgraphs: it is resolved from subgraphs "feed" and "users" and defined as non-shareable in all of them`,
            ),
            extensions: expect.objectContaining({
              code: 'INVALID_FIELD_SHARING',
            }),
          }),
        ]),
      }),
    );

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
              user: User
            }

            type User {
              id: ID!
              name: String
            }
          `,
        },
        {
          name: 'feed',
          typeDefs: graphql`
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/${version}"
                import: ["@key", "@shareable"]
              )

              type User @key(fields: "id") {
                id: ID!
                comments: [String]
              }

              type Query {
                users: [User]
              }
          `,
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining(
              `Non-shareable field "User.id" is resolved from multiple subgraphs: it is resolved from subgraphs "feed" and "users" and defined as non-shareable in subgraph "users"`,
            ),
            extensions: expect.objectContaining({
              code: 'INVALID_FIELD_SHARING',
            }),
          }),
        ]),
      }),
    );
  });
});
