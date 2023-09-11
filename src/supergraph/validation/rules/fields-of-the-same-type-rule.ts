import { GraphQLError } from 'graphql';
import { SupergraphVisitorMap } from '../../composition/visitor.js';
import { SupergraphValidationContext } from '../validation-context.js';

export function FieldsOfTheSameTypeRule(
  context: SupergraphValidationContext,
): SupergraphVisitorMap {
  return {
    ObjectTypeField(objectTypeState, fieldState) {
      const typeToGraphs = new Map<string, string[]>();

      fieldState.byGraph.forEach((field, graphName) => {
        // We normalize the type to remove the non-null modifier
        // Yeah yeah yeah, we could use an object to define if it's a list or non-null or name etc
        // But this way is faster to iterate.
        const isNullable = !field.type.endsWith('!');
        const isNullableInSupergraph = !fieldState.type.endsWith('!');
        const isMatchingNonNullablePart =
          fieldState.type.replace(/!$/, '') === field.type.replace(/!$/, '');
        let normalizedOutputType: string;

        // Turn User! into User (if super type is nullable)
        // Supergraph type | sign | Local type
        // -----------------------------------
        // `User`            ===    `User!`
        // `String`          !==    `User!`
        if (isMatchingNonNullablePart) {
          normalizedOutputType = isNullableInSupergraph
            ? isNullable
              ? field.type
              : field.type.replace(/!$/, '')
            : field.type;
        } else {
          normalizedOutputType = field.type;
        }
        const existing = typeToGraphs.get(normalizedOutputType);

        if (existing) {
          existing.push(graphName);
        } else {
          typeToGraphs.set(normalizedOutputType, [graphName]);
        }
      });

      if (typeToGraphs.size > 1) {
        const groups = Array.from(typeToGraphs.entries()).map(([outputType, graphs]) => {
          const plural = graphs.length > 1 ? 's' : '';
          return `type "${outputType}" in subgraph${plural} "${graphs
            .map(context.graphIdToName)
            .join('", "')}"`;
        });
        const [first, second, ...rest] = groups;
        context.reportError(
          new GraphQLError(
            `Type of field "${objectTypeState.name}.${
              fieldState.name
            }" is incompatible across subgraphs: it has ${first} but ${second}${
              rest.length ? ` and ${rest.join(' and ')}` : ''
            }`,
            {
              extensions: {
                code: 'FIELD_TYPE_MISMATCH',
              },
            },
          ),
        );
      }
    },
    InputObjectTypeField(inputObjectTypeState, fieldState) {
      const typeToGraphs = new Map<string, string[]>();

      fieldState.byGraph.forEach((field, graphName) => {
        // We normalize the type to remove the non-null modifier
        // Yeah yeah yeah, we could use an object to define if it's a list or non-null or name etc
        // But this way is faster to iterate.
        const isNonNullable = field.type.endsWith('!');
        const isNonNullableInSupergraph = fieldState.type.endsWith('!');
        const isMatchingNonNullablePart =
          fieldState.type.replace(/!$/, '') === field.type.replace(/!$/, '');
        let normalizedOutputType: string;

        // Turn User! into User (if super type is nullable)
        // Supergraph type | sign | Local type
        // -----------------------------------
        // `User!`           ===    `User`
        // `String!`         !==    `User`
        if (isMatchingNonNullablePart) {
          normalizedOutputType = isNonNullableInSupergraph
            ? isNonNullable
              ? field.type
              : field.type + '!'
            : field.type;
        } else {
          normalizedOutputType = field.type;
        }
        const existing = typeToGraphs.get(normalizedOutputType);

        if (existing) {
          existing.push(graphName);
        } else {
          typeToGraphs.set(normalizedOutputType, [graphName]);
        }
      });

      if (typeToGraphs.size > 1) {
        const groups = Array.from(typeToGraphs.entries()).map(([outputType, graphs]) => {
          const plural = graphs.length > 1 ? 's' : '';
          return `type "${outputType}" in subgraph${plural} "${graphs
            .map(context.graphIdToName)
            .join('", "')}"`;
        });
        const [first, second, ...rest] = groups;
        context.reportError(
          new GraphQLError(
            `Type of field "${inputObjectTypeState.name}.${
              fieldState.name
            }" is incompatible across subgraphs: it has ${first} but ${second}${
              rest.length ? ` and ${rest.join(' and ')}` : ''
            }`,
            {
              extensions: {
                code: 'FIELD_TYPE_MISMATCH',
              },
            },
          ),
        );
      }
    },
  };
}
