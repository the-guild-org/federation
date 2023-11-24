import { Kind, type DefinitionNode, type DirectiveDefinitionNode } from 'graphql';

export function isDirectiveDefinition(node: DefinitionNode): node is DirectiveDefinitionNode {
  return node.kind === Kind.DIRECTIVE_DEFINITION;
}
