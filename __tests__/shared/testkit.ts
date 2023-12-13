import { DocumentNode } from 'graphql';
import { describe } from 'vitest';
import { composeServices as apolloComposeServices } from '@apollo/composition';
import {
  assertCompositionFailure,
  assertCompositionSuccess,
  compositionHasErrors,
  CompositionResult,
  composeServices as guildComposeServices,
} from '../../src/compose.js';
import { graphql } from './utils.js';

const missingErrorCodes = [
  'DISALLOWED_INACCESSIBLE',
  'DOWNSTREAM_SERVICE_ERROR',
  'EXTERNAL_ARGUMENT_DEFAULT_MISMATCH',
  'EXTERNAL_ARGUMENT_TYPE_MISMATCH',
  'EXTERNAL_COLLISION_WITH_ANOTHER_DIRECTIVE',
  'IMPLEMENTED_BY_INACCESSIBLE',
  'INVALID_FEDERATION_SUPERGRAPH',
  'LINK_IMPORT_NAME_MISMATCH',
  'REQUIRED_INACCESSIBLE',
  'SHAREABLE_HAS_MISMATCHED_RUNTIME_TYPES',
  'UNSUPPORTED_FEATURE',
  'UNSUPPORTED_LINKED_FEATURE',
];

function composeServicesFactory(
  implementation: (
    services: Array<{
      name: string;
      typeDefs: DocumentNode;
      url?: string;
    }>,
  ) => CompositionResult,
) {
  return function composeServices(
    services: Array<{
      name: string;
      typeDefs: DocumentNode;
      url?: string;
    }>,
    __internal?: {
      disableValidationRules?: string[];
    },
    debug = false,
  ) {
    // @ts-expect-error - Expected 1 arguments, but got 2 as __internal is only available in our impl
    const result = implementation(services, __internal as any);

    // This will help us detect new validation errors
    if (compositionHasErrors(result)) {
      if (debug) {
        console.log(result.errors.map(e => e.message).join('\n'));
      }
      const codes = result.errors.map(e => e.extensions?.code).filter(Boolean);
      const uniqueCodes = new Set(codes);

      if (uniqueCodes.size > 0) {
        // find codes that are in todo list
        const todoCodes = Array.from(uniqueCodes).filter(c => missingErrorCodes.includes(c as any));

        if (todoCodes.length) {
          console.warn(['Detected', todoCodes.join(', '), 'in a test'].join(' '));
        }
      }
    }

    return result;
  };
}

const both = [
  {
    library: 'apollo' as const,
    composeServices: composeServicesFactory(apolloComposeServices),
  },
  {
    library: 'guild' as const,
    composeServices: composeServicesFactory(guildComposeServices),
  },
];
const versions = ['v2.0', 'v2.1', 'v2.2', 'v2.3'] as const;

type TestAPI = (typeof both)[number];

export function testVersions(runTests: (api: TestAPI, version: (typeof versions)[number]) => void) {
  describe.each(both)('$library', api => {
    describe.each(versions)('%s', version => {
      runTests(api, version);
    });
  });
}

export function testImplementations(runTests: (api: TestAPI) => void) {
  describe.each(both)('$library', api => {
    runTests(api);
  });
}

export function ensureCompositionSuccess<T extends CompositionResult>(result: T) {
  assertCompositionSuccess(result);

  return result;
}

export { assertCompositionFailure, assertCompositionSuccess, graphql };

export const createStarsStuff = () => ({
  inventory: {
    name: 'inventory',
    typeDefs: graphql`
      extend schema
        @link(
          url: "https://specs.apollo.dev/federation/v2.1"
          import: ["@key", "@shareable", "@external", "@requires"]
        )

      type Product implements ProductItf @key(fields: "id") {
        id: ID!
        dimensions: ProductDimension @external
        delivery(zip: String): DeliveryEstimates @requires(fields: "dimensions { size weight }")
      }

      type ProductDimension @shareable {
        size: String
        weight: Float
      }

      type DeliveryEstimates {
        estimatedDelivery: String
        fastestDelivery: String
      }

      interface ProductItf {
        id: ID!
        dimensions: ProductDimension
        delivery(zip: String): DeliveryEstimates
      }

      enum ShippingClass {
        STANDARD
        EXPRESS
        OVERNIGHT
      }
    `,
  },
  reviews: {
    name: 'reviews',
    typeDefs: graphql`
      schema
        @link(
          url: "https://specs.apollo.dev/federation/v2.0"
          import: ["@key", "@override", "@shareable"]
        ) {
        query: Query
      }

      type Product implements ProductItf @key(fields: "id") {
        id: ID!
        reviewsCount: Int!
        reviewsScore: Float! @shareable @override(from: "products")
        reviews: [Review!]!
      }

      interface ProductItf {
        id: ID!
        reviewsCount: Int!
        reviewsScore: Float!
        reviews: [Review!]!
      }

      type Query {
        review(id: Int!): Review
      }

      type Review {
        id: Int!
        body: String!
      }
    `,
  },
  pandas: {
    name: 'pandas',
    typeDefs: graphql`
      directive @tag(name: String!) repeatable on FIELD_DEFINITION

      type Query {
        allPandas: [Panda]
        panda(name: ID!): Panda
      }

      type Panda {
        name: ID!
        favoriteFood: String @tag(name: "nom-nom-nom")
      }
    `,
  },
  products: {
    name: 'products',
    typeDefs: graphql`
      extend schema
        @link(
          url: "https://specs.apollo.dev/federation/v2.1"
          import: ["@key", "@shareable", "@tag", "@inaccessible", "@composeDirective"]
        )
        @link(
          url: "https://myspecs.dev/myDirective/v1.0"
          import: ["@myDirective", { name: "@anotherDirective", as: "@hello" }]
        )
        @composeDirective(name: "@myDirective")
        @composeDirective(name: "@hello")

      directive @myDirective(a: String!) on FIELD_DEFINITION
      directive @hello on FIELD_DEFINITION

      type Query {
        allProducts: [ProductItf]
        product(id: ID!): ProductItf
      }

      interface ProductItf implements SkuItf {
        id: ID!
        sku: String
        name: String
        package: String
        variation: ProductVariation
        dimensions: ProductDimension
        createdBy: User
        hidden: String @inaccessible
        oldField: String @deprecated(reason: "refactored out")
      }

      interface SkuItf {
        sku: String
      }

      type Product implements ProductItf & SkuItf
        @key(fields: "id")
        @key(fields: "sku package")
        @key(fields: "sku variation { id }") {
        id: ID! @tag(name: "hi-from-products")
        sku: String
        name: String @hello
        package: String
        variation: ProductVariation
        dimensions: ProductDimension
        createdBy: User
        hidden: String
        reviewsScore: Float!
        oldField: String
      }
      enum ShippingClass {
        STANDARD
        EXPRESS
      }
      type ProductVariation {
        id: ID!
        name: String
      }
      type ProductDimension @shareable {
        size: String
        weight: Float
      }
      type User @key(fields: "email") {
        email: ID!
        totalProductsCreated: Int @shareable
      }
    `,
  },
  users: {
    name: 'users',
    typeDefs: graphql`
      directive @tag(name: String!) repeatable on FIELD_DEFINITION | OBJECT

      type User @key(fields: "email") {
        email: ID! @tag(name: "test-from-users")
        name: String
        totalProductsCreated: Int
      }
    `,
  },
});
