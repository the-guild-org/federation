import { GraphQLError } from 'graphql';
import { SupergraphVisitorMap } from '../../composition/visitor.js';
import { SupergraphValidationContext } from '../validation-context.js';

export function OverrideSourceHasOverrideRule(
  context: SupergraphValidationContext,
): SupergraphVisitorMap {
  return {
    ObjectTypeField(objectTypeState, fieldState) {
      if (fieldState.override === null) {
        return;
      }

      const graphsWithOverride = Array.from(fieldState.byGraph).filter(onlyWithOverride);

      if (graphsWithOverride.length === 1) {
        return;
      }

      for (let i = 0; i < graphsWithOverride.length; i++) {
        const [graph, fieldStateInGraph] = graphsWithOverride[i];
        // TODO: instead of using toUpperCase here, we should be able to translate subgraph's name to ID
        const overrideValue = fieldStateInGraph.override.toUpperCase();
        const graphFromOverride = fieldState.byGraph.get(overrideValue);

        // We want to first check if the override value points to a graph with an override directive at the same field
        // If not, we want to use the next graph in the list, or the first graph in the list if we're at the end
        const anotherGraphId =
          graphFromOverride && graphFromOverride.override !== null
            ? overrideValue
            : graphsWithOverride[i + 1]
            ? graphsWithOverride[i + 1][0]
            : graphsWithOverride[0][0];

        context.reportError(
          new GraphQLError(
            `Field "${objectTypeState.name}.${
              fieldState.name
            }" on subgraph "${context.graphIdToName(
              graph,
            )}" is also marked with directive @override in subgraph "${context.graphIdToName(
              anotherGraphId,
            )}". Only one @override directive is allowed per field.`,
            {
              extensions: {
                code: 'OVERRIDE_SOURCE_HAS_OVERRIDE',
              },
            },
          ),
        );
      }
    },
  };
}

function onlyWithOverride<
  T extends {
    override: null | string;
  },
>(entry: [string, T]): entry is [string, T & { override: string }] {
  return entry[1].override !== null;
}
