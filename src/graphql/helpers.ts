import {
  DefinitionNode,
  DirectiveDefinitionNode,
  DocumentNode,
  Kind,
  specifiedDirectives,
  visit,
} from 'graphql';

export function isDirectiveDefinition(node: DefinitionNode): node is DirectiveDefinitionNode {
  return node.kind === Kind.DIRECTIVE_DEFINITION;
}

export function stripFederationFromSupergraph(supergraph: DocumentNode) {
  function removeDirective(node: {
    name: {
      value: string;
    };
  }) {
    const directiveName = node.name.value;
    const isSpecifiedDirective = specifiedDirectives.some(d => d.name === directiveName);
    if (!isSpecifiedDirective) {
      const isFederationDirective =
        directiveName === 'link' ||
        directiveName === 'inaccessible' ||
        directiveName === 'tag' ||
        directiveName === 'join__graph' ||
        directiveName === 'join__type' ||
        directiveName === 'join__implements' ||
        directiveName === 'join__unionMember' ||
        directiveName === 'join__enumValue' ||
        directiveName === 'join__field';

      if (isFederationDirective) {
        return null;
      }
    }
  }

  return visit(supergraph, {
    DirectiveDefinition: removeDirective,
    Directive: removeDirective,
    SchemaDefinition() {
      return null;
    },
    SchemaExtension() {
      return null;
    },
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
