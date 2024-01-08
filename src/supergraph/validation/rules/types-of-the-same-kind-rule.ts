import { GraphQLError } from 'graphql';
import { ObjectType, TypeKind } from '../../../subgraph/state.js';
import {
  allowedInterfaceObjectVersion,
  importsAllowInterfaceObject,
} from '../../../subgraph/validation/rules/elements/interface-object.js';
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

export type GraphTypeValidationContext = {
  graphName: string;
  interfaceObject: boolean;
};

export function TypesOfTheSameKindRule(context: SupergraphValidationContext) {
  /**
   * Map<typeName, Map<kind, Set<graphName>>>
   */
  const typeToKindWithGraphs = new Map<string, Map<TypeKind, Set<GraphTypeValidationContext>>>();
  const typesWithConflict = new Set<string>();

  for (const [graph, state] of context.subgraphStates) {
    state.types.forEach(type => {
      let interfaceObject = false;
      const kindToGraphs = typeToKindWithGraphs.get(type.name);
      const typeIsObject = type.kind === TypeKind.OBJECT;
      if (typeIsObject && type.interfaceObjectTypeName) {
        interfaceObject = true;
      }

      if (kindToGraphs) {
        // Seems like we've already seen this type
        const graphs = kindToGraphs.get(type.kind);

        if (graphs) {
          // If we've already seen this kind
          // Add the graph to the set.
          graphs.add({
            graphName: context.graphIdToName(graph),
            interfaceObject,
          });
        } else {
          // Add the kind to the map of kinds for that type
          kindToGraphs.set(
            type.kind,
            new Set([
              {
                graphName: context.graphIdToName(graph),
                interfaceObject,
              },
            ]),
          );
        }

        // If it has more than 1 kind
        if (kindToGraphs.size > 1) {
          // Add it to the conflict set
          typesWithConflict.add(type.name);
        }
      } else {
        // We haven't seen this type yet
        typeToKindWithGraphs.set(
          type.name,
          new Map([
            [
              type.kind,
              new Set([
                {
                  graphName: context.graphIdToName(graph),
                  interfaceObject,
                },
              ]),
            ],
          ]),
        );
      }
    });
  }

  for (const typeName of typesWithConflict) {
    const kindToGraphs = typeToKindWithGraphs.get(typeName)!;

    // check for @interfaceObject (trkohler)
    const isInterfaceObjectCandidate = interfaceObjectConditions(kindToGraphs);
    if (isInterfaceObjectCandidate) {
      continue;
    }

    const groups = Array.from(kindToGraphs.entries()).map(([kind, graphs]) => {
      const plural = graphs.size > 1 ? 's' : '';
      return `${mapIRKindToString[kind]} Type in subgraph${plural} "${Array.from(graphs)
        .map(typeValidationContext => typeValidationContext.graphName)
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

function interfaceObjectConditions(
  kindToGraphs: Map<TypeKind, Set<GraphTypeValidationContext>>,
): boolean {
  const objectTypes = kindToGraphs.get(TypeKind.OBJECT) || [];
  let interfaceObject = false;
  for (const graphTypeValidationContext of objectTypes) {
    if (graphTypeValidationContext.interfaceObject) {
      interfaceObject = true;
    }
  }
  return interfaceObject;
}
