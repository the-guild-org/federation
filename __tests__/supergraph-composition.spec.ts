import { expect, test } from 'vitest';
import { getSubgraphs } from './fixtures/huge-schema/index.js';
import { assertCompositionSuccess, graphql, testImplementations } from './shared/testkit.js';

testImplementations(api => {
  test('composition of basic object types', () => {
    const result = api.composeServices([
      {
        name: 'products',
        typeDefs: graphql`
          extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key"])

          type Query {
            products: [Product!]!
          }

          type Product @key(fields: "id") {
            id: ID!
            name: String!
          }
        `,
      },
      {
        name: 'reviews',
        typeDefs: graphql`
          extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key"])

          type Query {
            reviews: [Review!]!
          }

          type Product @key(fields: "id") {
            id: ID!
            reviews: [Review!]!
          }

          type Review @key(fields: "id") {
            id: ID!
            body: String!
          }
        `,
      },
    ]);

    assertCompositionSuccess(result);

    expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
      type Product @join__type(graph: PRODUCTS, key: "id") @join__type(graph: REVIEWS, key: "id") {
        id: ID!
        name: String! @join__field(graph: PRODUCTS)
        reviews: [Review!]! @join__field(graph: REVIEWS)
      }
    `);

    expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
      type Review @join__type(graph: REVIEWS, key: "id") {
        id: ID!
        body: String!
      }
    `);

    expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
      type Query @join__type(graph: PRODUCTS) @join__type(graph: REVIEWS) {
        products: [Product!]! @join__field(graph: PRODUCTS)
        reviews: [Review!]! @join__field(graph: REVIEWS)
      }
    `);

    expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
      enum join__Graph {
        PRODUCTS @join__graph(name: "products", url: "")
        REVIEWS @join__graph(name: "reviews", url: "")
      }
    `);
  });

  test('composition of basic object types with @requires, @provides, @key', () => {
    const result = api.composeServices([
      {
        name: 'accounts',
        typeDefs: graphql`
          extend type Query {
            me: User
          }

          type User @key(fields: "id") {
            id: ID!
            name: String
            username: String
          }
        `,
      },
      {
        name: 'inventory',
        typeDefs: graphql`
          extend type Product @key(fields: "upc") {
            upc: String! @external
            weight: Int @external
            price: Int @external
            inStock: Boolean
            shippingEstimate: Int @requires(fields: "price weight")
          }
        `,
      },
      {
        name: 'products',
        typeDefs: graphql`
          extend type Query {
            topProducts(first: Int = 5): [Product]
          }

          type Product @key(fields: "upc") {
            upc: String!
            name: String
            price: Int
            weight: Int
          }
        `,
      },
      {
        name: 'reviews',
        typeDefs: graphql`
          type Review @key(fields: "id") {
            id: ID!
            body: String
            author: User @provides(fields: "username")
            product: Product
          }

          extend type User @key(fields: "id") {
            id: ID! @external
            username: String @external
            reviews: [Review]
          }

          extend type Product @key(fields: "upc") {
            upc: String! @external
            reviews: [Review]
          }
        `,
      },
    ]);

    assertCompositionSuccess(result);

    expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
      type Product
        @join__type(graph: INVENTORY, key: "upc")
        @join__type(graph: PRODUCTS, key: "upc")
        @join__type(graph: REVIEWS, key: "upc") {
        upc: String!
        weight: Int @join__field(graph: INVENTORY, external: true) @join__field(graph: PRODUCTS)
        price: Int @join__field(graph: INVENTORY, external: true) @join__field(graph: PRODUCTS)
        inStock: Boolean @join__field(graph: INVENTORY)
        shippingEstimate: Int @join__field(graph: INVENTORY, requires: "price weight")
        name: String @join__field(graph: PRODUCTS)
        reviews: [Review] @join__field(graph: REVIEWS)
      }
    `);

    expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
      type User @join__type(graph: ACCOUNTS, key: "id") @join__type(graph: REVIEWS, key: "id") {
        id: ID!
        name: String @join__field(graph: ACCOUNTS)
        username: String @join__field(graph: ACCOUNTS) @join__field(graph: REVIEWS, external: true)
        reviews: [Review] @join__field(graph: REVIEWS)
      }
    `);

    expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
      type Review @join__type(graph: REVIEWS, key: "id") {
        id: ID!
        body: String
        author: User @join__field(graph: REVIEWS, provides: "username")
        product: Product
      }
    `);
  });

  test('[Fed v1] set @join__type(extension: true) to types with @extends', () => {
    const result = api.composeServices([
      {
        name: 'foo',
        typeDefs: graphql`
          type Action @extends @key(fields: "id") {
            id: ID! @external
            words: [String]!
          }
        `,
      },
      {
        name: 'bar',
        typeDefs: graphql`
          type Action @key(fields: "id") {
            id: ID!
            name: String!
          }

          type Query {
            actions: [Action!]!
          }
        `,
      },
      {
        name: 'baz',
        typeDefs: graphql`
          type Action @extends @key(fields: "id") {
            id: ID! @external
            photos: [String]!
          }
        `,
      },
    ]);

    assertCompositionSuccess(result);

    expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
      type Action
        @join__type(graph: BAR, key: "id")
        @join__type(graph: BAZ, key: "id", extension: true)
        @join__type(graph: FOO, key: "id", extension: true) {
        id: ID!
        name: String! @join__field(graph: BAR)
        photos: [String]! @join__field(graph: BAZ)
        words: [String]! @join__field(graph: FOO)
      }
    `);
  });

  test('[Fed v2 - DGS] set @join__type(override, requires) to types with @override and @requires', () => {
    const result = api.composeServices([
      {
        name: 'foo',
        typeDefs: graphql`
          schema
            @link(url: "https://specs.apollo.dev/link/v1.0")
            @link(
              url: "https://specs.apollo.dev/federation/v2.0"
              import: ["@key", "@shareable", "@inaccessible"]
            ) {
            query: Query
          }

          scalar federation__FieldSet

          scalar link__Import

          enum link__Purpose {
            EXECUTION
            SECURITY
          }

          directive @link(
            as: String
            for: link__Purpose
            import: [link__Import]
            url: String
          ) repeatable on SCHEMA

          directive @key(
            fields: federation__FieldSet!
            resolvable: Boolean = true
          ) repeatable on INTERFACE | OBJECT
          directive @inaccessible on ARGUMENT_DEFINITION | ENUM | ENUM_VALUE | FIELD_DEFINITION | INPUT_FIELD_DEFINITION | INPUT_OBJECT | INTERFACE | OBJECT | SCALAR | UNION
          directive @shareable on FIELD_DEFINITION | OBJECT

          type Product @key(fields: "id") {
            id: ID!
            variants: [Variant!]! @shareable
            price: Int
            colors: [Color!]! @inaccessible
          }

          type Color @key(fields: "id") {
            id: ID!
          }

          type Variant @key(fields: "id") {
            id: ID!
          }

          type Query {
            word: String
          }
        `,
      },
      {
        name: 'bar',
        typeDefs: graphql`
          schema
            @link(url: "https://specs.apollo.dev/link/v1.0")
            @link(
              url: "https://specs.apollo.dev/federation/v2.0"
              import: ["@key", "@external", "@requires", "@shareable", "@override"]
            ) {
            query: Query
          }

          scalar federation__FieldSet

          scalar link__Import

          enum link__Purpose {
            EXECUTION
            SECURITY
          }

          directive @external(reason: String) on FIELD_DEFINITION | OBJECT
          directive @key(
            fields: federation__FieldSet!
            resolvable: Boolean = true
          ) repeatable on INTERFACE | OBJECT
          directive @link(
            as: String
            for: link__Purpose
            import: [link__Import]
            url: String
          ) repeatable on SCHEMA
          directive @override(from: String!) on FIELD_DEFINITION
          directive @requires(fields: federation__FieldSet!) on FIELD_DEFINITION
          directive @shareable on FIELD_DEFINITION | OBJECT

          type Product @key(fields: "id") {
            id: ID!
            variants: [Variant!]! @override(from: "foo") @requires(fields: "colors { id }")
            colors: [Color!]! @external
          }

          type Color @key(fields: "id") {
            id: ID!
          }

          type Variant @key(fields: "id") {
            id: ID!
          }

          type Query {
            words: [String!]!
          }
        `,
      },
    ]);

    assertCompositionSuccess(result);

    expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
      type Product @join__type(graph: BAR, key: "id") @join__type(graph: FOO, key: "id") {
        id: ID!
        variants: [Variant!]! @join__field(graph: BAR, requires: "colors { id }", override: "foo")
        colors: [Color!]!
          @inaccessible
          @join__field(graph: BAR, external: true)
          @join__field(graph: FOO)
        price: Int @join__field(graph: FOO)
      }
    `);
  });

  test('[Fed v1] @override', () => {
    const result = api.composeServices([
      {
        name: 'foo',
        typeDefs: graphql`
          directive @override(from: String!) on FIELD_DEFINITION

          type Sentence {
            text: String! @override(from: "bar")
            color: String! @override(from: "bar")
          }

          type Viewer {
            sentences: [Sentence!]! @override(from: "bar")
          }

          type Query {
            sentences: [Sentence!]! @override(from: "bar")
            view: Viewer!
          }
        `,
      },
      {
        name: 'bar',
        typeDefs: graphql`
          extend schema
            @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@shareable"])

          type Sentence {
            text: String!
            color: String!
          }

          type Viewer @shareable {
            sentences: [Sentence!]!
            words: [String!]!
          }

          type Query @shareable {
            sentences: [Sentence!]!
            view: Viewer!
          }
        `,
      },
      {
        name: 'baz',
        typeDefs: graphql`
          extend schema
            @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@shareable"])

          type Viewer @shareable {
            ping: String
          }

          type Query @shareable {
            view: Viewer!
          }
        `,
      },
    ]);

    assertCompositionSuccess(result);

    expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
      type Sentence @join__type(graph: BAR) @join__type(graph: FOO) {
        color: String! @join__field(graph: FOO, override: "bar")
        text: String! @join__field(graph: FOO, override: "bar")
      }
    `);

    expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
      type Viewer @join__type(graph: BAR) @join__type(graph: FOO) @join__type(graph: BAZ) {
        sentences: [Sentence!]! @join__field(graph: FOO, override: "bar")
        words: [String!]! @join__field(graph: BAR)
        ping: String @join__field(graph: BAZ)
      }
    `);

    expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
      type Query @join__type(graph: BAR) @join__type(graph: FOO) @join__type(graph: BAZ) {
        sentences: [Sentence!]! @join__field(graph: FOO, override: "bar")
        view: Viewer!
      }
    `);
  });

  test('validate fixture/huge-schema', async () => {
    const subgraphs = await getSubgraphs();
    const result = api.composeServices(subgraphs, {
      disableValidationRules: ['SatisfiabilityRule'],
    });
    assertCompositionSuccess(result);
  });
});
