import { GraphQLError } from 'graphql';
import { TypeKind } from '../../../subgraph/state.js';
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

// new type for interfaceObject (trkohler)
export type GraphTypeValidationContext = {
  graphName: string;
  interfaceObjectAllowed: boolean;
};

// new type for interfaceObject (trkohler)
type InterfaceObjectResult = {
  error?: GraphQLError;
  passed?: boolean;
};

export function TypesOfTheSameKindRule(context: SupergraphValidationContext) {
  /**
   * Map<typeName, Map<kind, Set<graphName>>>
   */
  const typeToKindWithGraphs = new Map<string, Map<TypeKind, Set<GraphTypeValidationContext>>>();
  const typesWithConflict = new Set<string>();
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
      const kindToGraphs = typeToKindWithGraphs.get(type.name);

      if (kindToGraphs) {
        // Seems like we've already seen this type
        const graphs = kindToGraphs.get(type.kind);

        if (graphs) {
          // If we've already seen this kind
          // Add the graph to the set.
          graphs.add({
            graphName: context.graphIdToName(graph),
            interfaceObjectAllowed: interfaceObjectAllowedInGraphs.has(graph),
          });
        } else {
          // Add the kind to the map of kinds for that type
          kindToGraphs.set(
            type.kind,
            new Set([
              {
                graphName: context.graphIdToName(graph),
                interfaceObjectAllowed: interfaceObjectAllowedInGraphs.has(graph),
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
                  interfaceObjectAllowed: interfaceObjectAllowedInGraphs.has(graph),
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
    const interfaceObjectResult = interfaceObjectConditions(kindToGraphs, typeName);
    if (interfaceObjectResult.error) {
      context.reportError(interfaceObjectResult.error);
    } else if (interfaceObjectResult.passed) {
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

/* 
  (trkohler)
  kindToGraphs Map(2) {
  'INTERFACE' => Set(1) { { graphName: 'subgraphA', interfaceObjectAllowed: true } },
  'OBJECT' => Set(1) { { graphName: 'subgraphB', interfaceObjectAllowed: true } }
}
  */
function interfaceObjectConditions(
  kindToGraphs: Map<TypeKind, Set<GraphTypeValidationContext>>,
  typeName: string,
): InterfaceObjectResult {
  const passed = false;
  const interfaceTypeValidationContexts = kindToGraphs.get(TypeKind.INTERFACE);
  /*
    if interface with the same name is defined in several graphs, we must throw an error.
    So we rely on the fact that set must contain one value with interfaceObjectAllowed = true
    Is this a good strategy?
    */
  const interfaceObjectAllowed = interfaceTypeValidationContexts?.values().next().value
    .interfaceObjectAllowed;

  if (interfaceObjectAllowed) {
    const objectTypeValidationContexts = kindToGraphs.get(TypeKind.OBJECT);
    if (objectTypeValidationContexts) {
      for (const objectTypeValidationContext of objectTypeValidationContexts) {
        if (!objectTypeValidationContext.interfaceObjectAllowed) {
          const error = new GraphQLError(
            `type "${typeName}" is defined as object interface. It can't be defined as plain object in subgraph "${objectTypeValidationContext.graphName}"`,
            {
              extensions: {
                code: 'OBJECT_INTERFACE_INCORRECT_DEFINITION',
              },
            },
          );
          return { error };
        }
      }
      // everything must be ok, return
      // TODO: check if there are other kinds of conflicts
      return {
        passed: true,
      };
    }
  }
  return { passed };
}
