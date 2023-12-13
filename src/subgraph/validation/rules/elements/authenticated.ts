import { ASTVisitor, GraphQLError } from 'graphql';
import { validateDirectiveAgainstOriginal } from '../../../helpers.js';
import type { SubgraphValidationContext } from '../../validation-context.js';

export function AuthenticatedRule(context: SubgraphValidationContext): ASTVisitor {
  return {
    DirectiveDefinition(node) {
      validateDirectiveAgainstOriginal(node, 'authenticated', context);
    },
    Directive(node) {
      if (!context.isAvailableFederationDirective('authenticated', node)) {
        return;
      }

      context.reportError(
        new GraphQLError(`@authenticated is not yet supported`, {
          extensions: { code: 'UNSUPPORTED_FEATURE' },
        }),
      );
    },
  };
}
