import { DefinitionNode, DirectiveDefinitionNode, DocumentNode, Kind, visit } from 'graphql';

export function isDirectiveDefinition(node: DefinitionNode): node is DirectiveDefinitionNode {
  return node.kind === Kind.DIRECTIVE_DEFINITION;
}

export function stripFederationFromSupergraph(supergraph: DocumentNode) {
  function remove() {
    return null;
  }

  return visit(supergraph, {
    DirectiveDefinition: remove,
    Directive: remove,
    SchemaDefinition: remove,
    SchemaExtension: remove,
    EnumTypeDefinition: node => {
      if (
        node.name.value === 'core__Purpose' ||
        node.name.value === 'join__Graph' ||
        node.name.value === 'link__Purpose'
      ) {
        return null;
      }

      return node;
    },
    ScalarTypeDefinition: node => {
      if (
        node.name.value === '_FieldSet' ||
        node.name.value === 'link__Import' ||
        node.name.value === 'join__FieldSet'
      ) {
        return null;
      }

      return node;
    },
  });
}
