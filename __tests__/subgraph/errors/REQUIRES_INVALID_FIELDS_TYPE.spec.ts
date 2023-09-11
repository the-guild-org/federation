import { expect, test } from 'vitest';
import { graphql, testVersions } from '../../testkit.js';

testVersions((api, version) => {
  test('REQUIRES_INVALID_FIELDS_TYPE', () => {
    expect(
      api.composeServices([
        {
          name: 'users',
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])
            
            type Query {
              users: [User!]!
            }

            type User @key(fields: "id") {
              id: ID
            }
          `,
        },
        {
          name: 'friends',
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key", "@requires"])
            
            extend type User @key(fields: "id") {
              id: ID
              friends: [User!]! @requires(fields: 123)
            }
          `,
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining(
              `[friends] On field "User.friends", for @requires(fields: 123): Invalid value for argument "fields": must be a string.`,
            ),
            extensions: expect.objectContaining({
              code: 'REQUIRES_INVALID_FIELDS_TYPE',
            }),
          }),
        ]),
      }),
    );
  });
});
