import { ASTVisitor, GraphQLError } from 'graphql';
import { validateDirectiveAgainstOriginal } from '../../../helpers.js';
import type { SubgraphValidationContext } from '../../validation-context.js';

export function RequiresScopesRule(context: SubgraphValidationContext): ASTVisitor {
  return {
    DirectiveDefinition(node) {
      validateDirectiveAgainstOriginal(node, 'requiresScopes', context);
    },
    Directive(node) {
      if (!context.isAvailableFederationDirective('requiresScopes', node)) {
        return;
      }

      context.reportError(
        new GraphQLError(`@requiresScopes is not yet supported`, {
          extensions: { code: 'UNSUPPORTED_FEATURE' },
        }),
      );
    },
  };
}
