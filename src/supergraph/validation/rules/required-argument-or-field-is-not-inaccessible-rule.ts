import { GraphQLError } from 'graphql';
import { SupergraphVisitorMap } from '../../composition/visitor.js';
import { SupergraphValidationContext } from '../validation-context.js';

export function RequiredArgumentOrFieldIsNotInaccessibleRule(
  context: SupergraphValidationContext,
): SupergraphVisitorMap {
  return {
    InputObjectTypeField(inputObjectState, fieldState) {
      if (fieldState.type.endsWith('!') && fieldState.inaccessible) {
        context.reportError(
          new GraphQLError(
            `Input field "${inputObjectState.name}.${fieldState.name}" is @inaccessible but is a required input field of its type.`,
            {
              extensions: {
                code: 'REQUIRED_INACCESSIBLE',
              },
            },
          ),
        );
      }
    },
    ObjectTypeFieldArg(objectState, fieldState, argState) {
      if (argState.type.endsWith('!') && argState.inaccessible) {
        context.reportError(
          new GraphQLError(
            `Argument "${objectState.name}.${fieldState.name}(${argState.name}:)" is @inaccessible but is a required argument of its field.`,
            {
              extensions: {
                code: 'REQUIRED_INACCESSIBLE',
              },
            },
          ),
        );
      }
    },
  };
}
