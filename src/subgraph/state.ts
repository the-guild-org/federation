import {
  ASTNode,
  ASTVisitor,
  DirectiveNode,
  DocumentNode,
  EnumTypeDefinitionNode,
  EnumTypeExtensionNode,
  Kind,
  OperationTypeNode,
  SchemaDefinitionNode,
  specifiedDirectives as specifiedDirectiveTypes,
  specifiedScalarTypes,
  TypeNode,
} from 'graphql';
import { print } from '../graphql/printer.js';
import { TypeNodeInfo } from '../graphql/type-node-info.js';
import {
  FederationImports,
  FederationVersion,
  isFederationLink,
} from '../specifications/federation.js';
import { Link } from '../specifications/link.js';
import { printOutputType } from './helpers.js';

export type SubgraphType =
  | ObjectType
  | InterfaceType
  | InputObjectType
  | UnionType
  | EnumType
  | ScalarType
  | Directive;

export enum TypeKind {
  OBJECT = 'OBJECT',
  INTERFACE = 'INTERFACE',
  ENUM = 'ENUM',
  UNION = 'UNION',
  SCALAR = 'SCALAR',
  INPUT_OBJECT = 'INPUT_OBJECT',
  DIRECTIVE = 'DIRECTIVE',
}

type SubgraphID = string;

export interface Directive {
  kind: TypeKind.DIRECTIVE;
  name: string;
  /**
   * Marked by @composeDirective directive as a composed directive.
   */
  composed: boolean;
  repeatable: boolean;
  locations: Set<string>;
  args: Map<string, Argument>;
}

export interface ScalarType {
  kind: TypeKind.SCALAR;
  name: string;
  inaccessible: boolean;
  policies: string[][];
  scopes: string[][];
  authenticated: boolean;
  tags: Set<string>;
  description?: Description;
  specifiedBy?: string;
  ast: {
    directives: DirectiveNode[];
  };
}

export interface ObjectType {
  kind: TypeKind.OBJECT;
  name: string;
  fields: Map<string, Field>;
  extension: boolean;
  extensionType?: '@extends' | 'extend';
  external: boolean;
  keys: Key[];
  fieldsUsedAsKeys: Set<string>;
  inaccessible: boolean;
  authenticated: boolean;
  policies: string[][];
  scopes: string[][];
  shareable: boolean;
  tags: Set<string>;
  interfaces: Set<string>;
  isDefinition: boolean;
  description?: Description;
  deprecated?: Deprecated;
  ast: {
    directives: DirectiveNode[];
  };
  interfaceObjectTypeName?: string; // added for @interfaceObject (trkohler)
}

export interface InterfaceType {
  kind: TypeKind.INTERFACE;
  name: string;
  fields: Map<string, Field>;
  extension: boolean;
  keys: Key[];
  inaccessible: boolean;
  authenticated: boolean;
  policies: string[][];
  scopes: string[][];
  tags: Set<string>;
  interfaces: Set<string>;
  isDefinition: boolean;
  description?: Description;
  implementedBy: Set<string>;
  interfaceObjects: Map<SubgraphID, ObjectType>; // added for @interfaceObject (trkohler)
  ast: {
    directives: DirectiveNode[];
  };
}

export interface InputObjectType {
  kind: TypeKind.INPUT_OBJECT;
  name: string;
  fields: Map<string, InputField>;
  extension: boolean;
  inaccessible: boolean;
  tags: Set<string>;
  isDefinition: boolean;
  description?: Description;
}

export interface UnionType {
  kind: TypeKind.UNION;
  name: string;
  members: Set<string>;
  tags: Set<string>;
  inaccessible: boolean;
  isDefinition: boolean;
  description?: Description;
}

export interface EnumType {
  kind: TypeKind.ENUM;
  name: string;
  values: Map<string, EnumValue>;
  inaccessible: boolean;
  authenticated: boolean;
  policies: string[][];
  scopes: string[][];
  tags: Set<string>;
  isDefinition: boolean;
  description?: Description;
  referencedByInputType: boolean;
  referencedByOutputType: boolean;
  inputTypeReferences: Set<string>;
  outputTypeReferences: Set<string>;
}

export interface Field {
  name: string;
  type: string;
  args: Map<string, Argument>;
  external: boolean;
  inaccessible: boolean;
  authenticated: boolean;
  policies: string[][];
  scopes: string[][];
  override: string | null;
  provides: string | null;
  requires: string | null;
  extension: boolean;
  required: boolean;
  provided: boolean;
  shareable: boolean;
  used: boolean;
  tags: Set<string>;
  description?: Description;
  deprecated?: Deprecated;
  ast: {
    directives: DirectiveNode[];
  };
}

export interface InputField {
  name: string;
  type: string;
  inaccessible: boolean;
  tags: Set<string>;
  defaultValue?: string;
  description?: Description;
  deprecated?: Deprecated;
}

export interface EnumValue {
  name: string;
  inaccessible: boolean;
  tags: Set<string>;
  description?: Description;
  deprecated?: Deprecated;
}

export interface Argument {
  name: string;
  type: string;
  inaccessible: boolean;
  tags: Set<string>;
  defaultValue?: string;
  description?: Description;
  deprecated?: Deprecated;
  ast: {
    directives: DirectiveNode[];
  };
}

export interface Key {
  fields: string;
  resolvable: boolean;
}

export interface Description {
  value: string;
  block: boolean;
}

export interface Deprecated {
  reason?: string;
  deprecated: true;
}

export interface SubgraphState {
  graph: {
    id: string;
    name: string;
    version: FederationVersion;
    // added imports to check for @interfaceObject (trkohler)
    imports: FederationImports;
    url?: string;
  };
  /**
   * [typeName, Type]
   */
  types: Map<string, SubgraphType>;
  /**
   * If an operation types is defined, it means that the subgraph provides a that type.
   * It's helpful to detect if Query, Mutation or Subscription are provided by the subgraph.
   */
  schema: {
    // TODO: T05 make sure `RootQuery` is treated as `Query` when running validations or merging subgraphs into supergraph
    queryType?: string;
    mutationType?: string;
    subscriptionType?: string;
  };
  links: readonly Link[];
  specs: {
    tag: boolean;
    inaccessible: boolean;
    link: boolean;
    policy: boolean;
    requiresScopes: boolean;
    authenticated: boolean;
  };
  version: FederationVersion;
}

const MISSING = 'MISSING';

export type SubgraphStateBuilder = ReturnType<typeof createSubgraphStateBuilder>;

export function createSubgraphStateBuilder(
  graph: { id: string; name: string; url?: string },
  typeDefs: DocumentNode,
  version: FederationVersion,
  imports: FederationImports,
  links: readonly Link[],
) {
  const linksWithDirective = links.filter(
    // Reject federation links and links without directives
    link => !isFederationLink(link) && link.imports.some(im => im.kind === 'directive'),
  );
  const isLinkSpecManuallyProvided = typeDefs.definitions.some(
    def =>
      def.kind === Kind.DIRECTIVE_DEFINITION &&
      def.name.value === 'link' &&
      def.locations.every(loc => loc.value === 'SCHEMA'),
  );
  const specifiedScalars = specifiedScalarTypes.map(type => type.name);
  const specifiedDirectives = specifiedDirectiveTypes.map(directive => directive.name);
  const state: SubgraphState = {
    graph: {
      ...graph,
      version,
      imports,
    },
    types: new Map<string, SubgraphType>(),
    schema: {},
    links: linksWithDirective,
    specs: {
      tag: false,
      inaccessible: false,
      authenticated: false,
      requiresScopes: false,
      policy: false,
      link: isLinkSpecManuallyProvided,
    },
    version,
  };

  const schemaDef = typeDefs.definitions.find(isSchemaDefinition);

  const expectedQueryTypeName = decideOnRootTypeName(schemaDef, OperationTypeNode.QUERY, 'Query');
  const expectedMutationTypeName = decideOnRootTypeName(
    schemaDef,
    OperationTypeNode.MUTATION,
    'Mutation',
  );
  const expectedSubscriptionTypeName = decideOnRootTypeName(
    schemaDef,
    OperationTypeNode.SUBSCRIPTION,
    'Subscription',
  );

  /**
   * A set of directive names that are marked as composed directives
   */
  const composedDirectives = new Set<string>();

  const directiveBuilder = directiveFactory(state);
  const scalarTypeBuilder = scalarTypeFactory(state);
  const objectTypeBuilder = objectTypeFactory(state, renameObjectType);
  const interfaceTypeBuilder = interfaceTypeFactory(state);
  const inputObjectTypeBuilder = inputObjectTypeFactory(state);
  const unionTypeBuilder = unionTypeFactory(state);
  const enumTypeBuilder = enumTypeFactory(state);

  function renameObjectType(typeName: string) {
    if (typeName === expectedQueryTypeName) {
      return 'Query';
    }

    if (typeName === expectedMutationTypeName) {
      return 'Mutation';
    }

    if (typeName === expectedSubscriptionTypeName) {
      return 'Subscription';
    }

    return typeName;
  }

  return {
    directive: directiveBuilder,
    scalarType: scalarTypeBuilder,
    objectType: objectTypeBuilder,
    interfaceType: interfaceTypeBuilder,
    inputObjectType: inputObjectTypeBuilder,
    unionType: unionTypeBuilder,
    enumType: enumTypeBuilder,
    composedDirectives,
    state,
    markSpecAsUsed(specName: keyof SubgraphState['specs']) {
      state.specs[specName] = true;
    },
    visitor(typeNodeInfo: TypeNodeInfo): ASTVisitor {
      const enumTypes = typeDefs.definitions.filter(isEnumType);
      const enumTypesByName = new Set(
        enumTypes ? enumTypes.map(enumType => enumType.name.value) : [],
      );

      return {
        FieldDefinition(node) {
          const typeDef = typeNodeInfo.getTypeDef();

          if (!typeDef) {
            throw new Error(`Expected to find a type definition or extension`);
          }

          const isInterfaceType =
            typeDef.kind === Kind.INTERFACE_TYPE_DEFINITION ||
            typeDef.kind === Kind.INTERFACE_TYPE_EXTENSION;
          const isObjectType =
            typeDef.kind === Kind.OBJECT_TYPE_DEFINITION ||
            typeDef.kind === Kind.OBJECT_TYPE_EXTENSION;

          const outputTypeName = resolveTypeName(node.type);
          const referencesEnumType = enumTypesByName.has(outputTypeName);

          if (referencesEnumType) {
            enumTypeBuilder.setReferencedByOutputType(
              outputTypeName,
              `${typeDef.name.value}.${node.name.value}`,
            );
          }

          if (isInterfaceType) {
            interfaceTypeBuilder.field.setType(
              typeDef.name.value,
              node.name.value,
              printOutputType(node.type),
            );

            return;
          }

          if (!isObjectType) {
            throw new Error(`Expected to find an object type`);
          }

          objectTypeBuilder.field.setType(
            typeDef.name.value,
            node.name.value,
            printOutputType(node.type),
          );

          if (typeDef.kind === Kind.OBJECT_TYPE_EXTENSION /* TODO:  || has @extends */) {
            objectTypeBuilder.field.setExtension(typeDef.name.value, node.name.value);
          }

          // In Federation v1, all fields are shareable by default, but only in object type definition.
          // Extensions are not shareable.
          // The exception are root types, all their fields are shareable.
          if (
            version === 'v1.0' &&
            (typeDef.kind === Kind.OBJECT_TYPE_DEFINITION ||
              typeDef.name.value === expectedQueryTypeName ||
              typeDef.name.value === expectedMutationTypeName ||
              typeDef.name.value === expectedSubscriptionTypeName)
          ) {
            objectTypeBuilder.field.setShareable(typeDef.name.value, node.name.value);
          }
        },
        InputValueDefinition(node) {
          const typeDef = typeNodeInfo.getTypeDef();
          const fieldDef = typeNodeInfo.getFieldDef();

          if (!typeDef) {
            return;
          }

          const isInputObjectType =
            typeDef.kind === Kind.INPUT_OBJECT_TYPE_DEFINITION ||
            typeDef.kind === Kind.INPUT_OBJECT_TYPE_EXTENSION;
          const isObjectType =
            typeDef.kind === Kind.OBJECT_TYPE_DEFINITION ||
            typeDef.kind === Kind.OBJECT_TYPE_EXTENSION;
          const isInterfaceType =
            typeDef.kind === Kind.INTERFACE_TYPE_DEFINITION ||
            typeDef.kind === Kind.INTERFACE_TYPE_EXTENSION;

          const outputTypeName = resolveTypeName(node.type);
          const referencesEnumType = enumTypesByName.has(outputTypeName);

          if (isInputObjectType) {
            inputObjectTypeBuilder.field.setType(
              typeDef.name.value,
              node.name.value,
              printOutputType(node.type),
            );

            if (referencesEnumType) {
              enumTypeBuilder.setReferencedByInputType(
                outputTypeName,
                `${typeDef.name.value}.${node.name.value}`,
              );
            }

            if (node.defaultValue) {
              inputObjectTypeBuilder.field.setDefaultValue(
                typeDef.name.value,
                node.name.value,
                print(node.defaultValue),
              );
            }
          }

          if (isObjectType && fieldDef) {
            // It's a field argument
            objectTypeBuilder.field.arg.setType(
              typeDef.name.value,
              fieldDef.name.value,
              node.name.value,
              printOutputType(node.type),
            );

            if (node.defaultValue) {
              objectTypeBuilder.field.arg.setDefaultValue(
                typeDef.name.value,
                fieldDef.name.value,
                node.name.value,
                print(node.defaultValue),
              );
            }

            if (referencesEnumType) {
              enumTypeBuilder.setReferencedByInputType(
                outputTypeName,
                `${typeDef.name.value}.${fieldDef.name.value}(${node.name.value}:)`,
              );
            }
          }

          if (isInterfaceType && fieldDef) {
            // It's a field argument
            interfaceTypeBuilder.field.arg.setType(
              typeDef.name.value,
              fieldDef.name.value,
              node.name.value,
              printOutputType(node.type),
            );

            if (node.defaultValue) {
              interfaceTypeBuilder.field.arg.setDefaultValue(
                typeDef.name.value,
                fieldDef.name.value,
                node.name.value,
                print(node.defaultValue),
              );
            }
          }
        },
        ObjectTypeDefinition(node) {
          objectTypeBuilder.setDefinition(node.name.value);

          // Set query, mutation or subscription types as found in the schema
          if (node.name.value === expectedQueryTypeName) {
            state.schema.queryType = renameObjectType(node.name.value);
          } else if (node.name.value === expectedMutationTypeName) {
            state.schema.mutationType = renameObjectType(node.name.value);
          } else if (node.name.value === expectedSubscriptionTypeName) {
            state.schema.subscriptionType = renameObjectType(node.name.value);
          }

          if (node.interfaces) {
            for (const interfaceNode of node.interfaces) {
              objectTypeBuilder.setInterface(node.name.value, interfaceNode.name.value);
            }
          }
        },
        ObjectTypeExtension(node) {
          // Set query, mutation or subscription types as found in the schema
          if (node.name.value === expectedQueryTypeName) {
            state.schema.queryType = renameObjectType(node.name.value);
          } else if (node.name.value === expectedMutationTypeName) {
            state.schema.mutationType = renameObjectType(node.name.value);
          } else if (node.name.value === expectedSubscriptionTypeName) {
            state.schema.subscriptionType = renameObjectType(node.name.value);
          }

          objectTypeBuilder.setExtension(node.name.value, 'extend');

          if (node.interfaces) {
            for (const interfaceNode of node.interfaces) {
              objectTypeBuilder.setInterface(node.name.value, interfaceNode.name.value);
            }
          }
        },
        InterfaceTypeDefinition(node) {
          interfaceTypeBuilder.setDefinition(node.name.value);

          if (node.interfaces) {
            for (const interfaceNode of node.interfaces) {
              interfaceTypeBuilder.setInterface(node.name.value, interfaceNode.name.value);
            }
          }
        },
        InterfaceTypeExtension(node) {
          if (version !== 'v1.0') {
            interfaceTypeBuilder.setExtension(node.name.value);
          }

          if (node.interfaces) {
            for (const interfaceNode of node.interfaces) {
              interfaceTypeBuilder.setInterface(node.name.value, interfaceNode.name.value);
            }
          }
        },
        UnionTypeDefinition(node) {
          unionTypeBuilder.setDefinition(node.name.value);
          if (node.types) {
            for (const member of node.types) {
              unionTypeBuilder.setMember(node.name.value, member.name.value);
            }
          }
        },
        UnionTypeExtension(node) {
          if (node.types) {
            for (const member of node.types) {
              unionTypeBuilder.setMember(node.name.value, member.name.value);
            }
          }
        },
        EnumTypeDefinition(node) {
          enumTypeBuilder.setDefinition(node.name.value);
        },
        EnumValueDefinition(node) {
          const typeDef = typeNodeInfo.getTypeDef();
          if (!typeDef) {
            return;
          }

          enumTypeBuilder.value.setValue(typeDef.name.value, node.name.value);
        },
        InputObjectTypeDefinition(node) {
          inputObjectTypeBuilder.setDefinition(node.name.value);
        },
        ScalarTypeDefinition(node) {
          if (!specifiedScalars.includes(node.name.value)) {
            scalarTypeBuilder.setDefinition(node.name.value);
          }
        },
        ScalarTypeExtension() {
          // TODO: T06 implement scalar type extension
        },
        Directive(node) {
          if (composedDirectives.has(node.name.value)) {
            const typeDef = typeNodeInfo.getTypeDef();
            const fieldDef = typeNodeInfo.getFieldDef();
            const argDef = typeNodeInfo.getArgumentDef();

            if (!typeDef) {
              return;
            }

            switch (typeDef.kind) {
              case Kind.OBJECT_TYPE_DEFINITION:
              case Kind.OBJECT_TYPE_EXTENSION:
                if (argDef) {
                  objectTypeBuilder.field.arg.setDirective(
                    typeDef.name.value,
                    fieldDef!.name.value,
                    argDef.name.value,
                    node,
                  );
                } else if (fieldDef) {
                  objectTypeBuilder.field.setDirective(
                    typeDef.name.value,
                    fieldDef.name.value,
                    node,
                  );
                } else {
                  objectTypeBuilder.setDirective(typeDef.name.value, node);
                  if (node.name.value == 'interfaceObject') {
                    objectTypeBuilder.setInterfaceObject(typeDef.name.value);
                  }
                }
                break;
              case Kind.INTERFACE_TYPE_DEFINITION:
              case Kind.INTERFACE_TYPE_EXTENSION:
                if (argDef) {
                  interfaceTypeBuilder.field.arg.setDirective(
                    typeDef.name.value,
                    fieldDef!.name.value,
                    argDef.name.value,
                    node,
                  );
                } else if (fieldDef) {
                  interfaceTypeBuilder.field.setDirective(
                    typeDef.name.value,
                    fieldDef.name.value,
                    node,
                  );
                } else {
                  interfaceTypeBuilder.setDirective(typeDef.name.value, node);
                }
                break;
              case Kind.SCALAR_TYPE_DEFINITION:
              case Kind.SCALAR_TYPE_EXTENSION: {
                scalarTypeBuilder.setDirective(typeDef.name.value, node);
                break;
              }
              case Kind.DIRECTIVE_DEFINITION: {
                if (fieldDef) {
                  directiveBuilder.arg.setDirective(typeDef.name.value, fieldDef!.name.value, node);
                }
                break;
              }
              default:
                // TODO: T07 support directives on other locations than OBJECT, FIELD_DEFINITION, ARGUMENT_DEFINITION
                throw new Error(`Directives on "${typeDef.kind}" types are not supported yet`);
            }
          } else if (node.name.value === 'specifiedBy') {
            const typeDef = typeNodeInfo.getTypeDef();
            if (
              typeDef &&
              (typeDef.kind === Kind.SCALAR_TYPE_DEFINITION ||
                typeDef.kind === Kind.SCALAR_TYPE_EXTENSION)
            ) {
              const urlValue = node.arguments?.find(arg => arg.name.value === 'url')?.value;
              if (urlValue?.kind === Kind.STRING) {
                scalarTypeBuilder.setSpecifiedBy(typeDef.name.value, urlValue.value);
              }
            }
          } else if (node.name.value === 'deprecated') {
            const typeDef = typeNodeInfo.getTypeDef();
            const fieldDef = typeNodeInfo.getFieldDef();
            const argDef = typeNodeInfo.getArgumentDef();

            if (!typeDef) {
              return;
            }

            const reasonValue = node.arguments?.find(arg => arg.name.value === 'reason')?.value;
            const reason = reasonValue?.kind === Kind.STRING ? reasonValue.value : undefined;

            switch (typeDef.kind) {
              case Kind.OBJECT_TYPE_DEFINITION:
              case Kind.OBJECT_TYPE_EXTENSION: {
                if (!fieldDef) {
                  return;
                }

                if (argDef) {
                  objectTypeBuilder.field.arg.setDeprecated(
                    typeDef.name.value,
                    fieldDef.name.value,
                    argDef.name.value,
                    reason,
                  );
                } else {
                  objectTypeBuilder.field.setDeprecated(
                    typeDef.name.value,
                    fieldDef.name.value,
                    reason,
                  );
                }

                break;
              }
              case Kind.INTERFACE_TYPE_DEFINITION:
              case Kind.INTERFACE_TYPE_EXTENSION: {
                if (!fieldDef) {
                  return;
                }

                if (argDef) {
                  interfaceTypeBuilder.field.arg.setDeprecated(
                    typeDef.name.value,
                    fieldDef.name.value,
                    argDef.name.value,
                    reason,
                  );
                } else {
                  interfaceTypeBuilder.field.setDeprecated(
                    typeDef.name.value,
                    fieldDef.name.value,
                    reason,
                  );
                }

                break;
              }
              case Kind.ENUM_TYPE_DEFINITION:
              case Kind.ENUM_TYPE_EXTENSION: {
                const valueDef = typeNodeInfo.getValueDef();

                if (!valueDef) {
                  return;
                }

                enumTypeBuilder.value.setDeprecated(
                  typeDef.name.value,
                  valueDef.name.value,
                  reason,
                );

                break;
              }
              case Kind.INPUT_OBJECT_TYPE_DEFINITION:
              case Kind.INPUT_OBJECT_TYPE_EXTENSION: {
                if (!fieldDef) {
                  return;
                }

                inputObjectTypeBuilder.field.setDeprecated(
                  typeDef.name.value,
                  fieldDef.name.value,
                  reason,
                );

                break;
              }
            }
          } else if (node.name.value == 'interfaceObject') {
            const typeDef = typeNodeInfo.getTypeDef();
            if (typeDef && typeDef.kind === Kind.OBJECT_TYPE_DEFINITION) {
              objectTypeBuilder.setInterfaceObject(typeDef.name.value);
            }
          }
        },
        DirectiveDefinition(node) {
          const directiveName = node.name.value;

          if (specifiedDirectives.includes(directiveName)) {
            return;
          }

          if (node.repeatable) {
            directiveBuilder.setRepeatable(directiveName);
          }

          if (node.locations) {
            for (const location of node.locations) {
              directiveBuilder.setLocation(directiveName, location.value);
            }
          }

          if (node.arguments?.length) {
            for (const arg of node.arguments) {
              directiveBuilder.arg.setType(
                directiveName,
                arg.name.value,
                printOutputType(arg.type),
              );

              if (typeof arg.defaultValue !== 'undefined') {
                directiveBuilder.arg.setDefaultValue(
                  directiveName,
                  arg.name.value,
                  print(arg.defaultValue),
                );
              }
            }
          }
        },
        StringValue(node, _, parent) {
          const typeDef = typeNodeInfo.getTypeDef();
          const fieldDef = typeNodeInfo.getFieldDef();
          const argDef = typeNodeInfo.getArgumentDef();

          const description = {
            value: node.value,
            block: node.block === true,
          };

          if (parent && 'kind' in parent) {
            if (
              parent.kind === Kind.SCALAR_TYPE_DEFINITION ||
              parent.kind === Kind.SCALAR_TYPE_EXTENSION
            ) {
              scalarTypeBuilder.setDescription(parent.name.value, description);
            }

            if (
              parent.kind === Kind.INPUT_VALUE_DEFINITION &&
              parent.defaultValue?.kind === Kind.STRING &&
              parent.defaultValue === node
            ) {
              // It seems like StringValue comes from a default value. Ignore it.
              return;
            }
          }

          if (!typeDef) {
            return;
          }

          function matchesParent(node: any) {
            return node === parent;
          }

          switch (typeDef.kind) {
            case Kind.OBJECT_TYPE_DEFINITION:
            case Kind.OBJECT_TYPE_EXTENSION: {
              if (argDef && matchesParent(argDef)) {
                objectTypeBuilder.field.arg.setDescription(
                  typeDef.name.value,
                  fieldDef!.name.value,
                  argDef.name.value,
                  description,
                );
              } else if (fieldDef && matchesParent(fieldDef)) {
                objectTypeBuilder.field.setDescription(
                  typeDef.name.value,
                  fieldDef.name.value,
                  description,
                );
              } else if (matchesParent(typeDef)) {
                objectTypeBuilder.setDescription(typeDef.name.value, description);
              }
              break;
            }
            case Kind.INTERFACE_TYPE_DEFINITION:
            case Kind.INTERFACE_TYPE_EXTENSION: {
              if (argDef && matchesParent(argDef)) {
                interfaceTypeBuilder.field.arg.setDescription(
                  typeDef.name.value,
                  fieldDef!.name.value,
                  argDef.name.value,
                  description,
                );
              } else if (fieldDef && matchesParent(fieldDef)) {
                interfaceTypeBuilder.field.setDescription(
                  typeDef.name.value,
                  fieldDef.name.value,
                  description,
                );
              } else if (matchesParent(typeDef)) {
                interfaceTypeBuilder.setDescription(typeDef.name.value, description);
              }
              break;
            }
            case Kind.INPUT_OBJECT_TYPE_DEFINITION:
            case Kind.INPUT_OBJECT_TYPE_EXTENSION: {
              if (fieldDef && matchesParent(fieldDef)) {
                inputObjectTypeBuilder.field.setDescription(
                  typeDef.name.value,
                  fieldDef.name.value,
                  description,
                );
              } else if (matchesParent(typeDef)) {
                inputObjectTypeBuilder.setDescription(typeDef.name.value, description);
              }
              break;
            }
            case Kind.ENUM_TYPE_DEFINITION:
            case Kind.ENUM_TYPE_EXTENSION: {
              if (parent && 'kind' in parent && parent.kind === Kind.ENUM_VALUE_DEFINITION) {
                enumTypeBuilder.value.setDescription(
                  typeDef.name.value,
                  parent.name.value,
                  description,
                );
              } else if (matchesParent(typeDef)) {
                enumTypeBuilder.setDescription(typeDef.name.value, description);
              }
              break;
            }
            case Kind.UNION_TYPE_DEFINITION:
            case Kind.UNION_TYPE_EXTENSION: {
              if (matchesParent(typeDef)) {
                unionTypeBuilder.setDescription(typeDef.name.value, description);
              }
              break;
            }
          }
        },
      };
    },
  };
}

function directiveFactory(state: SubgraphState) {
  return {
    setComposed(directiveName: string) {
      getOrCreateDirective(state, directiveName).composed = true;
    },
    setLocation(directiveName: string, location: string) {
      getOrCreateDirective(state, directiveName).locations.add(location);
    },
    setRepeatable(directiveName: string) {
      getOrCreateDirective(state, directiveName).repeatable = true;
    },
    arg: {
      setTag(directiveName: string, argName: string, tag: string) {
        getOrCreateDirectiveArg(state, directiveName, argName).tags.add(tag);
      },
      setType(directiveName: string, argName: string, argType: string) {
        getOrCreateDirectiveArg(state, directiveName, argName).type = argType;
      },
      setDirective(typeName: string, argName: string, directive: DirectiveNode) {
        getOrCreateDirectiveArg(state, typeName, argName).ast.directives.push(directive);
      },
      setDefaultValue(typeName: string, argName: string, defaultValue: string) {
        getOrCreateDirectiveArg(state, typeName, argName).defaultValue = defaultValue;
      },
      setInaccessible(typeName: string, argName: string) {
        getOrCreateDirectiveArg(state, typeName, argName).inaccessible = true;
      },
    },
  };
}

/**
 * Removes some types that are specific to the federation spec.
 */
export function cleanSubgraphStateFromFederationSpec(state: SubgraphState): SubgraphState {
  state.types.delete('_FieldSet');
  state.types.delete('federation__FieldSet');

  return state;
}

/**
 * Removes all types that are specific to the link spec.
 */
export function cleanSubgraphStateFromLinkSpec(state: SubgraphState): SubgraphState {
  state.types.delete('link__Import');
  state.types.delete('link__Purpose');
  state.types.delete('link__Import');
  state.types.delete('link');

  return state;
}

function scalarTypeFactory(state: SubgraphState) {
  return {
    setDefinition(typeName: string) {
      getOrCreateScalarType(state, typeName);
    },
    setInaccessible(typeName: string) {
      getOrCreateScalarType(state, typeName).inaccessible = true;
    },
    setAuthenticated(typeName: string) {
      getOrCreateScalarType(state, typeName).authenticated = true;
    },
    setPolicies(typeName: string, policies: string[][]) {
      getOrCreateScalarType(state, typeName).policies.push(...policies);
    },
    setScopes(typeName: string, scopes: string[][]) {
      getOrCreateScalarType(state, typeName).scopes.push(...scopes);
    },
    setTag(typeName: string, tag: string) {
      getOrCreateScalarType(state, typeName).tags.add(tag);
    },
    setDirective(typeName: string, directive: DirectiveNode) {
      getOrCreateScalarType(state, typeName).ast.directives.push(directive);
    },
    setDescription(typeName: string, description: Description) {
      getOrCreateScalarType(state, typeName).description = description;
    },
    setSpecifiedBy(typeName: string, url: string) {
      getOrCreateScalarType(state, typeName).specifiedBy = url;
    },
  };
}

function objectTypeFactory(state: SubgraphState, renameObject: (typeName: string) => string) {
  return {
    setDefinition(typeName: string) {
      getOrCreateObjectType(state, renameObject, typeName).isDefinition = true;
    },
    setExtension(typeName: string, extensionType: '@extends' | 'extend') {
      const objectType = getOrCreateObjectType(state, renameObject, typeName);
      objectType.extension = true;
      if (objectType.extensionType !== '@extends') {
        objectType.extensionType = extensionType;
      }
    },
    setDescription(typeName: string, description: Description) {
      getOrCreateObjectType(state, renameObject, typeName).description = description;
    },
    setExternal(typeName: string) {
      const objectType = getOrCreateObjectType(state, renameObject, typeName);
      objectType.external = true;

      for (const field of objectType.fields.values()) {
        field.external = true;
      }
    },
    setInterface(typeName: string, interfaceName: string) {
      getOrCreateObjectType(state, renameObject, typeName).interfaces.add(interfaceName);
      getOrCreateInterfaceType(state, interfaceName).implementedBy.add(typeName);
    },
    setKey(typeName: string, fields: string, fieldsUsedInKey: Set<string>, resolvable: boolean) {
      const objectType = getOrCreateObjectType(state, renameObject, typeName);
      objectType.keys.push({ fields, resolvable });

      for (const field of fieldsUsedInKey) {
        objectType.fieldsUsedAsKeys.add(field);
      }
    },
    setInaccessible(typeName: string) {
      const objectType = getOrCreateObjectType(state, renameObject, typeName);
      objectType.inaccessible = true;

      // for (const field of objectType.fields.values()) {
      //   field.inaccessible = true;
      // }
    },
    setAuthenticated(typeName: string) {
      const objectType = getOrCreateObjectType(state, renameObject, typeName);
      objectType.authenticated = true;
    },
    setPolicies(typeName: string, policies: string[][]) {
      getOrCreateObjectType(state, renameObject, typeName).policies.push(...policies);
    },
    setScopes(typeName: string, scopes: string[][]) {
      getOrCreateObjectType(state, renameObject, typeName).scopes.push(...scopes);
    },
    setShareable(typeName: string) {
      getOrCreateObjectType(state, renameObject, typeName).shareable = true;
    },
    setTag(typeName: string, tag: string) {
      getOrCreateObjectType(state, renameObject, typeName).tags.add(tag);
    },
    setDirective(typeName: string, directive: DirectiveNode) {
      getOrCreateObjectType(state, renameObject, typeName).ast.directives.push(directive);
    },
    field: {
      setType(typeName: string, fieldName: string, fieldType: string) {
        getOrCreateObjectField(state, renameObject, typeName, fieldName).type = fieldType;
      },
      setExtension(typeName: string, fieldName: string) {
        getOrCreateObjectField(state, renameObject, typeName, fieldName).extension = true;
      },
      setDirective(typeName: string, fieldName: string, directive: DirectiveNode) {
        getOrCreateObjectField(state, renameObject, typeName, fieldName).ast.directives.push(
          directive,
        );
      },
      setDescription(typeName: string, fieldName: string, description: Description) {
        getOrCreateObjectField(state, renameObject, typeName, fieldName).description = description;
      },
      setDeprecated(typeName: string, fieldName: string, reason?: string) {
        getOrCreateObjectField(state, renameObject, typeName, fieldName).deprecated = {
          reason,
          deprecated: true,
        };
      },
      setAuthenticated(typeName: string, fieldName: string) {
        getOrCreateObjectField(state, renameObject, typeName, fieldName).authenticated = true;
      },
      setPolicies(typeName: string, fieldName: string, policies: string[][]) {
        getOrCreateObjectField(state, renameObject, typeName, fieldName).policies.push(...policies);
      },
      setScopes(typeName: string, fieldName: string, scopes: string[][]) {
        getOrCreateObjectField(state, renameObject, typeName, fieldName).scopes.push(...scopes);
      },
      setExternal(typeName: string, fieldName: string) {
        getOrCreateObjectField(state, renameObject, typeName, fieldName).external = true;
      },
      setInaccessible(typeName: string, fieldName: string) {
        getOrCreateObjectField(state, renameObject, typeName, fieldName).inaccessible = true;
      },
      setOverride(typeName: string, fieldName: string, override: string) {
        getOrCreateObjectField(state, renameObject, typeName, fieldName).override = override;
      },
      setProvides(typeName: string, fieldName: string, provides: string) {
        getOrCreateObjectField(state, renameObject, typeName, fieldName).provides = provides;
      },
      setRequires(typeName: string, fieldName: string, requires: string) {
        getOrCreateObjectField(state, renameObject, typeName, fieldName).requires = requires;
      },
      markAsProvided(typeName: string, fieldName: string) {
        getOrCreateObjectField(state, renameObject, typeName, fieldName).provided = true;
      },
      markedAsRequired(typeName: string, fieldName: string) {
        getOrCreateObjectField(state, renameObject, typeName, fieldName).required = true;
      },
      setShareable(typeName: string, fieldName: string) {
        getOrCreateObjectField(state, renameObject, typeName, fieldName).shareable = true;
      },
      setTag(typeName: string, fieldName: string, tag: string) {
        getOrCreateObjectField(state, renameObject, typeName, fieldName).tags.add(tag);
      },
      setUsed(typeName: string, fieldName: string) {
        getOrCreateObjectField(state, renameObject, typeName, fieldName).used = true;
      },
      arg: {
        setType(typeName: string, fieldName: string, argName: string, argType: string) {
          getOrCreateObjectFieldArgument(state, renameObject, typeName, fieldName, argName).type =
            argType;
        },
        setDescription(
          typeName: string,
          fieldName: string,
          argName: string,
          description: Description,
        ) {
          getOrCreateObjectFieldArgument(
            state,
            renameObject,
            typeName,
            fieldName,
            argName,
          ).description = description;
        },
        setDeprecated(typeName: string, fieldName: string, argName: string, reason?: string) {
          getOrCreateObjectFieldArgument(
            state,
            renameObject,
            typeName,
            fieldName,
            argName,
          ).deprecated = {
            reason,
            deprecated: true,
          };
        },
        setDirective(
          typeName: string,
          fieldName: string,
          argName: string,
          directive: DirectiveNode,
        ) {
          getOrCreateObjectFieldArgument(
            state,
            renameObject,
            typeName,
            fieldName,
            argName,
          ).ast.directives.push(directive);
        },
        setDefaultValue(
          typeName: string,
          fieldName: string,
          argName: string,
          defaultValue: string,
        ) {
          getOrCreateObjectFieldArgument(
            state,
            renameObject,
            typeName,
            fieldName,
            argName,
          ).defaultValue = defaultValue;
        },
        setInaccessible(typeName: string, fieldName: string, argName: string) {
          getOrCreateObjectFieldArgument(
            state,
            renameObject,
            typeName,
            fieldName,
            argName,
          ).inaccessible = true;
        },
        setTag(typeName: string, fieldName: string, argName: string, tag: string) {
          getOrCreateObjectFieldArgument(
            state,
            renameObject,
            typeName,
            fieldName,
            argName,
          ).tags.add(tag);
        },
      },
    },
    setInterfaceObject(typeName: string) {
      const type = getOrCreateObjectType(state, renameObject, typeName);
      type.interfaceObjectTypeName = typeName;
    },
  };
}

function interfaceTypeFactory(state: SubgraphState) {
  return {
    setDefinition(typeName: string) {
      getOrCreateInterfaceType(state, typeName).isDefinition = true;
    },
    /**
     * For Federation v1:
     *   Set as extension only if it uses @extends directive.
     *   It's not for `extend type` syntax.
     * For Federation v2:
     *   Set as extension if it's not a definition.
     */
    setExtension(typeName: string) {
      getOrCreateInterfaceType(state, typeName).extension = true;
    },
    setInterface(typeName: string, interfaceName: string) {
      getOrCreateInterfaceType(state, typeName).interfaces.add(interfaceName);
    },
    setKey(typeName: string, fields: string, fieldsUsedInKey: Set<string>, resolvable: boolean) {
      getOrCreateInterfaceType(state, typeName).keys.push({ fields, resolvable });
    },
    setInaccessible(typeName: string) {
      const objectType = getOrCreateInterfaceType(state, typeName);
      objectType.inaccessible = true;

      // for (const field of objectType.fields.values()) {
      //   field.inaccessible = true;
      // }
    },
    setAuthenticated(typeName: string) {
      const t = getOrCreateInterfaceType(state, typeName);
      t.authenticated = true;
    },
    setPolicies(typeName: string, policies: string[][]) {
      getOrCreateInterfaceType(state, typeName).policies.push(...policies);
    },
    setScopes(typeName: string, scopes: string[][]) {
      getOrCreateInterfaceType(state, typeName).scopes.push(...scopes);
    },
    setTag(typeName: string, tag: string) {
      getOrCreateInterfaceType(state, typeName).tags.add(tag);
    },
    setDirective(typeName: string, directive: DirectiveNode) {
      getOrCreateInterfaceType(state, typeName).ast.directives.push(directive);
    },
    setDescription(typeName: string, description: Description) {
      getOrCreateInterfaceType(state, typeName).description = description;
    },
    field: {
      setType(typeName: string, fieldName: string, fieldType: string) {
        getOrCreateInterfaceField(state, typeName, fieldName).type = fieldType;
      },
      setExternal(typeName: string, fieldName: string) {
        getOrCreateInterfaceField(state, typeName, fieldName).external = true;
      },
      setInaccessible(typeName: string, fieldName: string) {
        getOrCreateInterfaceField(state, typeName, fieldName).inaccessible = true;
      },
      setAuthenticated(typeName: string, fieldName: string) {
        getOrCreateInterfaceField(state, typeName, fieldName).authenticated = true;
      },
      setPolicies(typeName: string, fieldName: string, policies: string[][]) {
        getOrCreateInterfaceField(state, typeName, fieldName).policies.push(...policies);
      },
      setScopes(typeName: string, fieldName: string, scopes: string[][]) {
        getOrCreateInterfaceField(state, typeName, fieldName).scopes.push(...scopes);
      },
      setOverride(typeName: string, fieldName: string, override: string) {
        getOrCreateInterfaceField(state, typeName, fieldName).override = override;
      },
      setRequires(typeName: string, fieldName: string, requires: string) {
        getOrCreateInterfaceField(state, typeName, fieldName).requires = requires;
      },
      setShareable(typeName: string, fieldName: string) {
        getOrCreateInterfaceField(state, typeName, fieldName).shareable = true;
      },
      setTag(typeName: string, fieldName: string, tag: string) {
        getOrCreateInterfaceField(state, typeName, fieldName).tags.add(tag);
      },
      setUsed(typeName: string, fieldName: string) {
        getOrCreateInterfaceField(state, typeName, fieldName).used = true;
      },
      setDirective(typeName: string, fieldName: string, directive: DirectiveNode) {
        getOrCreateInterfaceField(state, typeName, fieldName).ast.directives.push(directive);
      },
      setDescription(typeName: string, fieldName: string, description: Description) {
        getOrCreateInterfaceField(state, typeName, fieldName).description = description;
      },
      setDeprecated(typeName: string, fieldName: string, reason?: string) {
        getOrCreateInterfaceField(state, typeName, fieldName).deprecated = {
          reason,
          deprecated: true,
        };
      },
      arg: {
        setType(typeName: string, fieldName: string, argName: string, argType: string) {
          getOrCreateInterfaceFieldArgument(state, typeName, fieldName, argName).type = argType;
        },
        setDefaultValue(
          typeName: string,
          fieldName: string,
          argName: string,
          defaultValue: string,
        ) {
          getOrCreateInterfaceFieldArgument(state, typeName, fieldName, argName).defaultValue =
            defaultValue;
        },
        setDeprecated(typeName: string, fieldName: string, argName: string, reason?: string) {
          getOrCreateInterfaceFieldArgument(state, typeName, fieldName, argName).deprecated = {
            reason,
            deprecated: true,
          };
        },
        setDescription(
          typeName: string,
          fieldName: string,
          argName: string,
          description: Description,
        ) {
          getOrCreateInterfaceFieldArgument(state, typeName, fieldName, argName).description =
            description;
        },
        setTag(typeName: string, fieldName: string, argName: string, tag: string) {
          getOrCreateInterfaceFieldArgument(state, typeName, fieldName, argName).tags.add(tag);
        },
        setInaccessible(typeName: string, fieldName: string, argName: string) {
          getOrCreateInterfaceFieldArgument(state, typeName, fieldName, argName).inaccessible =
            true;
        },
        setDirective(
          typeName: string,
          fieldName: string,
          argName: string,
          directive: DirectiveNode,
        ) {
          getOrCreateInterfaceFieldArgument(
            state,
            typeName,
            fieldName,
            argName,
          ).ast.directives.push(directive);
        },
      },
    },
  };
}

function inputObjectTypeFactory(state: SubgraphState) {
  return {
    setDefinition(typeName: string) {
      getOrCreateInputObjectType(state, typeName).isDefinition = true;
    },
    setExtension(typeName: string) {
      getOrCreateInputObjectType(state, typeName).extension = true;
    },
    setDescription(typeName: string, description: Description) {
      getOrCreateInputObjectType(state, typeName).description = description;
    },
    setInaccessible(typeName: string) {
      const objectType = getOrCreateInputObjectType(state, typeName);
      objectType.inaccessible = true;

      for (const field of objectType.fields.values()) {
        field.inaccessible = true;
      }
    },
    setTag(typeName: string, tag: string) {
      getOrCreateInputObjectType(state, typeName).tags.add(tag);
    },
    field: {
      setType(typeName: string, fieldName: string, fieldType: string) {
        getOrCreateInputObjectField(state, typeName, fieldName).type = fieldType;
      },
      setDescription(typeName: string, fieldName: string, description: Description) {
        getOrCreateInputObjectField(state, typeName, fieldName).description = description;
      },
      setDeprecated(typeName: string, fieldName: string, reason?: string) {
        getOrCreateInputObjectField(state, typeName, fieldName).deprecated = {
          reason,
          deprecated: true,
        };
      },
      setDefaultValue(typeName: string, fieldName: string, defaultValue: string) {
        getOrCreateInputObjectField(state, typeName, fieldName).defaultValue = defaultValue;
      },
      setInaccessible(typeName: string, fieldName: string) {
        getOrCreateInputObjectField(state, typeName, fieldName).inaccessible = true;
      },
      setTag(typeName: string, fieldName: string, tag: string) {
        getOrCreateInputObjectField(state, typeName, fieldName).tags.add(tag);
      },
    },
  };
}

function unionTypeFactory(state: SubgraphState) {
  return {
    setDefinition(typeName: string) {
      getOrCreateUnionType(state, typeName).isDefinition = true;
    },
    setInaccessible(typeName: string) {
      getOrCreateUnionType(state, typeName).inaccessible = true;
    },
    setTag(typeName: string, tag: string) {
      getOrCreateUnionType(state, typeName).tags.add(tag);
    },
    setDescription(typeName: string, description: Description) {
      getOrCreateUnionType(state, typeName).description = description;
    },
    setMember(typeName: string, member: string) {
      getOrCreateUnionType(state, typeName).members.add(member);
    },
  };
}

function enumTypeFactory(state: SubgraphState) {
  return {
    setDefinition(typeName: string) {
      getOrCreateEnumType(state, typeName).isDefinition = true;
    },
    setInaccessible(typeName: string) {
      getOrCreateEnumType(state, typeName).inaccessible = true;
    },
    setAuthenticated(typeName: string) {
      getOrCreateEnumType(state, typeName).authenticated = true;
    },
    setPolicies(typeName: string, policies: string[][]) {
      getOrCreateEnumType(state, typeName).policies.push(...policies);
    },
    setScopes(typeName: string, scopes: string[][]) {
      getOrCreateEnumType(state, typeName).scopes.push(...scopes);
    },
    setDescription(typeName: string, description: Description) {
      getOrCreateEnumType(state, typeName).description = description;
    },
    setTag(typeName: string, tag: string) {
      getOrCreateEnumType(state, typeName).tags.add(tag);
    },
    setReferencedByInputType(typeName: string, schemaCoordinate: string) {
      getOrCreateEnumType(state, typeName).referencedByInputType = true;
      getOrCreateEnumType(state, typeName).inputTypeReferences.add(schemaCoordinate);
    },
    setReferencedByOutputType(typeName: string, schemaCoordinate: string) {
      getOrCreateEnumType(state, typeName).referencedByOutputType = true;
      getOrCreateEnumType(state, typeName).outputTypeReferences.add(schemaCoordinate);
    },
    value: {
      setValue(typeName: string, valueName: string) {
        getOrCreateEnumValue(state, typeName, valueName);
      },
      setDescription(typeName: string, valueName: string, description: Description) {
        getOrCreateEnumValue(state, typeName, valueName).description = description;
      },
      setInaccessible(typeName: string, valueName: string) {
        getOrCreateEnumValue(state, typeName, valueName).inaccessible = true;
      },
      setTag(typeName: string, valueName: string, tag: string) {
        getOrCreateEnumValue(state, typeName, valueName).tags.add(tag);
      },
      setDeprecated(typeName: string, valueName: string, reason?: string) {
        getOrCreateEnumValue(state, typeName, valueName).deprecated = {
          reason,
          deprecated: true,
        };
      },
    },
  };
}

function getOrCreateDirective(state: SubgraphState, directiveName: string): Directive {
  const existing = state.types.get(directiveName);

  if (existing) {
    if (existing.kind !== TypeKind.DIRECTIVE) {
      throw new Error(`Expected ${directiveName} to be a directive`);
    }

    return existing;
  }

  const directive: Directive = {
    kind: TypeKind.DIRECTIVE,
    name: directiveName,
    locations: new Set(),
    repeatable: false,
    composed: false,
    args: new Map(),
  };

  state.types.set(directiveName, directive);

  return directive;
}

function getOrCreateDirectiveArg(
  state: SubgraphState,
  directiveName: string,
  argName: string,
): Argument {
  const directive = getOrCreateDirective(state, directiveName);

  const existing = directive.args.get(argName);
  if (existing) {
    return existing;
  }

  const arg: Argument = {
    name: argName,
    type: MISSING,
    inaccessible: false,
    tags: new Set(),
    ast: {
      directives: [],
    },
  };

  directive.args.set(argName, arg);

  return arg;
}

function getOrCreateScalarType(state: SubgraphState, typeName: string): ScalarType {
  const existing = state.types.get(typeName);

  if (existing) {
    if (existing.kind !== TypeKind.SCALAR) {
      throw new Error(`Expected ${typeName} to be a scalar type`);
    }

    return existing;
  }

  const scalarType: ScalarType = {
    kind: TypeKind.SCALAR,
    name: typeName,
    tags: new Set(),
    inaccessible: false,
    authenticated: false,
    policies: [],
    scopes: [],
    ast: {
      directives: [],
    },
  };

  state.types.set(typeName, scalarType);

  return scalarType;
}

function getOrCreateObjectType(
  state: SubgraphState,
  renameObject: (typeName: string) => string,
  typeName: string,
): ObjectType {
  typeName = renameObject(typeName);
  const existing = state.types.get(typeName);

  if (existing) {
    if (existing.kind !== TypeKind.OBJECT) {
      throw new Error(`Expected ${typeName} to be an object type`);
    }

    return existing;
  }

  const objectType: ObjectType = {
    kind: TypeKind.OBJECT,
    name: typeName,
    fields: new Map(),
    fieldsUsedAsKeys: new Set(),
    extension: false,
    external: false,
    keys: [],
    inaccessible: false,
    authenticated: false,
    policies: [],
    scopes: [],
    shareable: false,
    tags: new Set(),
    interfaces: new Set(),
    isDefinition: false,
    ast: {
      directives: [],
    },
  };

  state.types.set(typeName, objectType);

  return objectType;
}

function getOrCreateInterfaceType(state: SubgraphState, typeName: string): InterfaceType {
  const existing = state.types.get(typeName);

  if (existing) {
    if (existing.kind !== TypeKind.INTERFACE) {
      throw new Error(`Expected ${typeName} to be an interface type`);
    }

    return existing;
  }

  const interfaceType: InterfaceType = {
    kind: TypeKind.INTERFACE,
    name: typeName,
    fields: new Map(),
    extension: false,
    keys: [],
    inaccessible: false,
    authenticated: false,
    policies: [],
    scopes: [],
    tags: new Set(),
    interfaces: new Set(),
    implementedBy: new Set(),
    isDefinition: false,
    interfaceObjects: new Map(),
    ast: {
      directives: [],
    },
  };

  state.types.set(typeName, interfaceType);

  return interfaceType;
}

function getOrCreateInputObjectType(state: SubgraphState, typeName: string): InputObjectType {
  const existing = state.types.get(typeName);

  if (existing) {
    if (existing.kind !== TypeKind.INPUT_OBJECT) {
      throw new Error(`Expected ${typeName} to be an input object type`);
    }

    return existing;
  }

  const inputObjectType: InputObjectType = {
    kind: TypeKind.INPUT_OBJECT,
    name: typeName,
    fields: new Map(),
    extension: false,
    inaccessible: false,
    tags: new Set(),
    isDefinition: false,
  };

  state.types.set(typeName, inputObjectType);

  return inputObjectType;
}

function getOrCreateEnumType(state: SubgraphState, typeName: string): EnumType {
  const existing = state.types.get(typeName);

  if (existing) {
    if (existing.kind !== TypeKind.ENUM) {
      throw new Error(`Expected ${typeName} to be an enum type`);
    }

    return existing;
  }

  const enumType: EnumType = {
    kind: TypeKind.ENUM,
    name: typeName,
    values: new Map(),
    inaccessible: false,
    authenticated: false,
    policies: [],
    scopes: [],
    tags: new Set(),
    isDefinition: false,
    referencedByInputType: false,
    referencedByOutputType: false,
    inputTypeReferences: new Set(),
    outputTypeReferences: new Set(),
  };

  state.types.set(typeName, enumType);

  return enumType;
}

function getOrCreateUnionType(state: SubgraphState, typeName: string): UnionType {
  const existing = state.types.get(typeName);

  if (existing) {
    if (existing.kind !== TypeKind.UNION) {
      throw new Error(`Expected ${typeName} to be a union type`);
    }

    return existing;
  }

  const unionType: UnionType = {
    kind: TypeKind.UNION,
    name: typeName,
    members: new Set(),
    inaccessible: false,
    tags: new Set(),
    isDefinition: false,
  };

  state.types.set(typeName, unionType);

  return unionType;
}

function getOrCreateObjectField(
  state: SubgraphState,
  renameObject: (typeName: string) => string,
  typeName: string,
  fieldName: string,
): Field {
  const objectType = getOrCreateObjectType(state, renameObject, typeName);

  const existing = objectType.fields.get(fieldName);

  if (existing) {
    return existing;
  }

  const field: Field = {
    name: fieldName,
    type: MISSING,
    external: false,
    inaccessible: false,
    authenticated: false,
    extension: false,
    policies: [],
    scopes: [],
    used: false,
    required: false,
    provided: false,
    override: null,
    provides: null,
    requires: null,
    shareable: false,
    // shareable: state.version === 'v1.0' ? true : false, // In Fed v1 - it should be true by default, as all fields are shareable by default, even though there's not @shareable directive
    tags: new Set(),
    args: new Map(),
    ast: {
      directives: [],
    },
  };

  objectType.fields.set(fieldName, field);

  return field;
}

function getOrCreateInterfaceField(
  state: SubgraphState,
  typeName: string,
  fieldName: string,
): Field {
  const interfaceType = getOrCreateInterfaceType(state, typeName);

  const existing = interfaceType.fields.get(fieldName);

  if (existing) {
    return existing;
  }

  const field: Field = {
    name: fieldName,
    type: MISSING,
    external: false,
    inaccessible: false,
    authenticated: false,
    policies: [],
    scopes: [],
    used: false,
    override: null,
    provides: null,
    requires: null,
    required: false,
    provided: false,
    shareable: false,
    extension: false,
    tags: new Set(),
    args: new Map(),
    ast: {
      directives: [],
    },
  };

  interfaceType.fields.set(fieldName, field);

  return field;
}

function getOrCreateInputObjectField(
  state: SubgraphState,
  typeName: string,
  fieldName: string,
): InputField {
  const inputObjectType = getOrCreateInputObjectType(state, typeName);

  const existing = inputObjectType.fields.get(fieldName);

  if (existing) {
    return existing;
  }

  const field: InputField = {
    name: fieldName,
    type: MISSING,
    inaccessible: false,
    tags: new Set(),
  };

  inputObjectType.fields.set(fieldName, field);

  return field;
}

function getOrCreateEnumValue(
  state: SubgraphState,
  typeName: string,
  enumValueName: string,
): EnumValue {
  const enumType = getOrCreateEnumType(state, typeName);

  const existing = enumType.values.get(enumValueName);

  if (existing) {
    return existing;
  }

  const enumValue: EnumValue = {
    name: enumValueName,
    inaccessible: false,
    tags: new Set(),
  };

  enumType.values.set(enumValueName, enumValue);

  return enumValue;
}

function getOrCreateObjectFieldArgument(
  state: SubgraphState,
  renameObject: (typeName: string) => string,
  typeName: string,
  fieldName: string,
  argName: string,
): Argument {
  const fieldState = getOrCreateObjectField(state, renameObject, typeName, fieldName);

  const existing = fieldState.args.get(argName);

  if (existing) {
    return existing;
  }

  const arg: Argument = {
    name: argName,
    type: MISSING,
    inaccessible: false,
    tags: new Set(),
    ast: {
      directives: [],
    },
  };

  fieldState.args.set(argName, arg);

  return arg;
}

function getOrCreateInterfaceFieldArgument(
  state: SubgraphState,
  typeName: string,
  fieldName: string,
  argName: string,
): Argument {
  const fieldState = getOrCreateInterfaceField(state, typeName, fieldName);

  const existing = fieldState.args.get(argName);

  if (existing) {
    return existing;
  }

  const arg: Argument = {
    name: argName,
    type: MISSING,
    inaccessible: false,
    tags: new Set(),
    ast: {
      directives: [],
    },
  };

  fieldState.args.set(argName, arg);

  return arg;
}

function isSchemaDefinition(node: ASTNode): node is SchemaDefinitionNode {
  return node.kind === Kind.SCHEMA_DEFINITION;
}

function resolveTypeName(node: TypeNode): string {
  switch (node.kind) {
    case Kind.NAMED_TYPE:
      return node.name.value;
    case Kind.LIST_TYPE:
      return resolveTypeName(node.type);
    case Kind.NON_NULL_TYPE:
      return resolveTypeName(node.type);
    default:
      throw new Error(`Unexpected type node: ${node}`);
  }
}

function isEnumType(node: ASTNode): node is EnumTypeDefinitionNode | EnumTypeExtensionNode {
  return node.kind === Kind.ENUM_TYPE_DEFINITION || node.kind === Kind.ENUM_TYPE_EXTENSION;
}

function decideOnRootTypeName(
  schemaDef: SchemaDefinitionNode | undefined,
  kind: OperationTypeNode,
  defaultName: string,
) {
  return (
    schemaDef?.operationTypes?.find(operationType => operationType.operation === kind)?.type.name
      .value ?? defaultName
  );
}
