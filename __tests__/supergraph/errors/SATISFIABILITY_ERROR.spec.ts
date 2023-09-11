import { expect, test } from 'vitest';
import { assertCompositionSuccess, graphql, testVersions } from '../../shared/testkit.js';

testVersions((api, version) => {
  test.skipIf(api.library === 'guild')('cannot satisfy @require conditions', () => {
    // TODO: @requires
    expect(
      api.composeServices([
        {
          name: 'users',
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key"])

            type Query {
              users: [User]
            }

            type User @key(fields: "id name") {
              id: ID!
              name: String!
            }
          `,
        },
        {
          name: 'feed',
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key", "@external", "@requires"])

            type Query {
              usersByIds(ids: [ID!]!): [User!]!
            }

            extend type User @key(fields: "id") {
              id: ID @external
              name: String! @external
              comments: [String] @requires(fields: "name")
            }
          `,
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        errors: [
          expect.objectContaining({
            message: expect.stringContaining(
              'The following supergraph API query:\n' +
                '{\n' +
                '  users {\n' +
                '    comments\n' +
                '  }\n' +
                '}\n' +
                'cannot be satisfied by the subgraphs because:\n' +
                '- from subgraph "users": cannot find field "User.comments".\n' +
                '- from subgraph "feed": cannot satisfy @require conditions on field "User.comments".',
              // TODO: ^ check if `@require` fields on `User.comments` can be resolved by current subgraph or by moving between subgraphs.
            ),
            extensions: expect.objectContaining({
              code: 'SATISFIABILITY_ERROR',
            }),
          }),
          expect.objectContaining({
            message: expect.stringContaining(
              'The following supergraph API query:\n' +
                '{\n' +
                '  usersByIds(ids: []) {\n' +
                '    name\n' +
                '  }\n' +
                '}\n' +
                'cannot be satisfied by the subgraphs because:\n' +
                '- from subgraph "feed":\n' +
                '  - field "User.name" is not resolvable because marked @external.\n' +
                '  - cannot move to subgraph "users" using @key(fields: "id name") of "User", the key field(s) cannot be resolved from subgraph "feed".',
            ),
            extensions: expect.objectContaining({
              code: 'SATISFIABILITY_ERROR',
            }),
          }),
          expect.objectContaining({
            message: expect.stringContaining(
              'The following supergraph API query:\n' +
                '{\n' +
                '  usersByIds(ids: []) {\n' +
                '    comments\n' +
                '  }\n' +
                '}\n' +
                'cannot be satisfied by the subgraphs because:\n' +
                '- from subgraph "feed":\n' +
                '  - cannot satisfy @require conditions on field "User.comments".\n' +
                '  - cannot move to subgraph "users" using @key(fields: "id name") of "User", the key field(s) cannot be resolved from subgraph "feed".',
            ),
            extensions: expect.objectContaining({
              code: 'SATISFIABILITY_ERROR',
            }),
          }),
        ],
      }),
    );
  });
  test('insufficient key fields to move between graphs', () => {
    // Cannot resolve User.name from Query.randomUser because key field "id" from subgraph "feed"
    // is not enough to fullfil the @key(fields: "id name") of User from subgraph "users"
    expect(
      api.composeServices([
        {
          name: 'users',
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key"])

            type Query {
              userById: User
            }

            type User @key(fields: "id name") {
              id: ID!
              name: String!
            }
          `,
        },
        {
          name: 'feed',
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key", "@external"])

            type Query {
              randomUser: User
            }

            extend type User @key(fields: "id") {
              id: ID @external
              comments: [String]
            }
          `,
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        errors: [
          expect.objectContaining({
            message: expect.stringContaining(
              'The following supergraph API query:\n' +
                '{\n' +
                '  randomUser {\n' +
                '    name\n' +
                '  }\n' +
                '}\n' +
                'cannot be satisfied by the subgraphs because:\n' +
                '- from subgraph "feed":\n' +
                '  - cannot find field "User.name".\n' +
                '  - cannot move to subgraph "users" using @key(fields: "id name") of "User", the key field(s) cannot be resolved from subgraph "feed".',
            ),
            extensions: expect.objectContaining({
              code: 'SATISFIABILITY_ERROR',
            }),
          }),
        ],
      }),
    );

    // Both User.{name,email,profile} cannot be resolved as Federation Gateway cannot move between subgraphs using identical @key.
    // The key fields are not the same ("id" is not enough to move from subgraph "a" to subgraph "b" that requires "id email").
    expect(
      api.composeServices([
        {
          name: 'a',
          typeDefs: graphql`
            extend type User @key(fields: "id") {
              id: ID @external
              tags: [String]
            }

            type Query {
              usersById(ids: [ID!]!): [User!]!
            }
          `,
        },
        {
          name: 'b',
          typeDefs: graphql`
            type User @key(fields: "id email") {
              id: ID
              name: String
              email: String
              profile: String
            }

            type Query {
              users(ids: [ID!]!): [User!]!
            }
          `,
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        errors: [
          [
            expect.objectContaining({
              message: expect.stringContaining(
                'The following supergraph API query:\n' +
                  '{\n' +
                  '  usersById(ids: []) {\n' +
                  '    name\n' +
                  '  }\n' +
                  '}\n' +
                  'cannot be satisfied by the subgraphs because:\n' +
                  '- from subgraph "a":\n' +
                  '  - cannot find field "User.name".\n' +
                  '  - cannot move to subgraph "b" using @key(fields: "id email") of "User", the key field(s) cannot be resolved from subgraph "a".',
              ),
              extensions: expect.objectContaining({
                code: 'SATISFIABILITY_ERROR',
              }),
            }),
            // Show as first (when it's apollo) and second (when it's guild)
            api.library === 'apollo' ? 1 : 2,
          ],
          [
            expect.objectContaining({
              message: expect.stringContaining(
                'The following supergraph API query:\n' +
                  '{\n' +
                  '  usersById(ids: []) {\n' +
                  '    email\n' +
                  '  }\n' +
                  '}\n' +
                  'cannot be satisfied by the subgraphs because:\n' +
                  '- from subgraph "a":\n' +
                  '  - cannot find field "User.email".\n' +
                  '  - cannot move to subgraph "b" using @key(fields: "id email") of "User", the key field(s) cannot be resolved from subgraph "a".',
              ),
              extensions: expect.objectContaining({
                code: 'SATISFIABILITY_ERROR',
              }),
            }),
            // Show as second (when it's apollo) and first (when it's guild)
            api.library === 'apollo' ? 2 : 1,
          ],
          [
            expect.objectContaining({
              message: expect.stringContaining(
                'The following supergraph API query:\n' +
                  '{\n' +
                  '  usersById(ids: []) {\n' +
                  '    profile\n' +
                  '  }\n' +
                  '}\n' +
                  'cannot be satisfied by the subgraphs because:\n' +
                  '- from subgraph "a":\n' +
                  '  - cannot find field "User.profile".\n' +
                  '  - cannot move to subgraph "b" using @key(fields: "id email") of "User", the key field(s) cannot be resolved from subgraph "a".',
              ),
              extensions: expect.objectContaining({
                code: 'SATISFIABILITY_ERROR',
              }),
            }),
            // Show as third in both cases
            3,
          ],
        ]
          // Apollo returns errors in a different order
          .sort((a, b) => a[1] - b[1])
          .map(([error]) => error),
      }),
    );
  });

  test('insufficient key fields to move between graphs (entity many level deep from root type)', () => {
    // Same as above, but with an entity deep down the path.
    // Cannot resolve User.name from Query.randomUser because key field "id" from subgraph "feed"
    // is not enough to fullfil the @key(fields: "id name") of User from subgraph "users".
    expect(
      api.composeServices([
        {
          name: 'users',
          typeDefs: graphql`
          extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key"])

          type Query {
            userById(id: ID): User
          }

          type User @key(fields: "id name") {
            id: ID!
            name: String!
          }
        `,
        },
        {
          name: 'feed',
          typeDefs: graphql`
          extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key", "@external"])

          type Query {
            users: UserConnection!
            randomUser: UserEdge
          }

          type UserConnection {
            edges: [UserEdge]
          }

          type UserEdge {
            node: User
          }

          extend type User @key(fields: "id") {
            id: ID @external
            comments: [String]
          }
        `,
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        errors: [
          expect.objectContaining({
            message: expect.stringContaining(
              'The following supergraph API query:\n' +
                '{\n' +
                '  randomUser {\n' +
                '    node {\n' +
                '      name\n' +
                '    }\n' +
                '  }\n' +
                '}\n' +
                'cannot be satisfied by the subgraphs because:\n' +
                '- from subgraph "feed":\n' +
                '  - cannot find field "User.name".\n' +
                '  - cannot move to subgraph "users" using @key(fields: "id name") of "User", the key field(s) cannot be resolved from subgraph "feed".',
            ),
            extensions: expect.objectContaining({
              code: 'SATISFIABILITY_ERROR',
            }),
          }),
        ],
      }),
    );
  });

  test('works with @override', () => {
    assertCompositionSuccess(
      api.composeServices(
        [
          {
            name: 'foo',
            typeDefs: graphql`
              directive @override(from: String!) on FIELD_DEFINITION

              type Query {
                view: Queries!
              }

              type Queries {
                aaa: [String!]! @override(from: "bar")
                bbb: String! @override(from: "bar")
                ccc: String! @override(from: "bar")
                user: User! @override(from: "bar")
              }

              type User {
                id: ID! @override(from: "bar")
                name: String! @override(from: "bar")
              }
            `,
          },
          {
            name: 'bar',
            typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@shareable", "@inaccessible"])

            type Query @shareable {
              _internal: Boolean @inaccessible
              view: Queries!
            }

            type Queries @shareable {
              aaa: [String!]!
              bbb: String!
              ccc: String!
              ddd: String!
              eee: String!
              fff: String!
              user: User!
            }

            type User {
              id: ID!
              name: String!
            }
          `,
          },
          {
            name: 'baz',
            typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@inaccessible", "@shareable"])

            type Query {
              _bazInternal: Boolean @inaccessible
            }

            type Queries {
              _bazQueriesInternal: Boolean @inaccessible
            }
          `,
          },
          {
            name: 'qux',
            typeDefs: graphql`
              type Query {
                qux: String
              }
            `,
          },
          {
            name: 'quux',
            typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@inaccessible", "@shareable"])

            type Query {
              _quux: Boolean @inaccessible
              view: Queries! @shareable
            }

            type Queries {
              _quux: Boolean @inaccessible
              quux: String @shareable
            }
          `,
          },
        ],
        api.library === 'guild',
      ),
    );

    // {
    //   view {
    //     aaa
    //   }
    // }
    // cannot be satisfied by the subgraphs because:
    // - from subgraph "baz":
    //   - cannot find field "Queries.aaa".
    //   - cannot move to subgraph "bar", which has field "Queries.aaa", because type "Queries" has no @key defined in subgraph "bar".
    // - from subgraph "quux":
    //   - cannot find field "Queries.aaa".
    //   - cannot move to subgraph "bar", which has field "Queries.aaa", because type "Queries" has no @key defined in subgraph "bar".
    //
    // {
    //   view {
    //     bbb
    //   }
    // }
    // cannot be satisfied by the subgraphs because:
    // - from subgraph "baz":
    //   - cannot find field "Queries.bbb".
    //   - cannot move to subgraph "bar", which has field "Queries.bbb", because type "Queries" has no @key defined in subgraph "bar".
    // - from subgraph "quux":
    //   - cannot find field "Queries.bbb".
    //   - cannot move to subgraph "bar", which has field "Queries.bbb", because type "Queries" has no @key defined in subgraph "bar".
    //
    // {
    //   view {
    //     ccc
    //   }
    // }
    // cannot be satisfied by the subgraphs because:
    // - from subgraph "baz":
    //   - cannot find field "Queries.ccc".
    //   - cannot move to subgraph "bar", which has field "Queries.ccc", because type "Queries" has no @key defined in subgraph "bar".
    // - from subgraph "quux":
    //   - cannot find field "Queries.ccc".
    //   - cannot move to subgraph "bar", which has field "Queries.ccc", because type "Queries" has no @key defined in subgraph "bar".
    //
    // {
    //   view {
    //     user {
    //       ...
    //     }
    //   }
    // }
    // cannot be satisfied by the subgraphs because:
    // - from subgraph "baz":
    //   - cannot find field "Queries.user".
    //   - cannot move to subgraph "bar", which has field "Queries.user", because type "Queries" has no @key defined in subgraph "bar".
    // - from subgraph "quux":
    //   - cannot find field "Queries.user".
    //   - cannot move to subgraph "bar", which has field "Queries.user", because type "Queries" has no @key defined in subgraph "bar".

    expect(
      api.composeServices([
        {
          name: 'foo',
          typeDefs: graphql`
            directive @override(from: String!) on FIELD_DEFINITION

            type Query {
              view: Queries!
            }

            type Queries {
              aaa: [String!]! @override(from: "bar")
              bbb: String! @override(from: "bar")
              ccc: String! @override(from: "bar")
              user: User! @override(from: "bar")
            }

            type User {
              id: ID! @override(from: "bar")
              name: String! @override(from: "bar")
            }
          `,
        },
        {
          name: 'bar',
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@shareable", "@inaccessible"])

            type Query @shareable {
              _internal: Boolean @inaccessible
              view: Queries!
            }

            type Queries @shareable {
              aaa: [String!]!
              bbb: String!
              ccc: String!
              ddd: String!
              eee: String!
              fff: String!
              user: User!
            }

            type User {
              id: ID!
              name: String!
            }
          `,
        },
        {
          name: 'baz',
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@inaccessible", "@shareable"])

            type Query {
              _bazInternal: Boolean @inaccessible
            }

            type Queries {
              _bazQueriesInternal: Boolean @inaccessible
            }
          `,
        },
        {
          name: 'qux',
          typeDefs: graphql`
            type Query {
              qux: String
            }
          `,
        },
        {
          name: 'quux',
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@inaccessible", "@shareable"])
            
            type Query {
              _quux: Boolean @inaccessible
              view: Queries!
            }

            type Queries {
              _quux: Boolean @inaccessible
              quux: String @shareable
            }
          `,
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining(
              `Non-shareable field "Query.view" is resolved from multiple subgraphs: it is resolved from subgraphs "bar", "foo" and "quux" and defined as non-shareable in subgraph "quux"`,
            ),
            extensions: expect.objectContaining({
              code: 'INVALID_FIELD_SHARING',
            }),
          }),
        ]),
      }),
    );
  });

  test('insufficient key fields to move between graphs (completely different key fields)', () => {
    expect(
      api.composeServices([
        {
          name: 'users',
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key"])

            type Query {
              users: [User]
            }

            type User @key(fields: "id") {
              id: ID!
              name: String!
            }
          `,
        },
        {
          name: 'feed',
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key"])

            type Query {
              usersByIds(ids: [ID!]!): [User!]!
            }

            extend type User @key(fields: "email") {
              email: String
              comments: [String]
            }
          `,
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        errors: [
          expect.objectContaining({
            message: expect.stringContaining(
              'The following supergraph API query:\n' +
                '{\n' +
                '  users {\n' +
                '    email\n' +
                '  }\n' +
                '}\n' +
                'cannot be satisfied by the subgraphs because:\n' +
                '- from subgraph "users":\n' +
                '  - cannot find field "User.email".\n' +
                '  - cannot move to subgraph "feed" using @key(fields: "email") of "User", the key field(s) cannot be resolved from subgraph "users".',
            ),
            extensions: expect.objectContaining({
              code: 'SATISFIABILITY_ERROR',
            }),
          }),
          expect.objectContaining({
            message: expect.stringContaining(
              'The following supergraph API query:\n' +
                '{\n' +
                '  users {\n' +
                '    comments\n' +
                '  }\n' +
                '}\n' +
                'cannot be satisfied by the subgraphs because:\n' +
                '- from subgraph "users":\n' +
                '  - cannot find field "User.comments".\n' +
                '  - cannot move to subgraph "feed" using @key(fields: "email") of "User", the key field(s) cannot be resolved from subgraph "users".',
            ),
            extensions: expect.objectContaining({
              code: 'SATISFIABILITY_ERROR',
            }),
          }),
          expect.objectContaining({
            message: expect.stringContaining(
              'The following supergraph API query:\n' +
                '{\n' +
                '  usersByIds(ids: []) {\n' +
                '    id\n' +
                '  }\n' +
                '}\n' +
                'cannot be satisfied by the subgraphs because:\n' +
                '- from subgraph "feed":\n' +
                '  - cannot find field "User.id".\n' +
                '  - cannot move to subgraph "users" using @key(fields: "id") of "User", the key field(s) cannot be resolved from subgraph "feed".',
            ),
            extensions: expect.objectContaining({
              code: 'SATISFIABILITY_ERROR',
            }),
          }),
          expect.objectContaining({
            message: expect.stringContaining(
              'The following supergraph API query:\n' +
                '{\n' +
                '  usersByIds(ids: []) {\n' +
                '    name\n' +
                '  }\n' +
                '}\n' +
                'cannot be satisfied by the subgraphs because:\n' +
                '- from subgraph "feed":\n' +
                '  - cannot find field "User.name".\n' +
                '  - cannot move to subgraph "users" using @key(fields: "id") of "User", the key field(s) cannot be resolved from subgraph "feed".',
            ),
            extensions: expect.objectContaining({
              code: 'SATISFIABILITY_ERROR',
            }),
          }),
        ],
      }),
    );
  });

  test('cannot move as not shareable and no keys', () => {
    // Cannot resolve User.name from Query.usersByAge as User has no @key to move to subgraph "a"
    // Cannot resolve User.age from Query.users as User has no @key to move to subgraph "b"
    expect(
      api.composeServices([
        {
          name: 'a',
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key"])

            type User {
              name: String
            }

            type Query {
              users(filter: UsersFilter, role: Role): [User]
            }

            input UsersFilter {
              limit: Int!
              after: ID!
              user: UserFilter
            }

            input UserFilter {
              role: Role
            }

            enum Role {
              ADMIN
              USER
            }
          `,
        },
        {
          name: 'b',
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key"])

            extend type User {
              age: Int
            }

            type Query {
              """
              Note: age is nullable, but limit is not
              """
              usersByAge(age: Int, limit: Int!): [User]
            }
          `,
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        errors: [
          expect.objectContaining({
            message: expect.stringContaining(
              'The following supergraph API query:\n' +
                '{\n' +
                '  usersByAge(age: 0, limit: 0) {\n' +
                '    name\n' +
                '  }\n' +
                '}\n' +
                'cannot be satisfied by the subgraphs because:\n' +
                '- from subgraph "b":\n' +
                '  - cannot find field "User.name".\n' +
                '  - cannot move to subgraph "a", which has field "User.name", because type "User" has no @key defined in subgraph "a".',
            ),
            extensions: expect.objectContaining({
              code: 'SATISFIABILITY_ERROR',
            }),
          }),
          expect.objectContaining({
            message: expect.stringContaining(
              'The following supergraph API query:\n' +
                '{\n' +
                '  users(filter: {limit: 0, after: "<any id>"}, role: ADMIN) {\n' +
                '    age\n' +
                '  }\n' +
                '}\n' +
                'cannot be satisfied by the subgraphs because:\n' +
                '- from subgraph "a":\n' +
                '  - cannot find field "User.age".\n' +
                '  - cannot move to subgraph "b", which has field "User.age", because type "User" has no @key defined in subgraph "b".',
            ),
            extensions: expect.objectContaining({
              code: 'SATISFIABILITY_ERROR',
            }),
          }),
        ],
      }),
    );

    // Cannot resolve User.name from Query.usersByAge as User has no @key to move to subgraph "a"
    expect(
      api.composeServices([
        {
          name: 'a',
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key"])

            type User {
              name: String
            }
          `,
        },
        {
          name: 'b',
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key"])

            extend type User {
              age: Int
            }

            type Query {
              usersByAge(age: Int): [User]
            }
          `,
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        errors: [
          expect.objectContaining({
            message: expect.stringContaining(
              'The following supergraph API query:\n' +
                '{\n' +
                '  usersByAge(age: 0) {\n' +
                '    name\n' +
                '  }\n' +
                '}\n' +
                'cannot be satisfied by the subgraphs because:\n' +
                '- from subgraph "b":\n' +
                '  - cannot find field "User.name".\n' +
                '  - cannot move to subgraph "a", which has field "User.name", because type "User" has no @key defined in subgraph "a".',
            ),
            extensions: expect.objectContaining({
              code: 'SATISFIABILITY_ERROR',
            }),
          }),
        ],
      }),
    );
  });

  test('cannot move as not shareable and no keys (mutation and subscription)', () => {
    // Cannot resolve User.name from Query.usersByAge as User has no @key to move to subgraph "a"
    // Cannot resolve User.age from Query.users as User has no @key to move to subgraph "b"
    expect(
      api.composeServices([
        {
          name: 'a',
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key"])

            type User {
              name: String
            }

            type Query {
              users: [User]
            }
          `,
        },
        {
          name: 'b',
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key"])

            extend type User {
              age: Int
            }

            type Mutation {
              createRandomUser: User
            }

            type Subscription {
              onUserCreated: User
            }
          `,
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        errors: [
          // Why??????
          // Because Apollo does not throw an error for mutation if subscription is detected, LOL.
          api.library === 'guild'
            ? expect.objectContaining({
                message: expect.stringContaining(
                  'The following supergraph API query:\n' +
                    'mutation {\n' +
                    '  createRandomUser {\n' +
                    '    name\n' +
                    '  }\n' +
                    '}\n' +
                    'cannot be satisfied by the subgraphs because:\n' +
                    '- from subgraph "b":\n' +
                    '  - cannot find field "User.name".\n' +
                    '  - cannot move to subgraph "a", which has field "User.name", because type "User" has no @key defined in subgraph "a".',
                ),
                extensions: expect.objectContaining({
                  code: 'SATISFIABILITY_ERROR',
                }),
              })
            : null,
          expect.objectContaining({
            message: expect.stringContaining(
              'The following supergraph API query:\n' +
                'subscription {\n' +
                '  onUserCreated {\n' +
                '    name\n' +
                '  }\n' +
                '}\n' +
                'cannot be satisfied by the subgraphs because:\n' +
                '- from subgraph "b":\n' +
                '  - cannot find field "User.name".\n' +
                '  - cannot move to subgraph "a", which has field "User.name", because type "User" has no @key defined in subgraph "a".',
            ),
            extensions: expect.objectContaining({
              code: 'SATISFIABILITY_ERROR',
            }),
          }),
          expect.objectContaining({
            message: expect.stringContaining(
              'The following supergraph API query:\n' +
                '{\n' +
                '  users {\n' +
                '    age\n' +
                '  }\n' +
                '}\n' +
                'cannot be satisfied by the subgraphs because:\n' +
                '- from subgraph "a":\n' +
                '  - cannot find field "User.age".\n' +
                '  - cannot move to subgraph "b", which has field "User.age", because type "User" has no @key defined in subgraph "b".',
            ),
            extensions: expect.objectContaining({
              code: 'SATISFIABILITY_ERROR',
            }),
          }),
        ].filter(Boolean),
      }),
    );
  });

  test('unreachable from root', () => {
    // When User is not queryable (not referenced by a Query type and its dependencies, at any level)
    // it can be ignored by the SATISFIABILITY_ERROR check.
    assertCompositionSuccess(
      api.composeServices([
        {
          name: 'a',
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key"])

            type User {
              name: String
            }

            type Query {
              users: [String]
            }
          `,
        },
        {
          name: 'b',
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key"])

            extend type User {
              age: Int
            }

            type Query {
              usersByAge(age: Int): [String]
            }
          `,
        },
      ]),
    );
  });

  test('identical keys fields', () => {
    // User.{profile,email} can be resolved as Federation Gateway can move between subgraphs using identical @key
    assertCompositionSuccess(
      api.composeServices([
        {
          name: 'a',
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key", "@external"])

            extend type User @key(fields: "id") {
              id: ID @external
              email: String
            }

            type Query {
              usersById(ids: [ID!]!): [User!]!
            }
          `,
        },
        {
          name: 'b',
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key"])

            type User @key(fields: "id") {
              id: ID
              profile: String
            }

            type Query {
              users(ids: [ID!]!): [User!]!
            }
          `,
        },
      ]),
    );
  });

  test('unresolvable because of external (no idea...)', () => {
    expect(
      api.composeServices([
        {
          name: 'foo',
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key", "@inaccessible"])

            type Product @key(fields: "publicId fooCriteria") @key(fields: "key { code type } fooCriteria") {
              fooId: String! @inaccessible
              fooCriteria: String @inaccessible
              publicId: ID!
              key: Key
            }

            type Key {
              code: Int!
              type: ProductType!
            }

            enum ProductType {
              PUBLIC
              PRIVATE
            }

            type Query {
              productInFoo: Product
            }
        `,
        },
        {
          name: 'bar',
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key", "@external"])

            type Product @key(fields: "publicId fooCriteria") {
              publicId: ID! @external
              fooCriteria: String @external
            }

            type Query {
              productInBar: Product
            }
        `,
        },
        {
          name: 'baz',
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key"])

            type Product @key(fields: "publicId fooCriteria") {
              publicId: ID!
              fooCriteria: String
              available: Boolean!
            }

            type Query {
              productInBaz: Product
            }
          `,
        },
        {
          name: 'qux',
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key", "@inaccessible"])

            type Product @key(fields: "publicId fooCriteria") {
              publicId: ID!
              fooCriteria: String @inaccessible
            }

            type Query {
              productInQux: Product
            }
          `,
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        errors: [
          expect.objectContaining({
            // Query.productInBar (bar) can't resolve Product.publicId (foo, baz, qux)
            // because it's marked as @external
            message: expect.stringContaining(
              'The following supergraph API query:\n' +
                '{\n' +
                '  productInBar {\n' +
                '    publicId\n' +
                '  }\n' +
                '}\n' +
                'cannot be satisfied by the subgraphs because:\n' +
                '- from subgraph "bar":\n' +
                '  - field "Product.publicId" is not resolvable because marked @external.\n' +
                '  - cannot move to subgraph "baz" using @key(fields: "publicId fooCriteria") of "Product", the key field(s) cannot be resolved from subgraph "bar".\n' +
                '  - cannot move to subgraph "foo" using @key(fields: "publicId fooCriteria") of "Product", the key field(s) cannot be resolved from subgraph "bar".\n' +
                '  - cannot move to subgraph "foo" using @key(fields: "key { code type } fooCriteria") of "Product", the key field(s) cannot be resolved from subgraph "bar".\n' +
                '  - cannot move to subgraph "qux" using @key(fields: "publicId fooCriteria") of "Product", the key field(s) cannot be resolved from subgraph "bar".',
            ),
            extensions: expect.objectContaining({
              code: 'SATISFIABILITY_ERROR',
            }),
          }),
          // Query.productInBar (bar) can't resolve Product.available (baz)
          // Because:
          // - Product.available does not exist in subgraph "bar"
          // - can't move to other subgraphs that can resolve that field (foo, baz, qux)
          expect.objectContaining({
            message: expect.stringContaining(
              'The following supergraph API query:\n' +
                '{\n' +
                '  productInBar {\n' +
                '    available\n' +
                '  }\n' +
                '}\n' +
                'cannot be satisfied by the subgraphs because:\n' +
                '- from subgraph "bar":\n' +
                '  - cannot find field "Product.available".\n' +
                '  - cannot move to subgraph "baz" using @key(fields: "publicId fooCriteria") of "Product", the key field(s) cannot be resolved from subgraph "bar".\n' +
                '  - cannot move to subgraph "foo" using @key(fields: "publicId fooCriteria") of "Product", the key field(s) cannot be resolved from subgraph "bar".\n' +
                '  - cannot move to subgraph "foo" using @key(fields: "key { code type } fooCriteria") of "Product", the key field(s) cannot be resolved from subgraph "bar".\n' +
                '  - cannot move to subgraph "qux" using @key(fields: "publicId fooCriteria") of "Product", the key field(s) cannot be resolved from subgraph "bar".',
            ),
            extensions: expect.objectContaining({
              code: 'SATISFIABILITY_ERROR',
            }),
          }),
          // Query.productInBar (bar) can't resolve Product.key (foo)
          // Because:
          // - Product.available key not exist in subgraph "bar"
          // - can't move to other subgraphs that can possibly resolve Product (foo, baz, qux) - not only the ones that can resolve Product.key, Product in general
          expect.objectContaining({
            message: expect.stringContaining(
              'The following supergraph API query:\n' +
                '{\n' +
                '  productInBar {\n' +
                '    key {\n' +
                '      ...\n' +
                '    }\n' +
                '  }\n' +
                '}\n' +
                'cannot be satisfied by the subgraphs because:\n' +
                '- from subgraph "bar":\n' +
                '  - cannot find field "Product.key".\n' +
                '  - cannot move to subgraph "baz" using @key(fields: "publicId fooCriteria") of "Product", the key field(s) cannot be resolved from subgraph "bar".\n' +
                '  - cannot move to subgraph "foo" using @key(fields: "publicId fooCriteria") of "Product", the key field(s) cannot be resolved from subgraph "bar".\n' +
                '  - cannot move to subgraph "foo" using @key(fields: "key { code type } fooCriteria") of "Product", the key field(s) cannot be resolved from subgraph "bar".\n' +
                '  - cannot move to subgraph "qux" using @key(fields: "publicId fooCriteria") of "Product", the key field(s) cannot be resolved from subgraph "bar".',
            ),
            extensions: expect.objectContaining({
              code: 'SATISFIABILITY_ERROR',
            }),
          }),
        ],
      }),
    );

    expect(
      api.composeServices([
        {
          name: 'products',
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key", "@inaccessible"])

            type Product @key(fields: "id") @key(fields: "id policy") {
              internalId: String! @inaccessible
              id: ID!
              policy: String
            }

            type Query {
              productInFoo: Product
            }
        `,
        },
        {
          name: 'bar',
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key", "@external"])

            type Product @key(fields: "id policy") {
              id: ID! @external
              policy: String @external
            }

            type Query {
              productInBar: Product
            }
        `,
        },
        {
          name: 'env',
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key"])

            type Product @key(fields: "id") {
              id: ID!
              environmentallyFriendly: Boolean!
            }

            type Query {
              productInBaz: Product
            }
          `,
        },
        {
          name: 'prices',
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key", "@inaccessible"])

            type Product @key(fields: "id policy") {
              id: ID!
              policy: String @inaccessible
            }

            type Query {
              productInQux: Product
            }
          `,
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        errors: [
          expect.objectContaining({
            message: expect.stringContaining(
              'The following supergraph API query:\n' +
                '{\n' +
                '  productInBar {\n' +
                '    id\n' +
                '  }\n' +
                '}\n' +
                'cannot be satisfied by the subgraphs because:\n' +
                '- from subgraph "bar":\n' +
                '  - field "Product.id" is not resolvable because marked @external.\n' +
                '  - cannot move to subgraph "env" using @key(fields: "id") of "Product", the key field(s) cannot be resolved from subgraph "bar".\n' +
                '  - cannot move to subgraph "prices" using @key(fields: "id policy") of "Product", the key field(s) cannot be resolved from subgraph "bar".\n' +
                '  - cannot move to subgraph "products" using @key(fields: "id") of "Product", the key field(s) cannot be resolved from subgraph "bar".\n' +
                '  - cannot move to subgraph "products" using @key(fields: "id policy") of "Product", the key field(s) cannot be resolved from subgraph "bar".',
            ),
            extensions: expect.objectContaining({
              code: 'SATISFIABILITY_ERROR',
            }),
          }),
          expect.objectContaining({
            message: expect.stringContaining(
              'The following supergraph API query:\n' +
                '{\n' +
                '  productInBar {\n' +
                '    environmentallyFriendly\n' +
                '  }\n' +
                '}\n' +
                'cannot be satisfied by the subgraphs because:\n' +
                '- from subgraph "bar":\n' +
                '  - cannot find field "Product.environmentallyFriendly".\n' +
                '  - cannot move to subgraph "env" using @key(fields: "id") of "Product", the key field(s) cannot be resolved from subgraph "bar".\n' +
                '  - cannot move to subgraph "prices" using @key(fields: "id policy") of "Product", the key field(s) cannot be resolved from subgraph "bar".\n' +
                '  - cannot move to subgraph "products" using @key(fields: "id") of "Product", the key field(s) cannot be resolved from subgraph "bar".\n' +
                '  - cannot move to subgraph "products" using @key(fields: "id policy") of "Product", the key field(s) cannot be resolved from subgraph "bar".',
            ),
            extensions: expect.objectContaining({
              code: 'SATISFIABILITY_ERROR',
            }),
          }),
        ],
      }),
    );
  });

  test('external but somehow resolvable', () => {
    assertCompositionSuccess(
      api.composeServices([
        {
          name: 'products',
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key"])

            type Product @key(fields: "id category")  {
              id: ID!
              categoryDescription: String
              category: String
            }

            type Query {
              productInProducts: Product
            }
        `,
        },
        {
          name: 'bar',
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key", "@external"])

            type Product @key(fields: "id stockId") {
              id: ID!
              freeBar: Boolean!
              stockId: String
            }

            type Query {
              productInBar: Product
            }
        `,
        },
        {
          name: 'env',
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key"])

            type Product @key(fields: "id")  {
              id: ID!
              environmentallyFriendly: String!
            }

            type Query {
              productInEnv: Product
            }
          `,
        },
        {
          name: 'random',
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key", "@external"])

            extend type Product @key(fields: "id") {
              id: ID! @external
              randomThing: String
            }

            type Query {
              productInRandom: Product
            }

            `,
        },
        {
          name: 'prices',
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key", "@external"])

            extend type Product @key(fields: "id stockId")  {
              id: ID! @external
              stockId: String
              price: Float
            }

            type Query {
              productInPrices: Product
            }
            `,
        },
        {
          name: 'base',
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key", "@external"])

            type Product @key(fields: "id") @key(fields: "id stockId") @key(fields: "id category") {
              id: ID!
              stockId: String
              category: String
            }

            type Query {
              productInBase: Product
            }
            `,
        },
      ]),
    );
  });

  test('fed v1: same types but extra root field in a subgraph missing a field', () => {
    expect(
      api.composeServices([
        {
          name: 'a',
          typeDefs: graphql`
            type Query {
              userById(id: ID): User
              randomUser: User # this is not in subgraph "a"
            }

            type User {
              id: ID!
              name: String!
            }
          `,
        },
        {
          name: 'b',
          typeDefs: graphql`
            type Query {
              userById(id: ID): User
            }

            type User {
              id: ID!
              name: String!
              nickname: String # this is not in subgraph "a"
            }
          `,
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        errors: [
          expect.objectContaining({
            message: expect.stringContaining(
              'The following supergraph API query:\n' +
                '{\n' +
                '  randomUser {\n' +
                '    nickname\n' +
                '  }\n' +
                '}\n' +
                'cannot be satisfied by the subgraphs because:\n' +
                '- from subgraph "a":\n' +
                '  - cannot find field "User.nickname".\n' +
                '  - cannot move to subgraph "b", which has field "User.nickname", because type "User" has no @key defined in subgraph "b".',
            ),
            extensions: expect.objectContaining({
              code: 'SATISFIABILITY_ERROR',
            }),
          }),
        ],
      }),
    );
  });

  test('fed v1: same types but extra root field in a subgraph defining extra field', () => {
    assertCompositionSuccess(
      api.composeServices([
        {
          name: 'a',
          typeDefs: graphql`
            type Query {
              userById(id: ID): User
            }

            type User {
              id: ID!
              name: String!
              # missing nickname
            }
          `,
        },
        {
          name: 'b',
          typeDefs: graphql`
            type Query {
              userById(id: ID): User
              randomUser: User # this is not in subgraph "a"
            }

            type User {
              id: ID!
              name: String!
              nickname: String # this is not in subgraph "a"
            }
          `,
        },
        {
          name: 'c',
          typeDefs: graphql`
            type Query {
              userById(id: ID): User
              randomUser: User # this is not in subgraph "a"
            }

            type User {
              id: ID!
              name: String!
              # missing nickname
            }
          `,
        },
      ]),
    );
  });

  test('fed v1: same root fields, same types, additional fields', () => {
    assertCompositionSuccess(
      api.composeServices([
        {
          name: 'a',
          typeDefs: graphql`
            type Query {
              userById(id: ID): User
            }

            type Mutation {
              createUser(name: String!): User
            }

            type User {
              id: ID!
              name: String!
            }
          `,
        },
        {
          name: 'b',
          typeDefs: graphql`
            type Query {
              userById(id: ID): User
            }

            type User {
              id: ID!
              name: String!
              nickname: String # this is not in subgraph "a"
            }

            type Mutation {
              createUser(name: String!): User
            }
          `,
        },
      ]),
    );
  });

  test('moving between entity with @key and without it', () => {
    expect(
      api.composeServices([
        {
          name: 'a',
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key", "@external"])
            
            extend type User @key(fields: "id") {
              id: ID @external
              email: String
            }

            type Query {
              usersById(ids: [ID!]!): [User!]!
            }
          `,
        },
        {
          name: 'b',
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key"])
            
            type User {
              profile: String
            }

            union Account = User | Admin

            type Admin {
              id: ID
              photo: String
            }

            type Query {
              accounts(ids: [ID!]!): [Account!]!
            }
          `,
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        errors: [
          // User.id is indeed marked as @external all subgraphs (only our implementation shows that)
          api.library === 'guild'
            ? expect.objectContaining({
                message: expect.stringContaining(
                  'Field "User.id" is marked @external on all the subgraphs in which it is listed (subgraph "a")',
                ),
              })
            : null,
          expect.objectContaining({
            message: expect.stringContaining(
              'The following supergraph API query:\n' +
                '{\n' +
                '  accounts(ids: []) {\n' +
                '    ... on User {\n' +
                '      id\n' +
                '    }\n' +
                '  }\n' +
                '}\n' +
                'cannot be satisfied by the subgraphs because:\n' +
                '- from subgraph "b":\n' +
                '  - cannot find field "User.id".\n' +
                '  - cannot move to subgraph "a" using @key(fields: "id") of "User", the key field(s) cannot be resolved from subgraph "b".',
            ),
            extensions: expect.objectContaining({
              code: 'SATISFIABILITY_ERROR',
            }),
          }),
          expect.objectContaining({
            message: expect.stringContaining(
              'The following supergraph API query:\n' +
                '{\n' +
                '  accounts(ids: []) {\n' +
                '    ... on User {\n' +
                '      email\n' +
                '    }\n' +
                '  }\n' +
                '}\n' +
                'cannot be satisfied by the subgraphs because:\n' +
                '- from subgraph "b":\n' +
                '  - cannot find field "User.email".\n' +
                '  - cannot move to subgraph "a" using @key(fields: "id") of "User", the key field(s) cannot be resolved from subgraph "b".',
            ),
            extensions: expect.objectContaining({
              code: 'SATISFIABILITY_ERROR',
            }),
          }),
          expect.objectContaining({
            message: expect.stringContaining(
              'The following supergraph API query:\n' +
                '{\n' +
                '  usersById(ids: []) {\n' +
                '    profile\n' +
                '  }\n' +
                '}\n' +
                'cannot be satisfied by the subgraphs because:\n' +
                '- from subgraph "a":\n' +
                '  - cannot find field "User.profile".\n' +
                '  - cannot move to subgraph "b", which has field "User.profile", because type "User" has no @key defined in subgraph "b".',
            ),
            extensions: expect.objectContaining({
              code: 'SATISFIABILITY_ERROR',
            }),
          }),
        ].filter(Boolean),
      }),
    );
  });

  test('gateway can move from one graph to another through other subgraphs', () => {
    expect(
      api.composeServices([
        {
          name: 'foo',
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key"])

            type Product @key(fields: "id category")  {
              id: ID!
              categoryDescription: String
              category: String
            }

            type Query {
              productInFoo: Product
            }
        `,
        },
        {
          name: 'bar',
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key", "@external"])

            type Product @key(fields: "id stockId") {
              id: ID!
              freeBar: Boolean!
              stockId: String
            }

            type Query {
              productInBar: Product
            }
        `,
        },
        {
          name: 'baz',
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key"])

            type Product @key(fields: "id")  {
              id: ID!
              environmentFriendly: String!
            }

            type Query {
              productInBaz: Product
            }
          `,
        },
        {
          name: 'qux',
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key", "@external"])

            extend type Car @key(fields: "id") {
              id: ID! @external
              randomThing: String
            }

            type Query {
              carInQux: Car
            }

            `,
        },
        {
          name: 'quux',
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key", "@external"])

            extend type Car @key(fields: "id stockId")  {
              id: ID! @external
              stockId: String
              price: Float
            }

            type Query {
              carInQuux: Car
            }
            `,
        },
        {
          name: 'quuux',
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key", "@external"])

            type Car @key(fields: "id") @key(fields: "id stockId") @key(fields: "id category") {
              id: ID!
              stockId: String
              category: String
            }

            type Query {
              carInQuuux: Car
            }
            `,
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        errors: [
          [
            expect.objectContaining({
              message: expect.stringContaining(
                'The following supergraph API query:\n' +
                  '{\n' +
                  '  productInFoo {\n' +
                  '    freeBar\n' +
                  '  }\n' +
                  '}\n' +
                  'cannot be satisfied by the subgraphs because:\n' +
                  '- from subgraph "foo":\n' +
                  '  - cannot find field "Product.freeBar".\n' +
                  '  - cannot move to subgraph "bar" using @key(fields: "id stockId") of "Product", the key field(s) cannot be resolved from subgraph "foo".\n' +
                  '- from subgraph "baz":\n' +
                  '  - cannot find field "Product.freeBar".\n' +
                  '  - cannot move to subgraph "bar" using @key(fields: "id stockId") of "Product", the key field(s) cannot be resolved from subgraph "baz".',
              ),
              extensions: expect.objectContaining({
                code: 'SATISFIABILITY_ERROR',
              }),
            }),
            // Show as first (when it's apollo) and first (when it's guild)
            api.library === 'apollo' ? 1 : 4,
          ],
          [
            expect.objectContaining({
              message: expect.stringContaining(
                'The following supergraph API query:\n' +
                  '{\n' +
                  '  productInFoo {\n' +
                  '    stockId\n' +
                  '  }\n' +
                  '}\n' +
                  'cannot be satisfied by the subgraphs because:\n' +
                  '- from subgraph "foo":\n' +
                  '  - cannot find field "Product.stockId".\n' +
                  '  - cannot move to subgraph "bar" using @key(fields: "id stockId") of "Product", the key field(s) cannot be resolved from subgraph "foo".\n' +
                  '- from subgraph "baz":\n' +
                  '  - cannot find field "Product.stockId".\n' +
                  '  - cannot move to subgraph "bar" using @key(fields: "id stockId") of "Product", the key field(s) cannot be resolved from subgraph "baz".',
              ),
              extensions: expect.objectContaining({
                code: 'SATISFIABILITY_ERROR',
              }),
            }),
            api.library === 'apollo' ? 2 : 2,
          ],
          [
            expect.objectContaining({
              message: expect.stringContaining(
                'The following supergraph API query:\n' +
                  '{\n' +
                  '  productInBaz {\n' +
                  '    freeBar\n' +
                  '  }\n' +
                  '}\n' +
                  'cannot be satisfied by the subgraphs because:\n' +
                  '- from subgraph "baz":\n' +
                  '  - cannot find field "Product.freeBar".\n' +
                  '  - cannot move to subgraph "bar" using @key(fields: "id stockId") of "Product", the key field(s) cannot be resolved from subgraph "baz".\n' +
                  '  - cannot move to subgraph "foo" using @key(fields: "id category") of "Product", the key field(s) cannot be resolved from subgraph "baz".',
              ),
              extensions: expect.objectContaining({
                code: 'SATISFIABILITY_ERROR',
              }),
            }),
            api.library === 'apollo' ? 3 : 3,
          ],
          [
            expect.objectContaining({
              message: expect.stringContaining(
                'The following supergraph API query:\n' +
                  '{\n' +
                  '  productInBaz {\n' +
                  '    stockId\n' +
                  '  }\n' +
                  '}\n' +
                  'cannot be satisfied by the subgraphs because:\n' +
                  '- from subgraph "baz":\n' +
                  '  - cannot find field "Product.stockId".\n' +
                  '  - cannot move to subgraph "bar" using @key(fields: "id stockId") of "Product", the key field(s) cannot be resolved from subgraph "baz".\n' +
                  '  - cannot move to subgraph "foo" using @key(fields: "id category") of "Product", the key field(s) cannot be resolved from subgraph "baz".',
              ),
              extensions: expect.objectContaining({
                code: 'SATISFIABILITY_ERROR',
              }),
            }),
            api.library === 'apollo' ? 4 : 1,
          ],
          [
            expect.objectContaining({
              message: expect.stringContaining(
                'The following supergraph API query:\n' +
                  '{\n' +
                  '  productInBaz {\n' +
                  '    categoryDescription\n' +
                  '  }\n' +
                  '}\n' +
                  'cannot be satisfied by the subgraphs because:\n' +
                  '- from subgraph "baz":\n' +
                  '  - cannot find field "Product.categoryDescription".\n' +
                  '  - cannot move to subgraph "bar" using @key(fields: "id stockId") of "Product", the key field(s) cannot be resolved from subgraph "baz".\n' +
                  '  - cannot move to subgraph "foo" using @key(fields: "id category") of "Product", the key field(s) cannot be resolved from subgraph "baz".',
              ),
              extensions: expect.objectContaining({
                code: 'SATISFIABILITY_ERROR',
              }),
            }),
            api.library === 'apollo' ? 5 : 8,
          ],
          [
            expect.objectContaining({
              message: expect.stringContaining(
                'The following supergraph API query:\n' +
                  '{\n' +
                  '  productInBaz {\n' +
                  '    category\n' +
                  '  }\n' +
                  '}\n' +
                  'cannot be satisfied by the subgraphs because:\n' +
                  '- from subgraph "baz":\n' +
                  '  - cannot find field "Product.category".\n' +
                  '  - cannot move to subgraph "bar" using @key(fields: "id stockId") of "Product", the key field(s) cannot be resolved from subgraph "baz".\n' +
                  '  - cannot move to subgraph "foo" using @key(fields: "id category") of "Product", the key field(s) cannot be resolved from subgraph "baz".',
              ),
              extensions: expect.objectContaining({
                code: 'SATISFIABILITY_ERROR',
              }),
            }),
            api.library === 'apollo' ? 6 : 6,
          ],
          [
            expect.objectContaining({
              message: expect.stringContaining(
                'The following supergraph API query:\n' +
                  '{\n' +
                  '  productInBar {\n' +
                  '    categoryDescription\n' +
                  '  }\n' +
                  '}\n' +
                  'cannot be satisfied by the subgraphs because:\n' +
                  '- from subgraph "bar":\n' +
                  '  - cannot find field "Product.categoryDescription".\n' +
                  '  - cannot move to subgraph "foo" using @key(fields: "id category") of "Product", the key field(s) cannot be resolved from subgraph "bar".\n' +
                  '- from subgraph "baz":\n' +
                  '  - cannot find field "Product.categoryDescription".\n' +
                  '  - cannot move to subgraph "foo" using @key(fields: "id category") of "Product", the key field(s) cannot be resolved from subgraph "baz".',
              ),
              extensions: expect.objectContaining({
                code: 'SATISFIABILITY_ERROR',
              }),
            }),
            api.library === 'apollo' ? 7 : 7,
          ],
          [
            expect.objectContaining({
              message: expect.stringContaining(
                'The following supergraph API query:\n' +
                  '{\n' +
                  '  productInBar {\n' +
                  '    category\n' +
                  '  }\n' +
                  '}\n' +
                  'cannot be satisfied by the subgraphs because:\n' +
                  '- from subgraph "bar":\n' +
                  '  - cannot find field "Product.category".\n' +
                  '  - cannot move to subgraph "foo" using @key(fields: "id category") of "Product", the key field(s) cannot be resolved from subgraph "bar".\n' +
                  '- from subgraph "baz":\n' +
                  '  - cannot find field "Product.category".\n' +
                  '  - cannot move to subgraph "foo" using @key(fields: "id category") of "Product", the key field(s) cannot be resolved from subgraph "baz".',
              ),
              extensions: expect.objectContaining({
                code: 'SATISFIABILITY_ERROR',
              }),
            }),
            api.library === 'apollo' ? 8 : 5,
          ],
        ]
          // Apollo returns errors in a different order
          .sort((a, b) => a[1] - b[1])
          .map(([error]) => error),
      }),
    );
  });
});
