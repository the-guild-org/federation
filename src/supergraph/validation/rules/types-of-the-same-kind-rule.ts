import { GraphQLError } from 'graphql';
import { TypeKind } from '../../../subgraph/state.js';
import { SupergraphValidationContext } from './../validation-context.js';

const mapIRKindToString = {
  [TypeKind.OBJECT]: 'Object',
  [TypeKind.INTERFACE]: 'Interface',
  [TypeKind.UNION]: 'Union',
  [TypeKind.ENUM]: 'Enum',
  [TypeKind.INPUT_OBJECT]: 'InputObject',
  [TypeKind.SCALAR]: 'Scalar',
  [TypeKind.DIRECTIVE]: 'Directive',
};

export function TypesOfTheSameKindRule(context: SupergraphValidationContext) {
  /**
   * Map<typeName, Map<kind, Set<graphName>>>
   */
  const typeToKindWithGraphs = new Map<string, Map<TypeKind, Set<string>>>();
  const typesWithConflict = new Set<string>();

  for (const [graph, state] of context.subgraphStates) {
    state.types.forEach(type => {
      const kindToGraphs = typeToKindWithGraphs.get(type.name);

      if (kindToGraphs) {
        // Seems like we've already seen this type
        const graphs = kindToGraphs.get(type.kind);

        if (graphs) {
          // If we've already seen this kind
          // Add the graph to the set.
          graphs.add(graph);
        } else {
          // Add the kind to the map of kinds for that type
          kindToGraphs.set(type.kind, new Set([graph]));
        }

        // If it has more than 1 kind
        if (kindToGraphs.size > 1) {
          // Add it to the conflict set
          typesWithConflict.add(type.name);
        }
      } else {
        // We haven't seen this type yet
        typeToKindWithGraphs.set(type.name, new Map([[type.kind, new Set([graph])]]));
      }
    });
  }

  for (const typeName of typesWithConflict) {
    const kindToGraphs = typeToKindWithGraphs.get(typeName)!;
    const groups = Array.from(kindToGraphs.entries()).map(([kind, graphs]) => {
      const plural = graphs.size > 1 ? 's' : '';
      return `${mapIRKindToString[kind]} Type in subgraph${plural} "${Array.from(graphs)
        .map(context.graphIdToName)
        .join('", "')}"`;
    });
    const [first, second, ...rest] = groups;

    context.reportError(
      new GraphQLError(
        `Type "${typeName}" has mismatched kind: it is defined as ${first} but ${second}${
          rest.length ? ` and ${rest.join(' and ')}` : ''
        }`,
        {
          extensions: {
            code: 'TYPE_KIND_MISMATCH',
          },
        },
      ),
    );
  }
}
