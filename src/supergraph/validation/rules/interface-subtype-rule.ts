import { GraphQLError } from 'graphql';
import { SupergraphVisitorMap } from '../../composition/visitor.js';
import { SupergraphState } from '../../state.js';
import { SupergraphValidationContext } from '../validation-context.js';

export function InterfaceSubtypeRule(
  context: SupergraphValidationContext,
  supergraph: SupergraphState,
): SupergraphVisitorMap {
  return {
    ObjectTypeField(objectTypeState, fieldState) {
      if (objectTypeState.interfaces.size === 0) {
        return;
      }

      const interfaceNames = Array.from(objectTypeState.interfaces.values());

      for (const interfaceName of interfaceNames) {
        const interfaceState = supergraph.interfaceTypes.get(interfaceName);
        if (!interfaceState) {
          continue;
        }

        const interfaceField = interfaceState.fields.get(fieldState.name);
        if (!interfaceField) {
          continue;
        }

        if (fieldState.type !== interfaceField.type) {
          context.reportError(
            new GraphQLError(
              `Interface field ${interfaceName}.${interfaceField.name} expects type ${interfaceField.type} but ${objectTypeState.name}.${fieldState.name} of type ${fieldState.type} is not a proper subtype.`,
              {
                extensions: {
                  code: 'INVALID_GRAPHQL',
                },
              },
            ),
          );
        }
      }
    },
  };
}
