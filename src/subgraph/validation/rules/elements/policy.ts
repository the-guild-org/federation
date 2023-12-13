import { ASTVisitor, GraphQLError } from 'graphql';
import { validateDirectiveAgainstOriginal } from '../../../helpers.js';
import type { SubgraphValidationContext } from '../../validation-context.js';

export function PolicyRule(context: SubgraphValidationContext): ASTVisitor {
  return {
    DirectiveDefinition(node) {
      validateDirectiveAgainstOriginal(node, 'policy', context);
    },
    Directive(node) {
      if (!context.isAvailableFederationDirective('policy', node)) {
        return;
      }

      context.reportError(
        new GraphQLError(`@policy is not yet supported`, {
          extensions: { code: 'UNSUPPORTED_FEATURE' },
        }),
      );
    },
  };
}
