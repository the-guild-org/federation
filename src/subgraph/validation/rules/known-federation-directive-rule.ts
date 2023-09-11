import { ASTVisitor, GraphQLError, Kind } from 'graphql';
import type { SubgraphValidationContext } from '../validation-context.js';

export function KnownFederationDirectivesRule(context: SubgraphValidationContext): ASTVisitor {
  const availableDirectivesSet = new Set<string>();
  const knownDirectivesSet = new Set<string>();

  const knownDirectives = context.getKnownFederationDirectives();
  for (const directive of knownDirectives) {
    knownDirectivesSet.add(directive.name.value);
  }

  const availableDirectives = context.getAvailableFederationDirectives();
  for (const directive of availableDirectives) {
    availableDirectivesSet.add(directive.name.value);
  }

  const astDefinitions = context.getDocument().definitions;
  for (const def of astDefinitions) {
    if (def.kind === Kind.DIRECTIVE_DEFINITION) {
      availableDirectivesSet.add(def.name.value);
    }
  }

  return {
    Directive(node) {
      const name = node.name.value;

      if (
        !availableDirectivesSet.has(name) &&
        knownDirectivesSet.has(name) &&
        !name.startsWith('federation__')
      ) {
        context.reportError(
          new GraphQLError(
            `Unknown directive "@${name}". If you meant the "@${name}" federation directive, you should use fully-qualified name "@federation__${name}" or add "@${name}" to the \`import\` argument of the @link to the federation specification.`,
            { nodes: node, extensions: { code: 'INVALID_GRAPHQL' } },
          ),
        );
        return;
      }
    },
  };
}
