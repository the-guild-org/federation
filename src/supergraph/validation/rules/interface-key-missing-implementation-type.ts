import { GraphQLError } from 'graphql';
import { SupergraphVisitorMap } from '../../composition/visitor.js';
import { SupergraphValidationContext } from '../validation-context.js';

export function InterfaceKeyMissingImplementationTypeRule(
  context: SupergraphValidationContext,
): SupergraphVisitorMap {
  return {
    InterfaceType(interfaceState) {
      // Check first if the interface is not implemented somewhere in the supergraph.
      // If at least one subgraph defines/extends the interface, but none of its object types implement it, then we look for two kinds of issues:
      //  - Subgraph that implements the interface needs to define all the object types that implement the interface in the supergraph. (It's madness, I know..., it shouldn't be like that, it should be ignored.)
      //  - Subgraph that defines/extends the interface but doesn't implement it needs to define all the object types that implement the interface in the supergraph.
      let someSubgraphsAreMissingImplementation = false;

      for (const interfaceStateInGraph of interfaceState.byGraph.values()) {
        if (interfaceStateInGraph.keys.length === 0) {
          continue;
        }

        if (interfaceStateInGraph.implementedBy.size === 0) {
          someSubgraphsAreMissingImplementation = true;
          break;
        }
      }

      if (!someSubgraphsAreMissingImplementation) {
        return; // No issues detected, supergraph looks good!
      }

      for (const [graph, interfaceStateInGraph] of interfaceState.byGraph) {
        if (interfaceStateInGraph.keys.length === 0) {
          continue;
        }
        // From testing, it seems that the first key is the one that is used in the error message.
        const firstKeyFields = interfaceStateInGraph.keys[0].fields;
        const graphName = context.graphIdToName(graph);

        const typesToDefine = Array.from(interfaceState.implementedBy)
          .filter(objectTypeName => !interfaceStateInGraph.implementedBy.has(objectTypeName))
          .sort();

        context.reportError(
          new GraphQLError(
            `[${graphName}] Interface type "${
              interfaceState.name
            }" has a resolvable key (@key(fields: "${firstKeyFields}")) in subgraph "${graphName}" but that subgraph is missing some of the supergraph implementation types of "${
              interfaceState.name
            }". Subgraph "${graphName}" should define ${
              typesToDefine.length > 1 ? 'types' : 'type'
            } ${joinWithAnd(typesToDefine)} (and have ${
              typesToDefine.length > 1 ? 'them' : 'it'
            } implement "${interfaceState.name}").`,
            {
              extensions: {
                code: 'INTERFACE_KEY_MISSING_IMPLEMENTATION_TYPE',
              },
            },
          ),
        ); // TODO: check this one for @interfaceObject (trkohler)
      }
    },
  };
}

function joinWithAnd(list: string[]) {
  if (list.length <= 2) {
    return `"${list.join('" and "')}"`;
  }

  const last = list.pop();

  return `"${list.join('", "')}" and "${last}"`;
}
