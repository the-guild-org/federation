import { parse, print } from 'graphql';
import { describe, expect, test } from 'vitest';
import { sortSDL } from '../src/graphql/sort-sdl.js';
import { sdl as joinSDL } from '../src/specifications/join.js';
import { sdl as linkSDL } from '../src/specifications/link.js';
import { directive as tagDirective } from '../src/specifications/tag.js';
import {
  assertCompositionFailure,
  assertCompositionSuccess,
  satisfiesVersionRange,
  testImplementations,
  versions,
} from './shared/testkit.js';

expect.addSnapshotSerializer({
  serialize: value => print(sortSDL(parse(value as string))),
  test: value => typeof value === 'string' && value.includes('specs.apollo.dev'),
});

testImplementations(api => {
  const library = api.library;
  const composeServices = api.composeServices;

  function logSupergraph(result: { supergraphSdl: string }) {
    console.log('--', library, '--');
    console.log(result.supergraphSdl);
  }

  test('duplicated Query fields', () => {
    const result = composeServices([
      {
        name: 'a',
        typeDefs: parse(/* GraphQL */ `
          extend schema @link(url: "https://specs.apollo.dev/federation/v2.3", import: ["@key"])

          type User @key(fields: "id") {
            id: ID!
            name: String
          }

          type Query {
            userById(id: ID!): User
          }
        `),
      },
      {
        name: 'b',
        typeDefs: parse(/* GraphQL */ `
          extend schema @link(url: "https://specs.apollo.dev/federation/v2.3", import: ["@key"])

          type User @key(fields: "id") {
            id: ID!
            name: String
          }

          type Query {
            userById(id: ID!): User
          }
        `),
      },
    ]);

    assertCompositionFailure(result);
  });

  describe.each(versions)('%s', version => {
    describe('shareable', () => {
      test('merge two exact same types', () => {
        const result = composeServices([
          {
            name: 'a',
            typeDefs: parse(/* GraphQL */ `
              extend schema
                @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

              type User @shareable {
                name: String
              }

              type Query {
                user: User
              }
            `),
          },
          {
            name: 'b',
            typeDefs: parse(/* GraphQL */ `
              extend schema
                @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

              type User @shareable {
                name: String
              }
            `),
          },
        ]);

        assertCompositionSuccess(result);

        expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
          type User @join__type(graph: A) @join__type(graph: B) {
            name: String
          }
        `);
      });

      test('merge same type with same fields by of different return types (nullable vs non-nullable)', () => {
        const result = composeServices([
          {
            name: 'a',
            typeDefs: parse(/* GraphQL */ `
              extend schema
                @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

              type User @shareable {
                name: String
              }

              type Query {
                user: User
              }
            `),
          },
          {
            name: 'b',
            typeDefs: parse(/* GraphQL */ `
              extend schema
                @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

              type User @shareable {
                name: String!
              }
            `),
          },
        ]);

        assertCompositionSuccess(result);

        expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
          type User @join__type(graph: A) @join__type(graph: B) {
            name: String
              @join__field(graph: B, type: "String!")
              @join__field(graph: A, type: "String")
          }
        `);
      });

      test('merge same types but one has an extension', () => {
        const result = composeServices([
          {
            name: 'a',
            typeDefs: parse(/* GraphQL */ `
              extend schema
                @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

              type User @shareable {
                name: String
              }
            `),
          },
          {
            name: 'b',
            typeDefs: parse(/* GraphQL */ `
              extend schema
                @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

              type User @shareable {
                name: String
              }

              extend type User {
                email: String! @shareable
              }

              type Query {
                user: User
              }
            `),
          },
        ]);

        assertCompositionSuccess(result);

        expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
          type User @join__type(graph: A) @join__type(graph: B) {
            name: String
            email: String! @join__field(graph: B)
          }
        `);
      });

      test('merge same types but one has an extra field', () => {
        const result = composeServices([
          {
            name: 'a',
            typeDefs: parse(/* GraphQL */ `
              extend schema
                @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

              type Food @shareable {
                name: String!
                price: Int!
              }
            `),
          },
          {
            name: 'b',
            typeDefs: parse(/* GraphQL */ `
              extend schema
                @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

              type Food @shareable {
                name: String!
                price: Int!
                inStock: Boolean! # Not in A
              }

              type Query {
                food: Food
              }
            `),
          },
        ]);

        assertCompositionSuccess(result);

        expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
          type Food @join__type(graph: A) @join__type(graph: B) {
            name: String!
            inStock: Boolean! @join__field(graph: B)
            price: Int!
          }
        `);
      });

      test('merge extension and definition of object type and print extension:true', () => {
        const result = composeServices([
          {
            name: 'a',
            typeDefs: parse(/* GraphQL */ `
                extend schema
                  @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key", "@shareable"])
    
                type User @key(fields: "id") @shareable {
                  id: ID!
                  name: String
                }

                type Query {
                  user: User @shareable
                }
              `),
          },
          {
            name: 'b',
            typeDefs: parse(/* GraphQL */ `
                extend schema
                  @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key", "@shareable"])
    
                type User @key(fields: "id") @shareable {
                  id: ID!
                  name: String
                }
    
                extend type User {
                  email: String! @shareable
                }
    
                type Query {
                  user: User @shareable
                }
              `),
          },
        ]);

        assertCompositionSuccess(result);

        expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
          type User @join__type(graph: A, key: "id") @join__type(graph: B, key: "id") {
            email: String! @join__field(graph: B)
            id: ID!
            name: String
          }
        `);
      });

      test('merge same types but one has an extra field (inaccessible)', () => {
        const result = composeServices([
          {
            name: 'a',
            typeDefs: parse(/* GraphQL */ `
              extend schema
                @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

              type Food @shareable {
                name: String!
                price: Int!
              }
            `),
          },
          {
            name: 'b',
            typeDefs: parse(/* GraphQL */ `
              extend schema
                @link(
                  url: "https://specs.apollo.dev/federation/${version}"
                  import: ["@shareable", "@inaccessible"]
                )

              type Food @shareable {
                name: String!
                price: Int!
                inStock: Boolean! @inaccessible
              }

              type Query {
                food: Food
              }
            `),
          },
        ]);

        assertCompositionSuccess(result);

        expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
          type Food @join__type(graph: A) @join__type(graph: B) {
            name: String!
            price: Int!
            inStock: Boolean! @inaccessible @join__field(graph: B)
          }
        `);
      });

      test('type annotated with @inaccessible should not result in @inaccessible on its fields', () => {
        const result = composeServices([
          {
            name: 'a',
            typeDefs: parse(/* GraphQL */ `
              extend schema
                @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@inaccessible"])

              type Food @inaccessible {
                name: String!
                price: Int!
              }

              type Drink @inaccessible {
                name: String!
                price: Int! @inaccessible
              }

              type Query {
                words: [String!]!
              }
            `),
          },
        ]);

        assertCompositionSuccess(result);

        expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
          type Food @join__type(graph: A) @inaccessible {
            name: String!
            price: Int!
          }
        `);
        expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
          type Drink @join__type(graph: A) @inaccessible {
            name: String!
            price: Int! @inaccessible
          }
        `);
      });

      test('merge an argument (nullable vs missing)', () => {
        const result = composeServices([
          {
            name: 'a',
            typeDefs: parse(/* GraphQL */ `
              extend schema
                @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

              type Building @shareable {
                # Argument is optional
                height(units: String): Int!
              }

              type Query {
                building: Building
              }
            `),
          },
          {
            name: 'b',
            typeDefs: parse(/* GraphQL */ `
              extend schema
                @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

              type Building @shareable {
                # Argument is missing
                height: Int!
              }
            `),
          },
        ]);

        assertCompositionSuccess(result);

        expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
          type Building @join__type(graph: B) @join__type(graph: A) {
            height: Int!
          }
        `);
      });

      test('merge an argument (non-nullable vs missing)', () => {
        const result = composeServices([
          {
            name: 'a',
            typeDefs: parse(/* GraphQL */ `
              extend schema
                @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

              type Building @shareable {
                # Argument is required
                height(units: String!): Int!
              }

              type Query {
                building: Building
              }
            `),
          },
          {
            name: 'b',
            typeDefs: parse(/* GraphQL */ `
              extend schema
                @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

              type Building @shareable {
                # Argument is missing
                height: Int!
              }
            `),
          },
        ]);

        assertCompositionFailure(result);
      });

      test('merge an argument (nullable vs non-nullable)', () => {
        const result = composeServices([
          {
            name: 'a',
            typeDefs: parse(/* GraphQL */ `
              extend schema
                @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

              type Building @shareable {
                # Argument is required
                height(units: String!): Int!
              }

              type Query {
                building: Building
              }
            `),
          },
          {
            name: 'b',
            typeDefs: parse(/* GraphQL */ `
              extend schema
                @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

              type Building @shareable {
                # Argument can be optional
                height(units: String): Int!
              }
            `),
          },
        ]);

        assertCompositionSuccess(result);

        expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
          type Building @join__type(graph: A) @join__type(graph: B) {
            height(units: String!): Int!
          }
        `);
      });
    });

    test('merge object types with different fields', () => {
      const result = composeServices([
        {
          name: 'a',
          typeDefs: parse(/* GraphQL */ `
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

            type User @key(fields: "id") {
              id: ID!
              name: String!
              email: String!
            }
          `),
        },
        {
          name: 'b',
          typeDefs: parse(/* GraphQL */ `
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

            type User @key(fields: "id") {
              id: ID!
              age: Int!
            }

            type Query {
              user: User
            }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type User @join__type(graph: B, key: "id") @join__type(graph: A, key: "id") {
          id: ID!
          email: String! @join__field(graph: A)
          name: String! @join__field(graph: A)
          age: Int! @join__field(graph: B)
        }
      `);
    });

    test('merge object extension type and non-resolvable object type', () => {
      const result = composeServices([
        {
          name: 'a',
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key", "@external"])

              extend type User @key(fields: "id") {
                id: ID @external
              }

              type Query {
                user: User
              }
          `),
        },
        {
          name: 'b',
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

            type User @key(fields: "id") {
              id: ID!
            }

            type Query {
              users: [User]
            }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type User
          @join__type(graph: A, key: "id", extension: true)
          @join__type(graph: B, key: "id") {
          id: ID @join__field(graph: A, type: "ID") @join__field(graph: B, type: "ID!")
        }
      `);
    });

    test('Fed v1: merge object extension type and non-resolvable object type', () => {
      const result = composeServices([
        {
          name: 'a',
          typeDefs: parse(/* GraphQL */ `
            extend type User @key(fields: "id") {
              id: ID @external
            }

            type Query {
              user: User
            }
          `),
        },
        {
          name: 'b',
          typeDefs: parse(/* GraphQL */ `
            type User @key(fields: "id") {
              id: ID!
            }

            type Query {
              users: [User]
            }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type User @join__type(graph: A, key: "id") @join__type(graph: B, key: "id") {
          id: ID @join__field(graph: A, type: "ID") @join__field(graph: B, type: "ID!")
        }
      `);
    });

    test('merge interface types with different fields', () => {
      const result = composeServices([
        {
          name: 'a',
          typeDefs: parse(/* GraphQL */ `
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

            type User @key(fields: "id") {
              id: ID!
              name: String!
              email: String!
            }

            interface Details {
              name: ID!
            }
          `),
        },
        {
          name: 'b',
          typeDefs: parse(/* GraphQL */ `
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

            type User @key(fields: "id") {
              id: ID!
              age: Int!
            }

            interface Details {
              email: String
            }

            type Query {
              user: User
            }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        interface Details @join__type(graph: A) @join__type(graph: B) {
          name: ID! @join__field(graph: A)
          email: String @join__field(graph: B)
        }
      `);
    });

    test('merge union types with different members (some are overlapping)', () => {
      const result = composeServices([
        {
          name: 'a',
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key", "@shareable"])

            type User @key(fields: "id") {
              id: ID!
              name: String!
              email: String!
            }

            union Media = Book

            type Book @shareable {
              title: String!
            }
          `),
        },
        {
          name: 'b',
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key", "@shareable"])

            type User @key(fields: "id") {
              id: ID!
              age: Int!
            }

            union Media = Movie | Book

            type Movie {
              title: String!
            }

            type Book @shareable {
              title: String!
            }

            type Query {
              user: User
            }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        union Media
          @join__type(graph: A)
          @join__type(graph: B)
          @join__unionMember(graph: A, member: "Book")
          @join__unionMember(graph: B, member: "Movie")
          @join__unionMember(graph: B, member: "Book") =
            Movie
          | Book
      `);
    });

    test('merge union types with different members', () => {
      const result = composeServices([
        {
          name: 'a',
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key", "@shareable"])

            type User @key(fields: "id") {
              id: ID!
              name: String!
              email: String!
            }

            union Media = Book

            type Book @shareable {
              title: String!
            }
          `),
        },
        {
          name: 'b',
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key", "@shareable"])

            type User @key(fields: "id") {
              id: ID!
              age: Int!
            }

            union Media = Movie

            type Movie {
              title: String!
            }

            type Query {
              user: User
            }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        union Media
          @join__type(graph: A)
          @join__type(graph: B)
          @join__unionMember(graph: A, member: "Book")
          @join__unionMember(graph: B, member: "Movie") =
            Book
          | Movie
      `);
    });

    test('merge input types and field arguments', () => {
      const result = composeServices([
        {
          name: 'a',
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

            input UserInput {
              name: String
              age: Int
            }

            type Library @shareable {
              book(title: String, author: String): String
            }
          `),
        },
        {
          name: 'b',
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

            input UserInput {
              name: String!
              email: String
            }

            type Library @shareable {
              book(title: String, section: String): String
            }

            type Query {
              library: Library
            }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type Library @join__type(graph: A) @join__type(graph: B) {
          book(title: String): String
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        input UserInput @join__type(graph: A) @join__type(graph: B) {
          name: String!
            @join__field(graph: A, type: "String")
            @join__field(graph: B, type: "String!")
        }
      `);
    });

    test('print default values', () => {
      const result = composeServices([
        {
          name: 'a',
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

            input LibraryFilter {
              limit: Int = 5
            }

            enum LibraryAccess {
              PUBLIC
              PRIVATE
            }

            type Query {
              books(filter: LibraryFilter, access: LibraryAccess = PUBLIC): [String!]!
            }
          `),
        },
        {
          name: 'b',
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

            input UserFilter {
              limit: Int = 10
            }

            enum UserAccess {
              PUBLIC
              PRIVATE
            }

            type Query {
              users(filter: UserFilter, access: UserAccess = PRIVATE): [String!]!
            }
          `),
        },
        {
          name: 'c',
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

            input MediaFilter {
              limit: Int = 15
            }

            enum MediaAccess {
              PUBLIC
              PRIVATE
            }

            interface Media {
              records(filter: MediaFilter, access: MediaAccess = PRIVATE): [String!]!
            }

            type Movie implements Media {
              records(filter: MediaFilter, access: MediaAccess = PUBLIC): [String!]!
            }

            type Query {
              media(filter: MediaFilter, access: MediaAccess = PRIVATE): [Media!]!
            }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        input LibraryFilter @join__type(graph: A) {
          limit: Int = 5
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        input UserFilter @join__type(graph: B) {
          limit: Int = 10
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        input MediaFilter @join__type(graph: C) {
          limit: Int = 15
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        interface Media @join__type(graph: C) {
          records(filter: MediaFilter, access: MediaAccess = PRIVATE): [String!]!
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type Movie implements Media
          @join__implements(graph: C, interface: "Media")
          @join__type(graph: C) {
          records(filter: MediaFilter, access: MediaAccess = PUBLIC): [String!]!
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type Query @join__type(graph: A) @join__type(graph: B) @join__type(graph: C) {
          books(filter: LibraryFilter, access: LibraryAccess = PUBLIC): [String!]!
            @join__field(graph: A)
          users(filter: UserFilter, access: UserAccess = PRIVATE): [String!]! @join__field(graph: B)
          media(filter: MediaFilter, access: MediaAccess = PRIVATE): [Media!]!
            @join__field(graph: C)
        }
      `);
    });

    test('merge enum type types when used as the return type for at least one object or interface field', () => {
      const result = composeServices([
        {
          name: 'a',
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

            type User @shareable {
              name: String!
              type: UserType
            }

            enum UserType {
              ADMIN
            }
          `),
        },
        {
          name: 'b',
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

            type User @shareable {
              name: String!
              type: UserType
            }

            enum UserType {
              REGULAR
            }

            type Query {
              users: [User]
            }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        enum UserType @join__type(graph: B) @join__type(graph: A) {
          REGULAR @join__enumValue(graph: B)
          ADMIN @join__enumValue(graph: A)
        }
      `);
    });

    test('merge enum type types when used as the type for at least one field argument or input type field', () => {
      const result = composeServices([
        {
          name: 'a',
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

            type User @shareable {
              name: String!
            }

            enum UserType {
              ADMIN
              REGULAR
            }
          `),
        },
        {
          name: 'b',
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

            type User @shareable {
              name: String!
            }

            enum UserType {
              REGULAR
              ANONYMOUS
            }

            type Query {
              users(type: UserType): [User]
            }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        enum UserType @join__type(graph: A) @join__type(graph: B) {
          REGULAR @join__enumValue(graph: A) @join__enumValue(graph: B)
        }
      `);
    });

    test('merge enum type types when used as the type for at least one field argument or input type field and as the return type for at least one object or interface field', () => {
      const result = composeServices([
        {
          name: 'a',
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

            type User @shareable {
              name: String!
              type: UserType
            }

            enum UserType {
              ADMIN
              REGULAR
            }
          `),
        },
        {
          name: 'b',
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

            type User @shareable {
              name: String!
              type: UserType
            }

            enum UserType {
              REGULAR
              ADMIN
            }

            type Query {
              users(type: UserType): [User]
            }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        enum UserType @join__type(graph: A) @join__type(graph: B) {
          ADMIN @join__enumValue(graph: A) @join__enumValue(graph: B)
          REGULAR @join__enumValue(graph: A) @join__enumValue(graph: B)
        }
      `);
    });

    test('ignore directive if not defined by @composeDirective', () => {
      const result = composeServices([
        {
          name: 'a',
          typeDefs: parse(/* GraphQL */ `
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

            directive @lowercase on FIELD_DEFINITION

            type User @shareable {
              name: String! @lowercase
            }

            type Query {
              users: [User]
            }
          `),
        },
        {
          name: 'b',
          typeDefs: parse(/* GraphQL */ `
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

            directive @uppercase on FIELD_DEFINITION

            type Review @shareable {
              name: String! @uppercase
            }

            type Query {
              reviews: [Review]
            }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).not.toMatch('lowercase');
      expect(result.supergraphSdl).not.toMatch('uppercase');
    });

    test('ignore directive if identically defined in all subgraphs', () => {
      const result = composeServices([
        {
          name: 'a',
          typeDefs: parse(/* GraphQL */ `
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

            directive @lowercase on FIELD_DEFINITION

            type User @shareable {
              name: String! @lowercase
            }
          `),
        },
        {
          name: 'b',
          typeDefs: parse(/* GraphQL */ `
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

            directive @lowercase on FIELD_DEFINITION

            type Review @shareable {
              name: String! @lowercase
            }

            type Query {
              reviews: [Review]
            }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).not.toMatch('lowercase');
    });

    test('ignore directive if not defined in all subgraphs', () => {
      const result = composeServices([
        {
          name: 'a',
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

            directive @lowercase on FIELD_DEFINITION

            type User @shareable {
              name: String! @lowercase
            }
          `),
        },
        {
          name: 'b',
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

            type User @shareable {
              name: String!
            }

            type Query {
              users: [User]
            }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).not.toMatch('lowercase');
    });

    test('ignore directive if defined differently across subgraphs', () => {
      const result = composeServices([
        {
          name: 'a',
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

            directive @lowercase on FIELD_DEFINITION

            type User @shareable {
              name: String! @lowercase
            }
          `),
        },
        {
          name: 'b',
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

            directive @lowercase on OBJECT

            type User @shareable @lowercase {
              name: String!
            }

            type Query {
              users: [User]
            }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).not.toMatch('lowercase');
    });

    test('ignore directive if it has different locations across subgraphs', () => {
      const result = composeServices([
        {
          name: 'a',
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

            directive @lowercase on FIELD_DEFINITION

            type User @shareable {
              name: String! @lowercase
            }
          `),
        },
        {
          name: 'b',
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

            directive @lowercase on OBJECT | FIELD_DEFINITION

            type User @shareable @lowercase {
              name: String!
            }

            type Query {
              users: [User]
            }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).not.toMatch('lowercase');
    });

    test('support @composeDirective when using multiple schema extensions', () => {
      const result = composeServices([
        {
          name: 'a',
          typeDefs: parse(/* GraphQL */ `
              extend schema
                @link(
                  url: "https://specs.apollo.dev/federation/${version}"
                  import: ["@key", "@composeDirective"]
                )
              extend schema
                @link(url: "https://myspecs.dev/lowercase/v1.0", import: ["@lowercase"])
              extend schema
                @composeDirective(name: "@lowercase")

              directive @lowercase on FIELD_DEFINITION

              type User @key(fields: "id") {
                id: ID!
                name: String! @lowercase
              }

              type Query {
                users: [User]
              }
            `),
        },
        {
          name: 'b',
          typeDefs: parse(/* GraphQL */ `
              extend schema
                @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

              type Review @key(fields: "id") {
                id: ID!
                name: String!
              }

              extend type User @key(fields: "id") {
                id: ID!
                reviews: [Review]
              }

              type Query {
                review: [Review]
              }
            `),
        },
      ]);

      if (version === 'v2.0') {
        assertCompositionFailure(result);
        return;
      }

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        directive @lowercase on FIELD_DEFINITION
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type User
          @join__type(graph: A, key: "id")
          @join__type(graph: B, key: "id", extension: true) {
          id: ID!
          name: String! @lowercase @join__field(graph: A)
          reviews: [Review] @join__field(graph: B)
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        schema
          @link(url: "https://specs.apollo.dev/link/v1.0")
          @link(url: "https://specs.apollo.dev/join/v0.3", for: EXECUTION)
          @link(url: "https://myspecs.dev/lowercase/v1.0", import: ["@lowercase"]) {
          query: Query
        }
      `);
    });

    test('preserve directive if not defined in all subgraphs but included in @composeDirective', () => {
      const result = composeServices([
        {
          name: 'a',
          typeDefs: parse(/* GraphQL */ `
              extend schema
                @link(
                  url: "https://specs.apollo.dev/federation/${version}"
                  import: ["@key", "@composeDirective"]
                )
                @link(url: "https://myspecs.dev/lowercase/v1.0", import: ["@lowercase"])
                @composeDirective(name: "@lowercase")

              directive @lowercase on FIELD_DEFINITION

              type User @key(fields: "id") {
                id: ID!
                name: String! @lowercase
              }

              type Query {
                users: [User]
              }
            `),
        },
        {
          name: 'b',
          typeDefs: parse(/* GraphQL */ `
              extend schema
                @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

              type Review @key(fields: "id") {
                id: ID!
                name: String!
              }

              extend type User @key(fields: "id") {
                id: ID!
                reviews: [Review]
              }

              type Query {
                review: [Review]
              }
            `),
        },
      ]);

      if (version === 'v2.0') {
        assertCompositionFailure(result);
        return;
      }

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        directive @lowercase on FIELD_DEFINITION
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type User
          @join__type(graph: A, key: "id")
          @join__type(graph: B, key: "id", extension: true) {
          id: ID!
          name: String! @lowercase @join__field(graph: A)
          reviews: [Review] @join__field(graph: B)
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        schema
          @link(url: "https://specs.apollo.dev/link/v1.0")
          @link(url: "https://specs.apollo.dev/join/v0.3", for: EXECUTION)
          @link(url: "https://myspecs.dev/lowercase/v1.0", import: ["@lowercase"]) {
          query: Query
        }
      `);
    });

    test('ignore directive if defined identically in all subgraphs and not included in @composeDirective', () => {
      const result = composeServices([
        {
          name: 'a',
          typeDefs: parse(/* GraphQL */ `
              extend schema
                @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key"])

              directive @lowercase on FIELD_DEFINITION

              type User @key(fields: "id") {
                id: ID!
                name: String! @lowercase
              }

              type Query {
                users: [User]
              }
            `),
        },
        {
          name: 'b',
          typeDefs: parse(/* GraphQL */ `
              extend schema
                @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key"])

              directive @lowercase on FIELD_DEFINITION

              type Comment @key(fields: "id") {
                id: ID!
                name: String! @lowercase
              }

              type Query {
                comments: [Comment]
              }
            `),
        },
      ]);

      assertCompositionSuccess(result);
      expect(result.supergraphSdl).not.toMatch(/lowercase/);
    });

    test('preserve directive from one subgraph if defined differently across subgraphs but one included in @composeDirective', () => {
      const result = composeServices([
        {
          name: 'a',
          typeDefs: parse(/* GraphQL */ `
              extend schema
                @link(
                  url: "https://specs.apollo.dev/federation/${version}"
                  import: ["@key", "@composeDirective"]
                )
                @link(url: "https://myspecs.dev/lowercase/v1.0", import: ["@lowercase"])
                @composeDirective(name: "@lowercase")

              directive @lowercase on FIELD_DEFINITION

              type User @key(fields: "id") {
                id: ID!
                name: String! @lowercase
              }

              type Query {
                users: [User]
              }
            `),
        },
        {
          name: 'b',
          typeDefs: parse(/* GraphQL */ `
              extend schema
                @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

              directive @lowercase on OBJECT

              extend type User @key(fields: "id") @lowercase {
                id: ID!
                comments: [Comment]
              }

              type Comment @lowercase {
                id: ID!
                text: String!
              }

              type Query {
                comments: [Comment]
              }
            `),
        },
      ]);

      if (version === 'v2.0') {
        assertCompositionFailure(result);
        return;
      }

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        directive @lowercase on FIELD_DEFINITION
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type User
          @join__type(graph: A, key: "id")
          @join__type(graph: B, key: "id", extension: true) {
          id: ID!
          name: String! @join__field(graph: A) @lowercase
          comments: [Comment] @join__field(graph: B)
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type Comment @join__type(graph: B) {
          id: ID!
          text: String!
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        schema
          @link(url: "https://specs.apollo.dev/link/v1.0")
          @link(url: "https://specs.apollo.dev/join/v0.3", for: EXECUTION)
          @link(url: "https://myspecs.dev/lowercase/v1.0", import: ["@lowercase"]) {
          query: Query
        }
      `);
    });

    test('preserve directive if defined with overlapping locations across subgraphs and all included in @composeDirective', () => {
      const result = composeServices([
        {
          name: 'a',
          typeDefs: parse(/* GraphQL */ `
              extend schema
                @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key", "@composeDirective"])
                @link(url: "https://myspecs.dev/lowercase/v1.0", import: ["@lowercase"])
                @composeDirective(name: "@lowercase")

              directive @lowercase on FIELD_DEFINITION

              type User @key(fields: "id") {
                id: ID!
                name: String! @lowercase
              }
            `),
        },
        {
          name: 'b',
          typeDefs: parse(/* GraphQL */ `
              extend schema
                @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key", "@composeDirective"])
                @link(url: "https://myspecs.dev/lowercase/v1.0", import: ["@lowercase"])
                @composeDirective(name: "@lowercase")

              directive @lowercase on OBJECT | FIELD_DEFINITION

              extend type User @key(fields: "id") @lowercase {
                id: ID!
                comments: [Comment]
              }

              type Comment @lowercase {
                id: ID!
                text: String!
              }

              type Query {
                comments: [Comment]
              }
            `),
        },
      ]);

      if (version === 'v2.0') {
        assertCompositionFailure(result);
        return;
      }

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        directive @lowercase on OBJECT | FIELD_DEFINITION
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type User
          @join__type(graph: A, key: "id")
          @join__type(graph: B, key: "id", extension: true)
          @lowercase {
          id: ID!
          name: String! @join__field(graph: A) @lowercase
          comments: [Comment] @join__field(graph: B)
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type Comment @join__type(graph: B) @lowercase {
          id: ID!
          text: String!
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        schema
          @link(url: "https://specs.apollo.dev/link/v1.0")
          @link(url: "https://specs.apollo.dev/join/v0.3", for: EXECUTION)
          @link(url: "https://myspecs.dev/lowercase/v1.0", import: ["@lowercase"]) {
          query: Query
        }
      `);
    });

    test('preserve directive on scalars if included in @composeDirective', () => {
      const result = composeServices([
        {
          name: 'a',
          typeDefs: parse(/* GraphQL */ `
              extend schema
                @link(
                  url: "https://specs.apollo.dev/federation/${version}"
                  import: ["@key", "@composeDirective"]
                )
                @link(url: "https://myspecs.dev/whatever/v1.0", import: ["@whatever"])
                @composeDirective(name: "@whatever")

              directive @whatever on SCALAR

              scalar DateTime @whatever

              type User @key(fields: "id") {
                id: ID!
                name: String!
                createdAt: DateTime!
              }

              type Query {
                users: [User]
              }
            `),
        },
      ]);

      if (version === 'v2.0') {
        assertCompositionFailure(result);
        return;
      }

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        directive @whatever on SCALAR
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type User @join__type(graph: A, key: "id") {
          id: ID!
          name: String!
          createdAt: DateTime!
        }
      `);
    });

    test('preserve directive on interface its field and argument if included in @composeDirective', () => {
      const result = composeServices([
        {
          name: 'a',
          typeDefs: parse(/* GraphQL */ `
              extend schema
                @link(
                  url: "https://specs.apollo.dev/federation/${version}"
                  import: ["@key", "@composeDirective"]
                )
                @link(url: "https://myspecs.dev/whatever/v1.0", import: ["@whatever"])
                @composeDirective(name: "@whatever")

              directive @whatever on FIELD_DEFINITION | INTERFACE | INPUT_FIELD_DEFINITION | ARGUMENT_DEFINITION

              type AuthenticatedUser implements User @key(fields: "id") {
                id: ID!
                name: String!
                createdAt: String!
                tags(limit: Int): [String!]!
              }

              type AnonymousUser implements User @key(fields: "id") {
                id: ID!
                tags(limit: Int): [String!]!
              }

              interface User @whatever {
                id: ID! @whatever
                tags(limit: Int @whatever): [String!]!
              }

              type Query {
                users: [User]
              }
            `),
        },
      ]);

      if (version === 'v2.0') {
        assertCompositionFailure(result);
        return;
      }

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        directive @whatever on FIELD_DEFINITION | INTERFACE | INPUT_FIELD_DEFINITION | ARGUMENT_DEFINITION
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        interface User @join__type(graph: A) @whatever {
          id: ID! @whatever
          tags(limit: Int @whatever): [String!]!
        }
      `);
    });

    test('preserve directive on directive argument if included in @composeDirective', () => {
      const result = composeServices([
        {
          name: 'a',
          typeDefs: parse(/* GraphQL */ `
              extend schema
                @link(
                  url: "https://specs.apollo.dev/federation/${version}"
                  import: ["@composeDirective"]
                )
                @link(url: "https://myspecs.dev/whatever/v1.0", import: ["@whatever", "@whenever"])
                @composeDirective(name: "@whatever")
                @composeDirective(name: "@whenever")

              directive @whatever(when: String @whenever) on FIELD_DEFINITION
              directive @whenever on ARGUMENT_DEFINITION

              type User {
                id: ID! @whatever(when: "now")
              }

              type Query {
                users: [User]
              }
            `),
        },
      ]);

      if (version === 'v2.0') {
        assertCompositionFailure(result);
        return;
      }

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        directive @whatever(when: String @whenever) on FIELD_DEFINITION
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        directive @whenever on ARGUMENT_DEFINITION
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type User @join__type(graph: A) {
          id: ID! @whatever(when: "now")
        }
      `);
    });

    test('use highest version of a spec that imports a custom directive (@composeDirective)', () => {
      const result = composeServices([
        {
          name: 'a',
          typeDefs: parse(/* GraphQL */ `
              extend schema
                @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key", "@composeDirective"])
                @link(url: "https://myspecs.dev/lowercase/v1.1", import: ["@lowercase"])
                @composeDirective(name: "@lowercase")

              directive @lowercase on FIELD_DEFINITION

              type User @key(fields: "id") {
                id: ID!
                name: String! @lowercase
              }
            `),
        },
        {
          name: 'b',
          typeDefs: parse(/* GraphQL */ `
              extend schema
                @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key", "@composeDirective"])
                @link(url: "https://myspecs.dev/lowercase/v1.3", import: ["@lowercase"])
                @composeDirective(name: "@lowercase")

              directive @lowercase on OBJECT | FIELD_DEFINITION

              extend type User @key(fields: "id") @lowercase {
                id: ID!
                comments: [Comment]
              }

              type Comment @lowercase {
                id: ID!
                text: String!
              }

              type Query {
                comments: [Comment]
              }
            `),
        },
      ]);

      if (version === 'v2.0') {
        assertCompositionFailure(result);
        return;
      }

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        directive @lowercase on OBJECT | FIELD_DEFINITION
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type User
          @join__type(graph: A, key: "id")
          @join__type(graph: B, key: "id", extension: true)
          @lowercase {
          id: ID!
          name: String! @join__field(graph: A) @lowercase
          comments: [Comment] @join__field(graph: B)
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type Comment @join__type(graph: B) @lowercase {
          id: ID!
          text: String!
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        schema
          @link(url: "https://specs.apollo.dev/link/v1.0")
          @link(url: "https://specs.apollo.dev/join/v0.3", for: EXECUTION)
          @link(url: "https://myspecs.dev/lowercase/v1.3", import: ["@lowercase"]) {
          query: Query
        }
      `);
    });

    test('two different major versions of the same spec were used to import a scalar of the same name', () => {
      const result = composeServices([
        {
          name: 'a',
          typeDefs: parse(/* GraphQL */ `
              extend schema
                @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key"])
                @link(url: "https://myspecs.dev/casing/v1.1", import: ["LowercaseString"])

              scalar LowercaseString

              type User @key(fields: "id") {
                id: ID!
                name: LowercaseString!
              }
            `),
        },
        {
          name: 'b',
          typeDefs: parse(/* GraphQL */ `
              extend schema
                @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key"])
                @link(url: "https://myspecs.dev/casing/v2.3", import: ["LowercaseString"])

              scalar LowercaseString

              extend type User @key(fields: "id") {
                id: ID!
                comments: [Comment]
              }

              type Comment {
                id: ID!
                text: LowercaseString!
              }

              type Query {
                comments: [Comment]
              }
            `),
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        scalar LowercaseString @join__type(graph: A) @join__type(graph: B)
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type User
          @join__type(graph: A, key: "id")
          @join__type(graph: B, key: "id", extension: true) {
          id: ID!
          name: LowercaseString! @join__field(graph: A)
          comments: [Comment] @join__field(graph: B)
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type Comment @join__type(graph: B) {
          id: ID!
          text: LowercaseString!
        }
      `);

      // No @link directive for the scalar - not sure why though...
      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        schema
          @link(url: "https://specs.apollo.dev/link/v1.0")
          @link(url: "https://specs.apollo.dev/join/v0.3", for: EXECUTION) {
          query: Query
        }
      `);
    });

    test('two different specs were used to import a scalar of the same name', () => {
      const result = composeServices([
        {
          name: 'a',
          typeDefs: parse(/* GraphQL */ `
              extend schema
                @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key"])
                @link(url: "https://myspecs.dev/casing/v1.1", import: ["LowercaseString"])

              scalar LowercaseString

              type User @key(fields: "id") {
                id: ID!
                name: LowercaseString!
              }
            `),
        },
        {
          name: 'b',
          typeDefs: parse(/* GraphQL */ `
              extend schema
                @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key"])
                @link(url: "https://yourspecs.dev/casing/v2.3", import: ["LowercaseString"])

              scalar LowercaseString

              extend type User @key(fields: "id") {
                id: ID!
                comments: [Comment]
              }

              type Comment {
                id: ID!
                text: LowercaseString!
              }

              type Query {
                comments: [Comment]
              }
            `),
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        scalar LowercaseString @join__type(graph: A) @join__type(graph: B)
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type User
          @join__type(graph: A, key: "id")
          @join__type(graph: B, key: "id", extension: true) {
          id: ID!
          name: LowercaseString! @join__field(graph: A)
          comments: [Comment] @join__field(graph: B)
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type Comment @join__type(graph: B) {
          id: ID!
          text: LowercaseString!
        }
      `);

      // No @link directive for the scalar - not sure why though...
      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        schema
          @link(url: "https://specs.apollo.dev/link/v1.0")
          @link(url: "https://specs.apollo.dev/join/v0.3", for: EXECUTION) {
          query: Query
        }
      `);
    });

    test('import type', () => {
      const result = composeServices([
        {
          name: 'a',
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])
              @link(url: "https://myspecs.dev/json/v1.0", import: ["JSON"])

            scalar JSON

            type User @shareable {
              name: JSON
            }
          `),
        },
        {
          name: 'b',
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])
              @link(url: "https://myspecs.dev/json/v1.0", import: [{ name: "JSON2", as: "JSON" }])

            scalar JSON

            type User @shareable {
              name: JSON
            }

            type Query {
              users: [User]
            }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      // KNOW: if directives are defined and registered at least once by @composeDirective
      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        scalar JSON @join__type(graph: A) @join__type(graph: B)
      `);
    });

    test('every entity must be annotated with the @join__type directive', () => {
      const result = composeServices([
        {
          name: 'users',
          typeDefs: parse(/* GraphQL */ `
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])
            
            type User @key(fields: "email") {
              email: ID!
              name: String
              totalProductsCreated: Int
              role: Role!
            }

            enum Role {
              ADMIN
              USER
            }
          `),
        },
        {
          name: 'pandas',
          typeDefs: parse(/* GraphQL */ `
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])
            
            type Query {
              allPandas: [Panda]
              panda(name: ID!): Panda
            }

            type Panda {
              name: ID!
              favoriteFood: String
            }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(`type Panda @join__type(graph: PANDAS)`);
      expect(result.supergraphSdl).toContainGraphQL(
        `type User @join__type(graph: USERS, key: "email")`,
      );
      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        enum Role @join__type(graph: USERS) {
          ADMIN @join__enumValue(graph: USERS)
          USER @join__enumValue(graph: USERS)
        }
      `);
    });

    test('renaming directives', () => {
      const result = composeServices([
        {
          name: 'users',
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/${version}"
                import: [{ name: "@key", as: "@primaryKey" }]
              )

            type User @primaryKey(fields: "email") {
              email: ID!
              name: String
              totalProductsCreated: Int
              role: Role!
            }

            enum Role {
              ADMIN
              USER
            }
          `),
        },
        {
          name: 'pandas',
          typeDefs: parse(/* GraphQL */ `
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

            type Query {
              allPandas: [Panda]
              panda(name: ID!): Panda
            }

            type Panda @key(fields: "name") {
              name: ID!
              favoriteFood: String
            }
          `),
        },
      ]);

      // KNOW: if directive has an alias
      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(
        'type Panda @join__type(graph: PANDAS, key: "name")',
      );
      expect(result.supergraphSdl).toContainGraphQL(
        'type User @join__type(graph: USERS, key: "email")',
      );
      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        enum Role @join__type(graph: USERS) {
          ADMIN @join__enumValue(graph: USERS)
          USER @join__enumValue(graph: USERS)
        }
      `);
    });

    test('namespaced directives', () => {
      const result = composeServices([
        {
          name: 'users',
          typeDefs: parse(/* GraphQL */ `
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

            type User @key(fields: "email") {
              email: ID!
              name: String
              totalProductsCreated: Int
              role: Role!
            }

            type Details @federation__shareable {
              createdAt: String
            }

            enum Role {
              ADMIN
              USER
            }
          `),
        },
        {
          name: 'pandas',
          typeDefs: parse(/* GraphQL */ `
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: [])

            type Query {
              allPandas: [Panda]
              panda(name: ID!): Panda
            }

            type Panda @federation__key(fields: "name") {
              name: ID!
              favoriteFood: String
            }

            type Details @federation__shareable {
              createdAt: String
            }

            enum Role {
              ADMIN
              USER
            }
          `),
        },
      ]);

      // KNOW: extract `federation` from `https://specs.apollo.dev/federation/v2.0`
      // KNOW: if the namespace is `federation`, make all its directives available with the `federation__` prefix
      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type User @join__type(graph: USERS, key: "email") {
          email: ID!
          name: String
          totalProductsCreated: Int
          role: Role!
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type Panda @join__type(graph: PANDAS, key: "name") {
          name: ID!
          favoriteFood: String
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type Details @join__type(graph: PANDAS) @join__type(graph: USERS) {
          createdAt: String
        }
      `);
    });

    test('repeatable @key', () => {
      const result = composeServices([
        {
          name: 'users',
          typeDefs: parse(/* GraphQL */ `
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

            type User @key(fields: "email") @key(fields: "name") {
              email: ID!
              name: String
              totalProductsCreated: Int
            }

            type Query {
              allUsers: [User]
            }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type User @join__type(graph: USERS, key: "email") @join__type(graph: USERS, key: "name") {
          email: ID!
          name: String
          totalProductsCreated: Int
        }
      `);
    });

    test('@interfaceObject', () => {
      const result = composeServices([
        {
          name: 'a',
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/${version}"
                import: ["@key", "@interfaceObject"]
              )

            interface Media @key(fields: "id") {
              id: ID!
              title: String!
            }

            type Book implements Media @key(fields: "id") {
              id: ID!
              title: String!
            }

            type Query {
              books: [Book]
            }
          `),
        },
        {
          name: 'b',
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/${version}"
                import: ["@key", "@interfaceObject"]
              )

            type Media @key(fields: "id") @interfaceObject {
              id: ID!
              reviews: [Review!]!
            }

            type Review {
              score: Int!
            }

            type Query {
              topRatedMedia: [Media!]!
            }
          `),
        },
      ]);

      if (satisfiesVersionRange('< v2.3', version)) {
        assertCompositionFailure(result);
        if (api.library === 'apollo') {
          console.log(JSON.stringify(result.errors));
        }
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            message: '[a] Cannot import unknown element "@interfaceObject".',
            extensions: expect.objectContaining({
              code: 'INVALID_LINK_DIRECTIVE_USAGE',
            }),
          }),
        );
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            message: '[b] Cannot import unknown element "@interfaceObject".',
            extensions: expect.objectContaining({
              code: 'INVALID_LINK_DIRECTIVE_USAGE',
            }),
          }),
        );

        return;
      }

      if (api.library === 'guild') {
        // TODO: we don't support @interfaceObject yet
        assertCompositionFailure(result);
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            message: expect.stringContaining('@interfaceObject is not yet supported'),
          }),
        );
        return;
      }

      assertCompositionSuccess(result);

      // KNOW: which interface should be extended by @interfaceObject
      // KNOW: which fields were added by @interfaceObject and by which graph
      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        interface Media
          @join__type(graph: A, key: "id")
          @join__type(graph: B, key: "id", isInterfaceObject: true) {
          id: ID!
          title: String! @join__field(graph: A)
          reviews: [Review!]! @join__field(graph: B)
        }
      `);
      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type Book implements Media
          @join__implements(graph: A, interface: "Media")
          @join__type(graph: A, key: "id") {
          id: ID!
          title: String!
          reviews: [Review!]! @join__field
        }
      `);
    });

    test('@extends', () => {
      const result = composeServices([
        {
          name: 'a',
          typeDefs: parse(/* GraphQL */ `
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

            type Book @key(fields: "id") {
              id: ID!
              title: String!
            }

            type Query {
              books: [Book]
            }
          `),
        },
        {
          name: 'b',
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key", "@extends"])

            type Book @key(fields: "id") @extends {
              id: ID!
              review: Review!
            }

            type Review {
              score: Int!
            }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type Book
          @join__type(graph: A, key: "id")
          @join__type(graph: B, key: "id", extension: true) {
          id: ID!
          title: String! @join__field(graph: A)
          review: Review! @join__field(graph: B)
        }
      `);
    });

    test('@override', () => {
      const result = composeServices(
        [
          {
            name: 'a',
            typeDefs: parse(/* GraphQL */ `
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

            type Product @key(fields: "id") {
              id: ID!
              inStock: Boolean!
            }

            type Query {
              products: [Product]
            }
          `),
          },
          {
            name: 'b',
            typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key", "@override"])

            type Product @key(fields: "id") {
              id: ID!
              inStock: Boolean! @override(from: "a")
            }
          `),
          },
        ],
        true,
      );

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type Product @join__type(graph: A, key: "id") @join__type(graph: B, key: "id") {
          id: ID!
          inStock: Boolean! @join__field(graph: B, override: "a")
        }
      `);
    });

    test('remove @provides(fields:) when all fields are in common with @key(fields:) and @provides refers to a type extension', () => {
      const result = composeServices([
        {
          name: 'foo',
          typeDefs: parse(/* GraphQL */ `
            extend type User @key(fields: "id") {
              id: String! @external
            }

            type Group @key(fields: "id") {
              id: ID
              title: String
              users: [User] @provides(fields: "id")
            }
          `),
        },
        {
          name: 'bar',
          typeDefs: parse(/* GraphQL */ `
            extend type Group @key(fields: "id") {
              id: ID @external
              topic: Topic
            }

            type Topic @key(fields: "id") {
              id: ID!
              title: String!
            }

            type User @key(fields: "id") {
              id: String!
              name: String
            }
          `),
        },
        {
          name: 'baz',
          typeDefs: parse(/* GraphQL */ `
            type Theme @key(fields: "id") {
              id: ID!
              primaryColor: String
            }

            type Query {
              themes: [Theme]
            }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type Group @join__type(graph: FOO, key: "id") @join__type(graph: BAR, key: "id") {
          id: ID
          title: String @join__field(graph: FOO)
          users: [User] @join__field(graph: FOO)
          topic: Topic @join__field(graph: BAR)
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type Topic @join__type(graph: BAR, key: "id") {
          id: ID!
          title: String!
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type User @join__type(graph: FOO, key: "id") @join__type(graph: BAR, key: "id") {
          id: String!
          name: String @join__field(graph: BAR)
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type Theme @join__type(graph: BAZ, key: "id") {
          id: ID!
          primaryColor: String
        }
      `);
    });

    test('preserve @provides(fields:) when all fields are in common with @key(fields:) and @provides refers to type definition', () => {
      const result = composeServices([
        {
          name: 'foo',
          typeDefs: parse(/* GraphQL */ `
            type User @key(fields: "id") {
              id: String! @external
            }

            type Group @key(fields: "id") {
              id: ID
              title: String
              users: [User] @provides(fields: "id")
            }
          `),
        },
        {
          name: 'bar',
          typeDefs: parse(/* GraphQL */ `
            extend type Group @key(fields: "id") {
              id: ID @external
              topic: Topic
            }

            type Topic @key(fields: "id") {
              id: ID!
              title: String!
            }

            type User @key(fields: "id") {
              id: String!
              name: String
            }
          `),
        },
        {
          name: 'baz',
          typeDefs: parse(/* GraphQL */ `
            type Theme @key(fields: "id") {
              id: ID!
              primaryColor: String
            }

            type Query {
              themes: [Theme]
            }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type Group @join__type(graph: FOO, key: "id") @join__type(graph: BAR, key: "id") {
          id: ID
          title: String @join__field(graph: FOO)
          users: [User] @join__field(graph: FOO, provides: "id")
          topic: Topic @join__field(graph: BAR)
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type Topic @join__type(graph: BAR, key: "id") {
          id: ID!
          title: String!
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type User @join__type(graph: BAR, key: "id") @join__type(graph: FOO, key: "id") {
          id: String! @join__field(graph: BAR) @join__field(graph: FOO, external: true)
          name: String @join__field(graph: BAR)
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type Theme @join__type(graph: BAZ, key: "id") {
          id: ID!
          primaryColor: String
        }
      `);
    });

    test('@external + @provides', () => {
      const result = composeServices([
        {
          name: 'a',
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key", "@shareable"])

            type Product @key(fields: "id") {
              id: ID!
              name: String! @shareable
              inStock: Int!
            }

            type Query {
              products: [Product]
            }
          `),
        },
        {
          name: 'b',
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/${version}"
                import: ["@key", "@external", "@provides"]
              )

            type Product @key(fields: "id") {
              id: ID!
              name: String! @external
            }

            type Query {
              outOfStockProducts: [Product!]! @provides(fields: "name")
            }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type Product @join__type(graph: A, key: "id") @join__type(graph: B, key: "id") {
          id: ID!
          name: String! @join__field(graph: A) @join__field(graph: B, external: true)
          inStock: Int! @join__field(graph: A)
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type Query @join__type(graph: A) @join__type(graph: B) {
          products: [Product] @join__field(graph: A)
          outOfStockProducts: [Product!]! @join__field(graph: B, provides: "name")
        }
      `);
    });

    test('@external + @requires', () => {
      const result = composeServices([
        {
          name: 'a',
          typeDefs: parse(/* GraphQL */ `
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

            type Product @key(fields: "id") {
              id: ID!
              name: String!
              inStock: Int!
            }

            type Query {
              products: [Product]
            }
          `),
        },
        {
          name: 'b',
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/${version}"
                import: ["@key", "@external", "@requires"]
              )

            type Product @key(fields: "id") {
              id: ID!
              inStock: Int! @external
              isAvailable: String! @requires(fields: "inStock")
            }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      // KNOW: which fields are external
      // KNOW: which fields are required
      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type Product @join__type(graph: A, key: "id") @join__type(graph: B, key: "id") {
          id: ID!
          name: String! @join__field(graph: A)
          inStock: Int! @join__field(graph: A) @join__field(graph: B, external: true)
          isAvailable: String! @join__field(graph: B, requires: "inStock")
        }
      `);
    });

    test('@tag', () => {
      const result = composeServices([
        {
          name: 'a',
          typeDefs: parse(/* GraphQL */ `
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@tag"])

            type Query {
              customer(id: String!): Customer @tag(name: "team-customers")
              employee(id: String! @tag(name: "team-admin")): Employee @tag(name: "team-admin")
              employees(filter: EmployeesFilter!): [Employee!] @tag(name: "team-admin")
            }

            scalar DateTime @tag(name: "team-admin")

            interface User @tag(name: "team-accounts") {
              id: String!
              name(lowercase: Boolean @tag(name: "team-accounts")): String!
            }

            type Customer implements User @tag(name: "team-customers") {
              id: String!
              name(lowercase: Boolean @tag(name: "team-accounts")): String!
            }

            type Employee implements User @tag(name: "team-admin") {
              id: String!
              name(lowercase: Boolean @tag(name: "team-accounts")): String!
              ssn: String!
              createdAt: DateTime!
            }

            input EmployeesFilter {
              id: String @tag (name: "team-admin")
              name: String
            }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type Query @join__type(graph: A) {
          customer(id: String!): Customer @tag(name: "team-customers")
          employee(id: String! @tag(name: "team-admin")): Employee @tag(name: "team-admin")
          employees(filter: EmployeesFilter!): [Employee!] @tag(name: "team-admin")
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        interface User @join__type(graph: A) @tag(name: "team-accounts") {
          id: String!
          name(lowercase: Boolean @tag(name: "team-accounts")): String!
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type Employee implements User
          @join__implements(graph: A, interface: "User")
          @join__type(graph: A)
          @tag(name: "team-admin") {
          id: String!
          name(lowercase: Boolean @tag(name: "team-accounts")): String!
          ssn: String!
          createdAt: DateTime!
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type Customer implements User
          @join__implements(graph: A, interface: "User")
          @join__type(graph: A)
          @tag(name: "team-customers") {
          id: String!
          name(lowercase: Boolean @tag(name: "team-accounts")): String!
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        scalar DateTime @join__type(graph: A) @tag(name: "team-admin")
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        input EmployeesFilter @join__type(graph: A) {
          id: String @tag(name: "team-admin")
          name: String
        }
      `);
    });

    // Skipping because this test is not valid for earlier versions
    test('@tag on directive', () => {
      const result = composeServices([
        {
          name: 'a',
          typeDefs: parse(/* GraphQL */ `
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@tag", "@composeDirective"])
            @link(url: "https://myspecs.dev/access/v1.0", import: ["@access"])
                @composeDirective(name: "@access")

            directive @access(scope: String @tag(name: "team-admin")) on FIELD_DEFINITION

            type Query {
              employee(id: String!): Employee @tag(name: "team-admin") @access(scope: "admin")
            }

            type Employee {
              id: String!
              name: String!
              ssn: String!
            }
          `),
        },
      ]);

      if (satisfiesVersionRange('< v2.3', version)) {
        if (version === 'v2.0') {
          assertCompositionFailure(result);
        } else {
          assertCompositionSuccess(result);
        }
        return;
      }

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type Query @join__type(graph: A) {
          employee(id: String!): Employee @tag(name: "team-admin") @access(scope: "admin")
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type Employee @join__type(graph: A) {
          id: String!
          name: String!
          ssn: String!
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        directive @access(scope: String @tag(name: "team-admin")) on FIELD_DEFINITION
      `);
    });

    test('entity annotated with @key directive must have @join__type with key argument', () => {
      const result = composeServices([
        {
          name: 'users',
          typeDefs: parse(/* GraphQL */ `
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])
            
            type User @key(fields: "email") {
              email: ID!
              name: String
              totalProductsCreated: Int
              role: Role!
            }

            enum Role {
              ADMIN
              USER
            }
          `),
        },
        {
          name: 'pandas',
          typeDefs: parse(/* GraphQL */ `
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])
            
            type Query {
              allPandas: [Panda]
              panda(name: ID!): Panda
            }

            type Panda {
              name: ID!
              favoriteFood: String
            }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL('type Panda @join__type(graph: PANDAS)');
      expect(result.supergraphSdl).toContainGraphQL(
        'type User @join__type(graph: USERS, key: "email")',
      );
      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        enum Role @join__type(graph: USERS) {
          ADMIN @join__enumValue(graph: USERS)
          USER @join__enumValue(graph: USERS)
        }
      `);
    });

    test('fields referenced by @key directive must NOT be annotated with @join__field', () => {
      const result = composeServices([
        {
          name: 'reviews',
          typeDefs: parse(/* GraphQL */ `
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key", "@external"])
            
            extend type Product @key(fields: "id") {
              id: ID! @external
              reviews: [Review]
            }

            type Review @key(fields: "id") {
              id: ID!
              rating: Float
              content: String
            }
          `),
        },
        {
          name: 'products',
          typeDefs: parse(/* GraphQL */ `
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])
            
            type Product @key(fields: "id") {
              id: ID!
              title: String
            }

            extend type Query {
              product(id: ID!): Product
            }
          `),
        },
      ]);

      // KNOW: if field is the primary key, to not annotate it with @join__field
      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type Product
          @join__type(graph: PRODUCTS, key: "id")
          @join__type(graph: REVIEWS, key: "id", extension: true) {
          id: ID!
          title: String @join__field(graph: PRODUCTS)
          reviews: [Review] @join__field(graph: REVIEWS)
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type Review @join__type(graph: REVIEWS, key: "id") {
          id: ID!
          rating: Float
          content: String
        }
      `);
    });

    test('entity used by more than one service must be annotated with @join__type of these service', () => {
      const result = composeServices([
        {
          name: 'reviews',
          typeDefs: parse(/* GraphQL */ `
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key", "@external"])
            
            extend type Product @key(fields: "id") {
              id: ID! @external
              reviews: [Review]
            }

            type Review @key(fields: "id") {
              id: ID!
              rating: Float
              content: String
            }
          `),
        },
        {
          name: 'products',
          typeDefs: parse(/* GraphQL */ `
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])
            
            type Product @key(fields: "id") {
              id: ID!
              title: String
            }

            extend type Query {
              product(id: ID!): Product
            }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(
        'type Product @join__type(graph: PRODUCTS, key: "id") @join__type(graph: REVIEWS, key: "id", extension: true)',
      );
    });

    test('entity directly used by more than one service must have all fields annotated with @join__field directive, where `graph` argument points to the owning service', () => {
      const result = composeServices([
        {
          name: 'reviews',
          typeDefs: parse(/* GraphQL */ `
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key", "@external"])
            
            extend type Product @key(fields: "id") {
              id: ID! @external
              reviews: [Review]
            }

            type Review @key(fields: "id") {
              id: ID!
              rating: Float
              content: String
            }
          `),
        },
        {
          name: 'products',
          typeDefs: parse(/* GraphQL */ `
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])
            
            type Product @key(fields: "id") {
              id: ID!
              title: String
              price: Price!
            }

            type Price {
              amount: Float
            }

            extend type Query {
              product(id: ID!): Product
            }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type Product
          @join__type(graph: PRODUCTS, key: "id")
          @join__type(graph: REVIEWS, key: "id", extension: true) {
          id: ID!
          title: String @join__field(graph: PRODUCTS)
          price: Price! @join__field(graph: PRODUCTS)
          reviews: [Review] @join__field(graph: REVIEWS)
        }
      `);
    });

    test('a field of an entity with different return type (nullability) must be annotated with multiple @join__field directives, each with original return type', () => {
      const result = composeServices([
        {
          name: 'a',
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])
            type Position @shareable {
              x: Int!
              y: Int!
            }
          `),
        },
        {
          name: 'b',
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])
            type Position @shareable {
              x: Int
              y: Int!
            }

            type Query {
              position: Position
            }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type Position @join__type(graph: A) @join__type(graph: B) {
          x: Int @join__field(graph: A, type: "Int!") @join__field(graph: B, type: "Int")
          y: Int!
        }
      `);
    });

    test('a field of an entity with same type but external:true in one or more must be annotated with multiple @join__field directives', () => {
      const result = composeServices([
        {
          name: 'a',
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])
            
            type Product @key(fields: "id name") {
              id: ID!
              name: String!
              discount: Int!
            }

            type Query {
              product(id: ID!): Product
            }
          `),
        },
        {
          name: 'b',
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key", "@external"])
            
            type Product @key(fields: "id name") {
              id: ID!
              name: String! @external
              reviews: [String]
            }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type Product @join__type(graph: A, key: "id name") @join__type(graph: B, key: "id name") {
          id: ID!
          name: String! @join__field(graph: A) @join__field(graph: B, external: true)
          discount: Int! @join__field(graph: A)
          reviews: [String] @join__field(graph: B)
        }
      `);
    });

    test('enum indirectly used by more than one service must have all values annotated with @join__field directive, where `graph` argument points to the owning service', () => {
      const result = composeServices([
        {
          name: 'reviews',
          typeDefs: parse(/* GraphQL */ `
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key", "@external"])
            
            extend type Product @key(fields: "id") {
              id: ID! @external
              reviews: [Review]
            }

            type Review @key(fields: "id") {
              id: ID!
              rating: Float
              content: String
            }
          `),
        },
        {
          name: 'products',
          typeDefs: parse(/* GraphQL */ `
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])
            
            type Product @key(fields: "id") {
              id: ID!
              title: String
              price: Price!
              category: ProductCategory!
            }

            type Price {
              amount: Float
            }

            enum ProductCategory {
              ALL
              ELECTRONICS
            }

            extend type Query {
              product(id: ID!): Product
            }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type Product
          @join__type(graph: PRODUCTS, key: "id")
          @join__type(graph: REVIEWS, key: "id", extension: true) {
          id: ID!
          title: String @join__field(graph: PRODUCTS)
          price: Price! @join__field(graph: PRODUCTS)
          category: ProductCategory! @join__field(graph: PRODUCTS)
          reviews: [Review] @join__field(graph: REVIEWS)
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        enum ProductCategory @join__type(graph: PRODUCTS) {
          ALL @join__enumValue(graph: PRODUCTS)
          ELECTRONICS @join__enumValue(graph: PRODUCTS)
        }
      `);
    });

    test('query must be annotated with @join__type directive of every service', () => {
      const result = composeServices([
        {
          name: 'reviews',
          typeDefs: parse(/* GraphQL */ `
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])
            
            type Review @key(fields: "id") {
              id: ID!
              rating: Float
              content: String
            }
          `),
        },
        {
          name: 'products',
          typeDefs: parse(/* GraphQL */ `
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])
            
            type Product @key(fields: "id") {
              id: ID!
              title: String
              price: Price!
            }

            type Price {
              amount: Float
            }

            extend type Query {
              product(id: ID!): Product
            }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(
        'type Query @join__type(graph: PRODUCTS) @join__type(graph: REVIEWS)',
      );
    });

    test('all fields of query object must be annotated with @join__field pointing to the owning service', () => {
      const result = composeServices([
        {
          name: 'reviews',
          typeDefs: parse(/* GraphQL */ `
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key", "@external", "@shareable"])
            
            extend type Query {
              review(id: ID!): Review
              product(id: ID!): Product @shareable
            }

            extend type Product @key(fields: "id") {
              id: ID! @external
              reviews: [Review]
            }

            type Review @key(fields: "id") {
              id: ID!
              rating: Float
              content: String
            }
          `),
        },
        {
          name: 'products',
          typeDefs: parse(/* GraphQL */ `
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key", "@shareable"])
            
            type Product @key(fields: "id") {
              id: ID!
              title: String
              price: Price!
            }

            type Price {
              amount: Float
            }

            extend type Query {
              product(id: ID!): Product @shareable
            }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type Query @join__type(graph: PRODUCTS) @join__type(graph: REVIEWS) {
          product(id: ID!): Product
          review(id: ID!): Review @join__field(graph: REVIEWS)
        }
      `);
    });

    test('[v1] all fields of query object must be annotated with @join__field pointing to the owning service', () => {
      const result = composeServices([
        {
          name: 'reviews',
          typeDefs: parse(/* GraphQL */ `
            extend type Query {
              review(id: ID!): Review
              product(id: ID!): Product
            }

            extend type Product @key(fields: "id") {
              id: ID! @external
              reviews: [Review]
            }

            type Review @key(fields: "id") {
              id: ID!
              rating: Float
              content: String
            }
          `),
        },
        {
          name: 'products',
          typeDefs: parse(/* GraphQL */ `
            type Product @key(fields: "id") {
              id: ID!
              title: String
              price: Price!
            }

            type Price {
              amount: Float
            }

            extend type Query {
              product(id: ID!): Product
            }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      // Query.product is defined in all subgraphs, so no need to annotate it (that's not true in Fed v2 though)
      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type Query @join__type(graph: PRODUCTS) @join__type(graph: REVIEWS) {
          product(id: ID!): Product
          review(id: ID!): Review @join__field(graph: REVIEWS)
        }
      `);
    });

    test('@key(resolvable: false) should be passed to @join__type(resolvable: false)', () => {
      const result = composeServices([
        {
          name: 'products',
          typeDefs: parse(/* GraphQL */ `
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])
            
            type Product @key(fields: "id", resolvable: false) {
              id: ID!
              title: String
            }

            type Query {
              product(id: ID!): Product
            }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type Product @join__type(graph: PRODUCTS, key: "id", resolvable: false) {
          id: ID!
          title: String
        }
      `);
    });

    test('@join__implements on Interface type', () => {
      const result = composeServices([
        {
          name: 'products',
          typeDefs: parse(/* GraphQL */ `
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])
            
            type Product implements Node & SellingItem @key(fields: "id")  {
              id: ID!
              name: String!
              price: Price!
            }

            interface Node {
              id: ID!
            }

            interface SellingItem implements Node {
              id: ID!
              price: Price!
            }

            type Price {
              amount: Float
            }

            type Query {
              product(id: ID!): Product
            }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type Product implements Node & SellingItem
          @join__implements(graph: PRODUCTS, interface: "Node")
          @join__implements(graph: PRODUCTS, interface: "SellingItem")
          @join__type(graph: PRODUCTS, key: "id") {
          id: ID!
          name: String!
          price: Price!
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        interface SellingItem implements Node
          @join__implements(graph: PRODUCTS, interface: "Node")
          @join__type(graph: PRODUCTS) {
          id: ID!
          price: Price!
        }
      `);
    });

    test('Fed v1: no @join__type(key:) on interface type', () => {
      const result = composeServices([
        {
          name: 'a',
          typeDefs: parse(/* GraphQL */ `
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

            type Product {
              id: ID!
              name: String!
            }
          `),
        },
        {
          name: 'b',
          typeDefs: parse(/* GraphQL */ `
            type User implements Node @key(fields: "id") {
              id: ID!
              age: Int!
            }

            interface Node @key(fields: "id") {
              id: ID!
            }

            type Query {
              user: User
            }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        interface Node @join__type(graph: B) {
          id: ID!
        }
      `);
    });

    describe('descriptions', () => {
      test('on scalars', () => {
        const result = composeServices([
          {
            name: 'reviews',
            typeDefs: parse(/* GraphQL */ `
              extend type Query {
                dateTime: DateTime
              }

              """
              reviews
              """
              scalar DateTime
            `),
          },
          {
            name: 'products',
            typeDefs: parse(/* GraphQL */ `
              extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

              """
              products
              """
              scalar DateTime
              
              type Product @key(fields: "id") {
                id: ID!
                title: String
                createdAt: DateTime
              }
  
              extend type Query {
                product(
                  id: ID!
                ): Product
              }
            `),
          },
        ]);

        assertCompositionSuccess(result);

        expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
          """
          products
          """
          scalar DateTime
        `);
      });

      test('on object types', () => {
        const result = composeServices([
          {
            name: 'reviews',
            typeDefs: parse(/* GraphQL */ `
              extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key", "@external"])
              
              """reviews"""
              type Query {
                """
                reviews
                """
                review(
                  """
                  reviews
                  """
                  id: ID!
                ): Review
              }
  
              extend type Product @key(fields: "id") {
                """
                it will be removed
                """
                id: ID! @external
                """
                reviews
                """
                reviews: [Review]
              }
  
              """
              reviews
              """
              type Review @key(fields: "id") {
                """
                reviews
                """
                id: ID!
                """
                reviews
                """
                rating: Float
                """
                reviews
                """
                content: String
              }
            `),
          },
          {
            name: 'pricing',
            typeDefs: parse(/* GraphQL */ `
              extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key", "@external", "@extends"])
              
              type Product @key(fields: "id") @extends {
                """
                pricing
                """
                id: ID! @external
                promoCodes: [PromoCode]
              }
  
              type PromoCode {
                id: ID!
                code: String!
              }
            `),
          },
          {
            name: 'products',
            typeDefs: parse(/* GraphQL */ `
              extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])
              
              """
              products
              """
              type Product @key(fields: "id") {
                """
                products
                """
                id: ID!
                """
                products
                """
                title: String
                """
                products
                """
                price(currency: String = "USD"): Price!
              }
  
              """
              products
              """
              type Price {
                """
                products
                """
                amount: Float
              }
  
              type Query {
                """
                products
                """
                product(
                  """
                  products
                  """
                  id: ID!
                ): Product
              }
            `),
          },
        ]);

        assertCompositionSuccess(result);

        expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
          """
          products
          """
          type Price @join__type(graph: PRODUCTS) {
            """
            products
            """
            amount: Float
          }
        `);

        expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
          """
          products
          """
          type Product
            @join__type(graph: PRICING, key: "id", extension: true)
            @join__type(graph: PRODUCTS, key: "id")
            @join__type(graph: REVIEWS, key: "id", extension: true) {
            """
            pricing
            """
            id: ID!
            promoCodes: [PromoCode] @join__field(graph: PRICING)
            """
            products
            """
            title: String @join__field(graph: PRODUCTS)
            """
            products
            """
            price(currency: String = "USD"): Price! @join__field(graph: PRODUCTS)
            """
            reviews
            """
            reviews: [Review] @join__field(graph: REVIEWS)
          }
        `);

        expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
          """
          reviews
          """
          type Review @join__type(graph: REVIEWS, key: "id") {
            """
            reviews
            """
            id: ID!

            """
            reviews
            """
            rating: Float

            """
            reviews
            """
            content: String
          }
        `);

        expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
          """
          reviews
          """
          type Query
            @join__type(graph: PRODUCTS)
            @join__type(graph: REVIEWS)
            @join__type(graph: PRICING) {
            """
            products
            """
            product(
              """
              products
              """
              id: ID!
            ): Product @join__field(graph: PRODUCTS)
            """
            reviews
            """
            review(
              """
              reviews
              """
              id: ID!
            ): Review @join__field(graph: REVIEWS)
          }
        `);
      });

      test('on object type definition with @extends', () => {
        const result = composeServices([
          {
            name: 'reviews',
            typeDefs: parse(/* GraphQL */ `
              extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key", "@external", "@extends"])
              
              type Query {
                review(
                  id: ID!
                ): Review
              }
  
              """
              reviews
              """
              type Product @key(fields: "id") @extends {
                """
                reviews
                """
                id: ID! @external
                """
                reviews
                """
                reviews: [Review]
              }
  
              type Review {
                id: ID!
                rating: Float
                content: String
              }
            `),
          },
          {
            name: 'products',
            typeDefs: parse(/* GraphQL */ `
              extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])
              
              type Product @key(fields: "id") {
                """
                products
                """
                id: ID!
                """
                products
                """
                title: String
              }
  
              type Query {
                product(
                  id: ID!
                ): Product
              }
            `),
          },
        ]);

        assertCompositionSuccess(result);

        expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
          """
          reviews
          """
          type Product
            @join__type(graph: PRODUCTS, key: "id")
            @join__type(graph: REVIEWS, key: "id", extension: true) {
            """
            products
            """
            id: ID!
            """
            products
            """
            title: String @join__field(graph: PRODUCTS)
            """
            reviews
            """
            reviews: [Review] @join__field(graph: REVIEWS)
          }
        `);
      });

      test('on input object types', () => {
        // @apollo/composition sorts services by name A->Z
        // and the first detected description wins.
        // That's why descriptions from `a` service are available on `UserInput`.
        // In case `UserInput` has no description in `a` service, the description from `b` service is NOT used.
        // It's weird but let's follow their logic for consistency.
        const result = composeServices([
          {
            name: 'b',
            typeDefs: parse(/* GraphQL */ `
                extend schema
                  @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])
    
                """
                b
                """
                input UserInput {
                  """
                  b
                  """
                  name: String!
                  """
                  b
                  """
                  email: String
                }
    
                type Library @shareable {
                  book(title: String, section: String): String
                }
    
                type Query {
                  library: Library
                }
              `),
          },
          {
            name: 'a',
            typeDefs: parse(/* GraphQL */ `
                extend schema
                  @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])
    
                input UserInput {
                  """
                  a
                  """
                  name: String!
                  """
                  a
                  """
                  age: Int
                }
    
                type Library @shareable {
                  book(title: String, author: String): String
                }
              `),
          },
        ]);

        assertCompositionSuccess(result);

        expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
          """
          b
          """
          input UserInput @join__type(graph: A) @join__type(graph: B) {
            """
            a
            """
            name: String!
          }
        `);
      });

      describe('on enum types', () => {
        test('when used as the return type for at least one object or interface field', () => {
          const result = composeServices([
            {
              name: 'a',
              typeDefs: parse(/* GraphQL */ `
                extend schema
                  @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])
    
                type User @shareable {
                  name: String!
                  type: UserType
                }
    
                """
                a
                """
                enum UserType {
                  """
                  a
                  """
                  ADMIN
                }
              `),
            },
            {
              name: 'b',
              typeDefs: parse(/* GraphQL */ `
                extend schema
                  @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])
    
                type User @shareable {
                  name: String!
                  type: UserType
                }
    
                """
                b
                """
                enum UserType {
                  """
                  b
                  """
                  REGULAR
                }
    
                type Query {
                  users: [User]
                }
              `),
            },
          ]);

          assertCompositionSuccess(result);

          expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
            """
            a
            """
            enum UserType @join__type(graph: A) @join__type(graph: B) {
              """
              a
              """
              ADMIN @join__enumValue(graph: A)

              """
              b
              """
              REGULAR @join__enumValue(graph: B)
            }
          `);
        });

        test('when used as the type for at least one field argument or input type field', () => {
          const result = composeServices([
            {
              name: 'a',
              typeDefs: parse(/* GraphQL */ `
                extend schema
                  @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])
    
                type User @shareable {
                  name: String!
                }
    
                """
                a
                """
                enum UserType {
                  """
                  a
                  """
                  ADMIN
                  """
                  a
                  """
                  REGULAR
                }
              `),
            },
            {
              name: 'b',
              typeDefs: parse(/* GraphQL */ `
                extend schema
                  @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])
    
                type User @shareable {
                  name: String!
                }
    
                """
                b
                """
                enum UserType {
                  """
                  b
                  """
                  REGULAR
                  """
                  b
                  """
                  ANONYMOUS
                }
    
                type Query {
                  users(type: UserType): [User]
                }
              `),
            },
          ]);

          assertCompositionSuccess(result);

          expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
            """
            a
            """
            enum UserType @join__type(graph: A) @join__type(graph: B) {
              """
              a
              """
              REGULAR @join__enumValue(graph: A) @join__enumValue(graph: B)
            }
          `);
        });

        test('when used as the type for at least one field argument or input type field and as the return type for at least one object or interface field', () => {
          const result = composeServices([
            {
              name: 'b',
              typeDefs: parse(/* GraphQL */ `
                extend schema
                  @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])
    
                type User @shareable {
                  name: String!
                  type: UserType
                }
    
                """
                b
                """
                enum UserType {
                  """
                  b
                  """
                  REGULAR
                  """
                  b
                  """
                  ADMIN
                }
    
                type Query {
                  users(type: UserType): [User]
                }
              `),
            },
            {
              name: 'a',
              typeDefs: parse(/* GraphQL */ `
                extend schema
                  @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])
    
                type User @shareable {
                  name: String!
                  type: UserType
                }
    
                """
                a
                """
                enum UserType {
                  """
                  a
                  """
                  ADMIN
                  REGULAR
                }
              `),
            },
          ]);

          assertCompositionSuccess(result);

          expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
            """
            a
            """
            enum UserType @join__type(graph: A) @join__type(graph: B) {
              """
              a
              """
              ADMIN @join__enumValue(graph: A) @join__enumValue(graph: B)

              """
              b
              """
              REGULAR @join__enumValue(graph: A) @join__enumValue(graph: B)
            }
          `);
        });
      });

      test('on union types', () => {
        const result = composeServices([
          {
            name: 'a',
            typeDefs: parse(/* GraphQL */ `
              extend schema
                @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])
  
                union Media = Movie

                type Movie {
                  id: ID!
                  title: String!
                }

                type Admin @key(fields: "id") {
                  id: ID!
                }
            `),
          },
          {
            name: 'c',
            typeDefs: parse(/* GraphQL */ `
              extend schema
                @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])
  
                """
                c
                """
                union Media = Song

                type Song {
                  id: ID!
                  title: String!
                }

                type Anonymous @key(fields: "id") {
                  id: ID!
                }
            `),
          },
          {
            name: 'b',
            typeDefs: parse(/* GraphQL */ `
              extend schema
                @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])
  
                """
                b
                """
                union Media = Book

                type Book {
                  id: ID!
                  title: String!
                }

                type User @key(fields: "id") {
                  id: ID!
                }
  
                type Query {
                  media(id: ID!): Media
                }
            `),
          },
        ]);

        assertCompositionSuccess(result);

        expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
          """
          b
          """
          union Media
            @join__type(graph: A)
            @join__type(graph: B)
            @join__type(graph: C)
            @join__unionMember(graph: A, member: "Movie")
            @join__unionMember(graph: B, member: "Book")
            @join__unionMember(graph: C, member: "Song") =
              Movie
            | Book
            | Song
        `);
      });

      test('on interface types', () => {
        const result = composeServices([
          {
            name: 'c',
            typeDefs: parse(/* GraphQL */ `
              extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])
  
              type User @key(fields: "id") {
                id: ID!
                age: Int!
              }
  
              """
              c
              """
              interface Details {
                """
                c
                """
                age: Int
              }
            `),
          },
          {
            name: 'a',
            typeDefs: parse(/* GraphQL */ `
              extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])
  
              type User @key(fields: "id") {
                id: ID!
                name: String!
              }
  
              interface Details {
                """
                a
                """
                name: ID!
              }
            `),
          },
          {
            name: 'b',
            typeDefs: parse(/* GraphQL */ `
              extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])
  
              type User @key(fields: "id") {
                id: ID!
                email: String!
              }
  
              """
              b
              """
              interface Details {
                """
                b
                """
                email: String
                """
                b
                """
                age: Int
              }
  
              type Query {
                user: User
              }
            `),
          },
        ]);

        assertCompositionSuccess(result);

        expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
          """
          b
          """
          interface Details @join__type(graph: A) @join__type(graph: B) @join__type(graph: C) {
            """
            a
            """
            name: ID! @join__field(graph: A)
            """
            b
            """
            email: String @join__field(graph: B)
            """
            b
            """
            age: Int @join__field(graph: B) @join__field(graph: C)
          }
        `);
      });
    });

    describe('@deprecated', () => {
      test('on object types', () => {
        const result = composeServices([
          {
            name: 'a',
            typeDefs: parse(/* GraphQL */ `
              extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key", "@external"])
              
              extend type Query {
                reviews(
                  limit: Int @deprecated
                ): [Review] @deprecated
              }
  
              extend type Product @key(fields: "id") {
                id: ID! @external @deprecated(reason: "a")
                reviews: [Review] @deprecated
              }
  
              type Review @key(fields: "id") {
                id: ID! @deprecated
                rating: Float @deprecated
                content: String @deprecated
              }
            `),
          },
          {
            name: 'b',
            typeDefs: parse(/* GraphQL */ `
              extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])
              
              type Product @key(fields: "id") {
                id: ID! @deprecated(reason: "b")
                title: String @deprecated
                price: Price! @deprecated
              }
  
              type Price {
                amount: Float @deprecated
              }
  
              extend type Query {
                product(
                  id: ID!
                ): Product @deprecated
              }
            `),
          },
        ]);

        assertCompositionSuccess(result);

        expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
          type Price @join__type(graph: B) {
            amount: Float @deprecated
          }
        `);

        // Seems like first @deprecated wins (see the `id` field - `a` won, because it was first, even though the field is defined in `b`)
        expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
          type Product
            @join__type(graph: B, key: "id")
            @join__type(graph: A, key: "id", extension: true) {
            id: ID! @deprecated(reason: "a")
            title: String @join__field(graph: B) @deprecated
            price: Price! @join__field(graph: B) @deprecated
            reviews: [Review] @join__field(graph: A) @deprecated
          }
        `);

        expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
          type Review @join__type(graph: A, key: "id") {
            id: ID! @deprecated
            rating: Float @deprecated
            content: String @deprecated
          }
        `);

        expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
          type Query @join__type(graph: B) @join__type(graph: A) {
            product(id: ID!): Product @join__field(graph: B) @deprecated
            reviews(limit: Int @deprecated): [Review] @join__field(graph: A) @deprecated
          }
        `);
      });

      test('on input object types', () => {
        const result = composeServices([
          {
            name: 'b',
            typeDefs: parse(/* GraphQL */ `
                extend schema
                  @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])
    
                input UserInput {
                  name: String @deprecated(reason: "b")
                  email: String @deprecated(reason: "b")
                }
    
                type Library @shareable {
                  book(title: String, section: String): String
                }
    
                type Query {
                  library: Library
                }
              `),
          },
          {
            name: 'a',
            typeDefs: parse(/* GraphQL */ `
                extend schema
                  @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])
    
                input UserInput {
                  name: String
                  email: String @deprecated(reason: "a")
                  age: Int @deprecated(reason: "a")
                }
    
                type Library @shareable {
                  book(title: String, author: String): String
                }
              `),
          },
        ]);

        assertCompositionSuccess(result);

        expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
          input UserInput @join__type(graph: A) @join__type(graph: B) {
            name: String @deprecated(reason: "b")
            email: String @deprecated(reason: "a")
          }
        `);
      });

      describe('on enum types', () => {
        test('when used as the return type for at least one object or interface field', () => {
          const result = composeServices([
            {
              name: 'a',
              typeDefs: parse(/* GraphQL */ `
                extend schema
                  @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])
    
                type User @shareable {
                  name: String!
                  type: UserType
                }
    
                enum UserType {
                  ADMIN @deprecated(reason: "a")
                }
              `),
            },
            {
              name: 'b',
              typeDefs: parse(/* GraphQL */ `
                extend schema
                  @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])
    
                type User @shareable {
                  name: String!
                  type: UserType
                }
    
                enum UserType {
                  REGULAR @deprecated(reason: "b")
                }
    
                type Query {
                  users: [User]
                }
              `),
            },
          ]);

          assertCompositionSuccess(result);

          expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
            enum UserType @join__type(graph: A) @join__type(graph: B) {
              ADMIN @join__enumValue(graph: A) @deprecated(reason: "a")
              REGULAR @join__enumValue(graph: B) @deprecated(reason: "b")
            }
          `);
        });

        test('when used as the type for at least one field argument or input type field', () => {
          const result = composeServices([
            {
              name: 'a',
              typeDefs: parse(/* GraphQL */ `
                extend schema
                  @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])
    
                type User @shareable {
                  name: String!
                }
    
                enum UserType {
                  ADMIN @deprecated(reason: "a")
                  REGULAR
                }
              `),
            },
            {
              name: 'b',
              typeDefs: parse(/* GraphQL */ `
                extend schema
                  @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])
    
                type User @shareable {
                  name: String!
                }
    
                enum UserType {
                  REGULAR @deprecated(reason: "b")
                  ANONYMOUS @deprecated(reason: "b")
                }
    
                type Query {
                  users(type: UserType): [User]
                }
              `),
            },
          ]);

          assertCompositionSuccess(result);

          expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
            enum UserType @join__type(graph: A) @join__type(graph: B) {
              REGULAR @join__enumValue(graph: A) @join__enumValue(graph: B) @deprecated(reason: "b")
            }
          `);
        });

        test('when used as the type for at least one field argument or input type field and as the return type for at least one object or interface field', () => {
          const result = composeServices([
            {
              name: 'b',
              typeDefs: parse(/* GraphQL */ `
                extend schema
                  @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])
    
                type User @shareable {
                  name: String!
                  type: UserType
                }
    
                enum UserType {
                  REGULAR @deprecated(reason: "b")
                  ADMIN
                }
    
                type Query {
                  users(type: UserType): [User]
                }
              `),
            },
            {
              name: 'a',
              typeDefs: parse(/* GraphQL */ `
                extend schema
                  @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])
    
                type User @shareable {
                  name: String!
                  type: UserType
                }
    
                enum UserType {
                  ADMIN
                  REGULAR @deprecated(reason: "a")
                }
              `),
            },
          ]);

          assertCompositionSuccess(result);

          expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
            enum UserType @join__type(graph: A) @join__type(graph: B) {
              ADMIN @join__enumValue(graph: A) @join__enumValue(graph: B)
              REGULAR @join__enumValue(graph: A) @join__enumValue(graph: B) @deprecated(reason: "a")
            }
          `);
        });
      });
    });

    test('enum join__Graph must contain all subgraphs with their URLs', () => {
      const result = composeServices([
        {
          name: 'users',
          typeDefs: parse(/* GraphQL */ `
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])
            
            type User @key(fields: "email") {
              email: ID!
              name: String
              totalProductsCreated: Int
            }
          `),
          url: 'https://users.com',
        },
        {
          name: 'pandas',
          typeDefs: parse(/* GraphQL */ `
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])
            
            type Query {
              allPandas: [Panda]
              panda(name: ID!): Panda
            }

            type Panda {
              name: ID!
              favoriteFood: String
            }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        enum join__Graph {
          PANDAS @join__graph(name: "pandas", url: "")
          USERS @join__graph(name: "users", url: "https://users.com")
        }
      `);
    });

    describe('federation directives and types', () => {
      test('link and join spec', () => {
        const result = composeServices([
          {
            name: 'a',
            typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

            type User @shareable {
              name: String
            }

            type Query {
              user: User
            }
          `),
          },
          {
            name: 'b',
            typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

            type User @shareable {
              name: String
            }
          `),
          },
        ]);

        assertCompositionSuccess(result);

        parse(linkSDL)
          .definitions.concat(parse(joinSDL).definitions)
          .forEach(def => {
            expect(result.supergraphSdl).toContainGraphQL(print(def));
          });
      });

      test('[v1] link and join spec', () => {
        const result = composeServices([
          {
            name: 'a',
            typeDefs: parse(/* GraphQL */ `
              type User {
                name: String
              }

              type Query {
                user: User
              }
            `),
          },
          {
            name: 'b',
            typeDefs: parse(/* GraphQL */ `
              type Dog {
                name: String
              }

              type Query {
                dog: Dog
              }
            `),
          },
        ]);

        assertCompositionSuccess(result);

        parse(linkSDL)
          .definitions.concat(parse(joinSDL).definitions)
          .forEach(def => {
            expect(result.supergraphSdl).toContainGraphQL(print(def));
          });
      });
    });
  });

  describe('Federation v1 only', () => {
    test('delete subgraph spec', () => {
      const result = composeServices([
        {
          name: 'users',
          typeDefs: parse(/* GraphQL */ `
            type User {
              name: String!
              blocked: Boolean!
            }

            type Query {
              _entities(representations: [_Any!]!): [_Entity]!
            }

            extend type Query {
              users: [User]!
            }

            extend type Query {
              _service: _Service!
            }

            scalar _FieldSet
            scalar _Any

            union _Entity = User

            type _Service {
              sdl: String
            }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type Query @join__type(graph: USERS) {
          users: [User]!
        }
      `);

      expect(result.supergraphSdl).not.toEqual(expect.stringContaining('type _Service'));
      expect(result.supergraphSdl).not.toEqual(expect.stringContaining('scalar _Any'));
      expect(result.supergraphSdl).not.toEqual(expect.stringContaining('scalar _FieldSet'));
      expect(result.supergraphSdl).not.toEqual(expect.stringContaining('union _Entity'));
    });

    describe('@tag', () => {
      test('without definition', () => {
        const result = composeServices([
          {
            name: 'users',
            typeDefs: parse(/* GraphQL */ `
              type User @key(fields: "id") {
                id: ID!
                name: String! @tag(name: "private")
                blocked: Boolean!
              }

              type Query {
                users: [User]!
              }
            `),
          },
        ]);

        assertCompositionSuccess(result);

        expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
          type User @join__type(graph: USERS, key: "id") {
            id: ID!
            name: String! @tag(name: "private")
            blocked: Boolean!
          }
        `);

        expect(result.supergraphSdl).toContainGraphQL(tagDirective);

        expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
          schema
            @link(url: "https://specs.apollo.dev/link/v1.0")
            @link(url: "https://specs.apollo.dev/join/v0.3", for: EXECUTION)
            @link(url: "https://specs.apollo.dev/tag/v0.3") {
            query: Query
          }
        `);
      });

      test('with definition', () => {
        const result = composeServices([
          {
            name: 'users',
            typeDefs: parse(/* GraphQL */ `
              directive @tag(name: String!) repeatable on FIELD_DEFINITION

              type User @key(fields: "id") {
                id: ID!
                name: String! @tag(name: "private")
                blocked: Boolean!
              }

              type Query {
                users: [User]!
              }
            `),
          },
        ]);

        assertCompositionSuccess(result);

        expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
          type User @join__type(graph: USERS, key: "id") {
            id: ID!
            name: String! @tag(name: "private")
            blocked: Boolean!
          }
        `);

        // The original definition should be ignored
        expect(result.supergraphSdl).toContainGraphQL(tagDirective);

        expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
          schema
            @link(url: "https://specs.apollo.dev/link/v1.0")
            @link(url: "https://specs.apollo.dev/join/v0.3", for: EXECUTION)
            @link(url: "https://specs.apollo.dev/tag/v0.3") {
            query: Query
          }
        `);
      });
    });
  });
});
