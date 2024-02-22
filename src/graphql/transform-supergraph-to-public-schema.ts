import {
  Kind,
  specifiedDirectives as specifiedDirectivesArray,
  visit,
  type ConstDirectiveNode,
  type DirectiveDefinitionNode,
  type DirectiveNode,
  type DocumentNode,
  type SchemaDefinitionNode,
} from 'graphql';

export const federationScalars = new Set([
  '_FieldSet',
  'link__Import',
  'join__FieldSet',
  'join__DirectiveArguments',
  'policy__Policy',
  'requiresScopes__Scope',
]);
export const federationEnums = new Set(['core__Purpose', 'join__Graph', 'link__Purpose']);
export const federationDirectives = new Set([
  'link',
  'core',
  'tag',
  'join__graph',
  'join__type',
  'join__owner',
  'join__implements',
  'join__unionMember',
  'join__directive',
  'join__enumValue',
  'join__field',
  'inaccessible',
]);
const specifiedDirectives = new Set(specifiedDirectivesArray.map(d => d.name));

function getAdditionalDirectivesToStrip(documentNode: DocumentNode) {
  const schemaDefinitionNode = documentNode.definitions.find(
    (node): node is SchemaDefinitionNode => node.kind === Kind.SCHEMA_DEFINITION,
  );
  if (!schemaDefinitionNode?.directives?.length) {
    return null;
  }

  const additionalDirectivesToStrip = new Set<string>();
  for (const directive of schemaDefinitionNode.directives) {
    if (directive.name.value !== 'link') {
      continue;
    }
    const asArg = directive.arguments?.find(arg => arg.name.value === 'as');

    if (asArg?.value.kind === Kind.STRING) {
      additionalDirectivesToStrip.add(asArg.value.value);
    }
  }

  return additionalDirectivesToStrip;
}

const federationInaccessibleDirectiveUrlPrefix = 'https://specs.apollo.dev/inaccessible';

function getInaccessibleDirectiveName(documentNode: DocumentNode) {
  const schemaDefinitionNode = documentNode.definitions.find(
    (node): node is SchemaDefinitionNode => node.kind === Kind.SCHEMA_DEFINITION,
  );
  if (schemaDefinitionNode?.directives?.length) {
    for (const directive of schemaDefinitionNode.directives) {
      if (directive.name.value !== 'link') {
        continue;
      }
      const urlArg = directive.arguments?.find(arg => arg.name.value === 'url');
      const asArg = directive.arguments?.find(arg => arg.name.value === 'as');

      if (
        urlArg?.value.kind === Kind.STRING &&
        urlArg.value.value.startsWith(federationInaccessibleDirectiveUrlPrefix)
      ) {
        if (asArg?.value.kind === Kind.STRING) {
          return asArg.value.value;
        }
        break;
      }
    }
  }

  return 'inaccessible';
}

/** Transform a supergraph document node to the public API schema, as served by a gateway. */
export function transformSupergraphToPublicSchema(documentNode: DocumentNode): DocumentNode {
  const additionalFederationDirectives = getAdditionalDirectivesToStrip(documentNode);
  const inaccessibleDirectiveName = getInaccessibleDirectiveName(documentNode);

  function removeFederationOrSpecifiedDirectives(
    node: DirectiveDefinitionNode | DirectiveNode,
  ): null | undefined {
    if (
      federationDirectives.has(node.name.value) ||
      additionalFederationDirectives?.has(node.name.value) ||
      (node.kind === Kind.DIRECTIVE_DEFINITION && specifiedDirectives.has(node.name.value))
    ) {
      return null;
    }
  }

  function hasInaccessibleDirective(node: { directives?: readonly ConstDirectiveNode[] }) {
    return node.directives?.some(d => d.name.value === inaccessibleDirectiveName);
  }

  function removeInaccessibleNode(node: { directives?: readonly ConstDirectiveNode[] }) {
    if (hasInaccessibleDirective(node)) {
      return null;
    }
  }

  return visit(documentNode, {
    [Kind.DIRECTIVE_DEFINITION]: removeFederationOrSpecifiedDirectives,
    [Kind.DIRECTIVE]: removeFederationOrSpecifiedDirectives,
    [Kind.SCHEMA_EXTENSION]: () => null,
    [Kind.SCHEMA_DEFINITION]: () => null,
    [Kind.SCALAR_TYPE_DEFINITION](node) {
      if (federationScalars.has(node.name.value) || hasInaccessibleDirective(node)) {
        return null;
      }
    },
    [Kind.ENUM_TYPE_DEFINITION](node) {
      if (federationEnums.has(node.name.value) || hasInaccessibleDirective(node)) {
        return null;
      }
    },
    [Kind.OBJECT_TYPE_DEFINITION]: removeInaccessibleNode,
    [Kind.FIELD_DEFINITION]: removeInaccessibleNode,
    [Kind.INTERFACE_TYPE_DEFINITION]: removeInaccessibleNode,
    [Kind.UNION_TYPE_DEFINITION]: removeInaccessibleNode,
    [Kind.INPUT_OBJECT_TYPE_DEFINITION]: removeInaccessibleNode,
    [Kind.INPUT_VALUE_DEFINITION]: removeInaccessibleNode,
  });
}
