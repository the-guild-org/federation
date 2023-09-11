import {
  DirectiveDefinitionNode,
  Kind,
  SelectionSetNode,
  stripIgnoredCharacters,
  TypeDefinitionNode,
} from 'graphql';
import { print } from '../graphql/printer.js';
import { Link, mergeLinks } from '../specifications/link.js';
import { parseFields } from '../subgraph/helpers.js';
import { SubgraphState } from '../subgraph/state.js';
import { createJoinGraphEnumTypeNode } from './composition/ast.js';
import { Graph } from './composition/common.js';
import { directiveBuilder, DirectiveState } from './composition/directive.js';
import { enumTypeBuilder, EnumTypeState } from './composition/enum-type.js';
import { inputObjectTypeBuilder, InputObjectTypeState } from './composition/input-object-type.js';
import { interfaceTypeBuilder, InterfaceTypeState } from './composition/interface-type.js';
import { objectTypeBuilder, ObjectTypeState } from './composition/object-type.js';
import { scalarTypeBuilder, ScalarTypeState } from './composition/scalar-type.js';
import { unionTypeBuilder, UnionTypeState } from './composition/union-type.js';

export type SupergraphState = {
  graphs: Map<string, Graph>;
  scalarTypes: Map<string, ScalarTypeState>;
  objectTypes: Map<string, ObjectTypeState>;
  interfaceTypes: Map<string, InterfaceTypeState>;
  unionTypes: Map<string, UnionTypeState>;
  enumTypes: Map<string, EnumTypeState>;
  inputObjectTypes: Map<string, InputObjectTypeState>;
  directives: Map<string, DirectiveState>;
  links: Array<
    Link & {
      graph: string;
    }
  >; // TODO: change it to a Link with no types (only directives) + reduce this type to minimum (no need for name property...)
  specs: {
    tag: boolean;
    inaccessible: boolean;
  };
};

export type SupergraphStateBuilder = ReturnType<typeof createSupergraphStateBuilder>;

export function createSupergraphStateBuilder() {
  const state: SupergraphState = {
    graphs: new Map(),
    scalarTypes: new Map(),
    objectTypes: new Map(),
    interfaceTypes: new Map(),
    unionTypes: new Map(),
    enumTypes: new Map(),
    inputObjectTypes: new Map(),
    directives: new Map(),
    links: [],
    specs: {
      tag: false,
      inaccessible: false,
    },
  };

  const directive = directiveBuilder();
  const scalarType = scalarTypeBuilder();
  const enumType = enumTypeBuilder();
  const inputObjectType = inputObjectTypeBuilder();
  const interfaceType = interfaceTypeBuilder();
  const objectType = objectTypeBuilder();
  const unionType = unionTypeBuilder();

  return {
    addGraph(graph: Graph) {
      if (state.graphs.has(graph.id)) {
        throw new Error(`Graph with ID "${graph.id}" already exists`);
      }

      state.graphs.set(graph.id, {
        id: graph.id,
        name: graph.name,
        url: graph.url,
        version: graph.version,
      });
    },
    getGraph(id: string) {
      return state.graphs.get(id);
    },
    visitSubgraphState(subgraphState: SubgraphState) {
      for (const link of subgraphState.links) {
        state.links.push(linkWithGraph(link, subgraphState.graph.id));
      }

      if (subgraphState.specs.tag) {
        state.specs.tag = true;
      }

      if (subgraphState.specs.inaccessible) {
        state.specs.inaccessible = true;
      }

      for (const [typeName, type] of subgraphState.types) {
        switch (type.kind) {
          case 'OBJECT': {
            objectType.visitSubgraphState(subgraphState.graph, state.objectTypes, typeName, type);
            break;
          }
          case 'INTERFACE': {
            interfaceType.visitSubgraphState(
              subgraphState.graph,
              state.interfaceTypes,
              typeName,
              type,
            );
            break;
          }
          case 'UNION': {
            unionType.visitSubgraphState(subgraphState.graph, state.unionTypes, typeName, type);
            break;
          }
          case 'ENUM': {
            enumType.visitSubgraphState(subgraphState.graph, state.enumTypes, typeName, type);
            break;
          }
          case 'INPUT_OBJECT': {
            inputObjectType.visitSubgraphState(
              subgraphState.graph,
              state.inputObjectTypes,
              typeName,
              type,
            );
            break;
          }
          case 'DIRECTIVE': {
            directive.visitSubgraphState(subgraphState.graph, state.directives, typeName, type);
            break;
          }
          case 'SCALAR': {
            scalarType.visitSubgraphState(subgraphState.graph, state.scalarTypes, typeName, type);
            break;
          }
        }
      }
    },
    getSupergraphState() {
      return state;
    },
    links() {
      return mergeLinks(state.links);
    },
    build() {
      const transformFields = createFieldsTransformer(state);

      // It's important to keep that number correct.
      const numberOfExpectedNodes =
        state.directives.size +
        state.scalarTypes.size +
        state.objectTypes.size +
        state.interfaceTypes.size +
        state.unionTypes.size +
        state.enumTypes.size +
        state.inputObjectTypes.size +
        1;
      // Allocate the elements in the array for performance
      const nodes: Array<TypeDefinitionNode | DirectiveDefinitionNode> = new Array(
        numberOfExpectedNodes,
      );
      let i = 0;

      nodes[i++] = createJoinGraphEnumTypeNode(
        Array.from(state.graphs.values()).map(graph => ({
          name: graph.name,
          enumValue: graph.id,
          url: graph.url ?? '',
        })),
      );

      for (const directiveState of state.directives.values()) {
        nodes[i++] = directive.composeSupergraphNode(directiveState, state.graphs);
      }

      for (const scalarTypeState of state.scalarTypes.values()) {
        nodes[i++] = scalarType.composeSupergraphNode(scalarTypeState, state.graphs);
      }

      for (const objectTypeState of state.objectTypes.values()) {
        nodes[i++] = objectType.composeSupergraphNode(
          transformFields(objectTypeState),
          state.graphs,
        );
      }

      for (const interfaceTypeState of state.interfaceTypes.values()) {
        nodes[i++] = interfaceType.composeSupergraphNode(interfaceTypeState, state.graphs);
      }

      for (const unionTypeState of state.unionTypes.values()) {
        nodes[i++] = unionType.composeSupergraphNode(unionTypeState, state.graphs);
      }

      for (const enumTypeState of state.enumTypes.values()) {
        nodes[i++] = enumType.composeSupergraphNode(enumTypeState, state.graphs);
      }

      for (const inputObjectTypeState of state.inputObjectTypes.values()) {
        nodes[i++] = inputObjectType.composeSupergraphNode(inputObjectTypeState, state.graphs);
      }

      return nodes;
    },
  };
}

function linkWithGraph(
  link: Link,
  graph: string,
): Link & {
  graph: string;
} {
  (link as any).graph = graph;
  return link as any;
}

//

function visitSelectionSetNode(
  selectionSet: SelectionSetNode,
  locations: Set<string>,
  currentPath: string[],
) {
  for (const selection of selectionSet.selections) {
    if (selection.kind === Kind.FIELD) {
      if (selection.selectionSet) {
        visitSelectionSetNode(
          selection.selectionSet,
          locations,
          currentPath.concat(selection.name.value),
        );
      } else {
        locations.add(currentPath.concat(selection.name.value).join('.'));
      }
    }
  }
}

function createFieldsSet(selectionSet: SelectionSetNode): Set<string> {
  const locations = new Set<string>();
  visitSelectionSetNode(selectionSet, locations, []);
  return locations;
}

function filterSelectionSetNode(
  selectionSet: SelectionSetNode,
  removableFields: Set<string>,
  currentPath: string,
) {
  const fieldsToDelete: string[] = [];
  for (const selection of selectionSet.selections) {
    if (selection.kind === Kind.FIELD) {
      if (selection.selectionSet) {
        filterSelectionSetNode(
          selection.selectionSet,
          removableFields,
          currentPath + '.' + selection.name.value,
        );

        if (selectionSet.selections.length === 0) {
          fieldsToDelete.push(selection.name.value);
        }
      } else {
        const lookingFor =
          currentPath === '' ? selection.name.value : currentPath + '.' + selection.name.value;
        if (removableFields.has(lookingFor)) {
          fieldsToDelete.push(selection.name.value);
        }
      }
    }
  }

  for (const fieldName of fieldsToDelete) {
    selectionSet.selections = selectionSet.selections.filter(selection =>
      selection.kind === Kind.FIELD && selection.name.value === fieldName ? false : true,
    );
  }
}

function createFieldsTransformer(state: SupergraphState) {
  function transformFields(removableFields: Set<string>, fields: string) {
    const parsedFields = parseFields(fields);
    if (!parsedFields) {
      return fields;
    }

    filterSelectionSetNode(parsedFields, removableFields, '');

    const printed = stripIgnoredCharacters(print(parsedFields));

    return printed.replace(/^\{/, '').replace(/\}$/, '');
  }

  function mergeKeyFieldsCollection(fieldsCollection: string[]): Set<string> {
    const fieldsSets: Array<Set<string>> = [];
    for (const fields of fieldsCollection) {
      const parsedFields = parseFields(fields);

      if (!parsedFields) {
        continue;
      }

      fieldsSets.push(createFieldsSet(parsedFields));
    }

    // merge fieldsMaps into a fieldMap that contains fields in common
    // if a field is not in common, remove it from the fieldsMap
    // if a field is in common, keep it in the fieldsMap
    let commonFields: Set<string> | undefined;
    for (const fieldsSet of fieldsSets) {
      if (!commonFields) {
        commonFields = fieldsSet;
        continue;
      }

      for (const field of commonFields) {
        if (!fieldsSet.has(field)) {
          commonFields.delete(field);
        }
      }
    }

    return commonFields ?? new Set();
  }

  return function visitTypeState<T extends ObjectTypeState | InterfaceTypeState>(typeState: T): T {
    for (const [_, fieldState] of typeState.fields) {
      for (const [graphId, fieldStateInGraph] of fieldState.byGraph) {
        if (fieldStateInGraph.requires) {
          const keyFields = mergeKeyFieldsCollection(
            typeState.byGraph.get(graphId)!.keys.map(key => key.fields),
          );

          const newRequires = transformFields(keyFields, fieldStateInGraph.requires);
          fieldStateInGraph.requires = newRequires.trim().length === 0 ? null : newRequires;
        }

        if (fieldStateInGraph.provides) {
          const referencedTypeName = fieldState.type.replace(/[!\[\]]+/g, '');
          const referencedType =
            state.objectTypes.get(referencedTypeName) ??
            state.interfaceTypes.get(referencedTypeName);

          if (!referencedType) {
            throw new Error('Referenced type not found: ' + referencedTypeName);
          }

          const referencedTypeInGraph = referencedType.byGraph.get(graphId)!;

          const keyFields =
            referencedTypeInGraph.extension === true
              ? // removes key fields if the referenced type is an extension
                mergeKeyFieldsCollection(referencedTypeInGraph.keys.map(key => key.fields))
              : // preserve all fields if the referenced type is a definition
                new Set<string>();

          fieldStateInGraph.provides = transformFields(keyFields, fieldStateInGraph.provides);
        }
      }
    }

    return typeState;
  };
}
