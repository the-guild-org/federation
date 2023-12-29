import { GraphQLError } from 'graphql';
import { InterfaceType, TypeKind } from '../../../subgraph/state.js';
import {
  allowedInterfaceObjectVersion,
  importsAllowInterfaceObject,
} from '../../../subgraph/validation/rules/elements/interface-object';
import { SupergraphValidationContext } from '../validation-context';
import { GraphTypeValidationContext } from './types-of-the-same-kind-rule';

type TypeName = string;
type GraphName = string;

export function InterfaceObjectCompositionRule(context: SupergraphValidationContext) {
  // I need to collect all types which are interfaces and objects in the different subgraphs (trkohler)
  const typeCandidates = new Map<string, Map<TypeKind, Set<GraphTypeValidationContext>>>();
  const interfaceObjectAllowedInGraphs = new Set<string>();

  for (const [graph, state] of context.subgraphStates) {
    // check for @interfaceObject (trkohler)
    if (
      allowedInterfaceObjectVersion.includes(state.graph.version) &&
      importsAllowInterfaceObject(state.graph.imports)
    ) {
      interfaceObjectAllowedInGraphs.add(graph);
    }
    state.types.forEach(type => {
      const candidate = typeCandidates.get(type.name);

      if (candidate) {
        // Seems like we've already seen this type
        const validationContexts = candidate.get(type.kind);

        if (validationContexts) {
          // If we've already seen this kind
          // Add the graph to the set.
          validationContexts.add({
            graphName: state.graph.id,
            interfaceObjectAllowed: interfaceObjectAllowedInGraphs.has(graph),
          });
        } else {
          // Add the kind to the map of kinds for that type
          candidate.set(
            type.kind,
            new Set([
              {
                graphName: state.graph.id,
                interfaceObjectAllowed: interfaceObjectAllowedInGraphs.has(graph),
              },
            ]),
          );
        }
      } else {
        // We haven't seen this type yet
        const typeKind = type.kind;
        // we want only interfaces because they are the core pillar of @interfaceObject (trkohler)
        if (typeKind == TypeKind.INTERFACE) {
          typeCandidates.set(
            type.name,
            new Map([
              [
                type.kind,
                new Set([
                  {
                    graphName: state.graph.id,
                    interfaceObjectAllowed: interfaceObjectAllowedInGraphs.has(graph),
                  },
                ]),
              ],
            ]),
          );
        }
      }
    });
  }

  const rootInterfaceTypeNames = new Map<TypeName, GraphName>();
  for (const [typeName, typeKinds] of typeCandidates) {
    const hasObjectKind = typeKinds.has(TypeKind.OBJECT);
    // again, we are assuming that this is a perfect case
    // this assumption must be fixed in the future (trkohler)
    const graphName = typeKinds.get(TypeKind.INTERFACE)!.values().next().value.graphName;
    if (hasObjectKind) {
      rootInterfaceTypeNames.set(typeName, graphName);
    }
  }

  for (const [interfaceTypeName, graphName] of rootInterfaceTypeNames) {
    const graph = context.subgraphStates.get(graphName)!;
    const { types } = graph;
    const interfaceType = types.get(interfaceTypeName)! as InterfaceType;

    interfaceType.root__interfaceObject = true;
    // @key directive must be present on root interface type (trkohler)
    const keys = interfaceType.keys;

    if (keys.length == 0) {
      context.reportError(
        new GraphQLError(
          `@key directive must be present on interface type ${interfaceTypeName} in subgraph ${graphName} for @objectInterface to work`,
          {
            extensions: {
              code: 'INVALID_GRAPHQL',
            },
          },
        ),
      );
    }
  }

  return {};
}
