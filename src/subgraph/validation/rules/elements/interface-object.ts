import { ASTVisitor, GraphQLError } from 'graphql';
import { validateDirectiveAgainstOriginal } from '../../../helpers.js';
import type { SubgraphValidationContext } from '../../validation-context.js';

export function InterfaceObjectRules(context: SubgraphValidationContext): ASTVisitor {
  return {
    DirectiveDefinition(node) {
      validateDirectiveAgainstOriginal(node, 'interfaceObject', context);
    },
    Directive(node) {
      if (!context.isAvailableFederationDirective('interfaceObject', node)) {
        return;
      }

      context.reportError(
        new GraphQLError(
          `@interfaceObject is not yet supported. See https://github.com/the-guild-org/federation/issues/7`,
          {
            extensions: { code: 'UNSUPPORTED_FEATURE' },
          },
        ),
      );
    },
  };
}
