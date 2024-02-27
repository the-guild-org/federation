import { GraphQLError } from 'graphql';
import { FederationImports } from '../../../specifications/federation.js';
import { Field, InterfaceType, ObjectType, TypeKind } from '../../../subgraph/state.js';
import {
  allowedInterfaceObjectVersion,
  importsAllowInterfaceObject,
} from '../../../subgraph/validation/rules/elements/interface-object';
import {
  createJoinFieldDirectiveNode,
  createJoinTypeDirectiveNode,
} from '../../composition/ast.js';
import { SupergraphValidationContext } from '../validation-context';

type TypeName = string;
type GraphName = string;
type ValidInterfaceTypeName = string;
type ObjectTypeName = string;

type InterfaceObjectContext = {
  objectType: ObjectType;
  graphName: GraphName;
  typeName: TypeName;
};

type InterfaceContext = {
  interfaceType: InterfaceType;
  graphName: GraphName;
  graphVersion: string;
  graphImports: FederationImports;
  typeName: TypeName;
};

// if in subgraph there is interfaceObject,

export function InterfaceObjectCompositionRule(context: SupergraphValidationContext) {
  // I need to collect all types which are interfaces and objects in the different subgraphs (trkohler)
  const interfaceInterfaceObjectsMap = new Map<
    ValidInterfaceTypeName,
    Set<InterfaceObjectContext>
  >();
  const interfaceObjectContextMap = new Map<ObjectTypeName, InterfaceObjectContext>();

  const interfaces = new Map<ValidInterfaceTypeName, InterfaceContext>();

  for (const [_, state] of context.subgraphStates) {
    const types = state.types.values();
    for (const type of types) {
      if (type.kind == TypeKind.OBJECT && type.interfaceObjectTypeName) {
        interfaceObjectContextMap.set(type.name, {
          objectType: type,
          graphName: state.graph.id,
          typeName: type.name,
        });
        const exist = interfaceInterfaceObjectsMap.get(type.name);
        if (exist) {
          exist.add({
            objectType: type,
            graphName: state.graph.id,
            typeName: type.name,
          });
        } else {
          interfaceInterfaceObjectsMap.set(
            type.name,
            new Set([
              {
                objectType: type,
                graphName: state.graph.id,
                typeName: type.name,
              },
            ]),
          );
        }
      }
    }
  }

  for (const [_, state] of context.subgraphStates) {
    const types = state.types.values();
    for (const type of types) {
      if (type.kind == TypeKind.INTERFACE) {
        const typeName = type.name;
        if (interfaceObjectContextMap.get(typeName)) {
          for (const interfaceObjectContext of interfaceInterfaceObjectsMap.get(typeName)!) {
            const { objectType, graphName } = interfaceObjectContext;
            type.interfaceObjects.set(graphName, objectType);
          }
          interfaces.set(typeName, {
            interfaceType: type,
            graphName: state.graph.id,
            graphVersion: state.graph.version,
            graphImports: state.graph.imports,
            typeName,
          });
        }
      }
    }
  }
  // validate if each interface object has its entry in the interfaceInterfaceObjectsMap (trkohler)
  for (const interfaceObject of interfaceObjectContextMap.keys()) {
    // this doesn't respect imports and version (trkohler)
    const interfaceContext = interfaces.get(interfaceObject);
    const interfaceObjectContexts = interfaceInterfaceObjectsMap.get(interfaceObject)!;
    const allInterfaceObjectGraphNames = Array.from(interfaceObjectContexts).map(
      interfaceObjectContext => interfaceObjectContext.graphName,
    );
    const pluralGraphs = allInterfaceObjectGraphNames.length > 1;

    if (!interfaceContext) {
      // interface object doesn't have corresponding interface
      context.reportError(
        new GraphQLError(
          `@interfaceObject ${interfaceObject} in ${
            pluralGraphs ? `subgraphs` : `subgraph`
          } ${allInterfaceObjectGraphNames.join(
            ', ',
          )} doesn't have corresponding entity interface in the different subgraph.`,
        ),
      );
      continue;
    }

    const {
      graphImports,
      graphVersion,
      typeName,
      graphName: graphNameForInterface,
      interfaceType,
    } = interfaceContext;

    if (
      !allowedInterfaceObjectVersion.includes(graphVersion) ||
      !importsAllowInterfaceObject(graphImports)
    ) {
      context.reportError(
        new GraphQLError(
          `For @interfaceObject to work, there is must be an entity interface defined in the different subgraph. Interface ${typeName} in subgraph ${graphNameForInterface} is good candidate, but it doesn't satisfy the requirements on version (>= 2.3) or imports (@key, @interfaceObject). Maybe check those?`,
        ),
      );
      continue;
    }

    if (interfaceType.keys.length == 0) {
      context.reportError(
        new GraphQLError(
          `@key directive must be present on interface type ${typeName} in subgraph ${graphNameForInterface} for @objectInterface to work`,
          {
            extensions: {
              code: 'INVALID_GRAPHQL',
            },
          },
        ),
      );
    }
  }

  // add new fields to interfaces
  const graphImplementations = new Map<
    GraphName,
    {
      implementationsToFind: Set<string>;
      fieldsToMerge: {
        field: Field;
        graph: GraphName;
      }[];
    }
  >();
  const interfacesToModify = new Map<
    ValidInterfaceTypeName,
    {
      fieldsToMerge: {
        field: Field;
        graph: GraphName;
      }[];
    }
  >();

  for (const [_, interfaceContext] of interfaces) {
    const { interfaceType, graphName } = interfaceContext;
    const implementedBy = interfaceType.implementedBy;
    const interfaceObjects = interfaceType.interfaceObjects;
    let fieldsToMerge = new Map<
      string,
      {
        field: Field;
        graph: GraphName;
      }
    >();
    for (const [graphName, interfaceObject] of interfaceObjects) {
      for (const field of interfaceObject.fields.values()) {
        fieldsToMerge.set(field.name, {
          field,
          graph: graphName,
        });
      }
    }
    const keyFields = interfaceType.keys;
    for (const keyField of keyFields) {
      const fields = keyField.fields.split(' ');
      for (const field of fields) {
        // triple loop!!!
        fieldsToMerge.delete(field);
      }
    }
    interfacesToModify.set(interfaceType.name, {
      fieldsToMerge: Array.from(fieldsToMerge.values()),
    });

    graphImplementations.set(graphName, {
      implementationsToFind: implementedBy,
      fieldsToMerge: Array.from(fieldsToMerge.values()),
    });
  }

  // add new fields to object type implementations
  for (const [graphName, state] of context.subgraphStates) {
    const implementations = graphImplementations.get(graphName);
    if (!implementations) {
      continue;
    }
    const { implementationsToFind, fieldsToMerge } = implementations;
    for (const implementation of implementationsToFind) {
      const objectType = state.types.get(implementation);
      if (!objectType) {
        // some kind of bug ?
        continue;
      }

      if (objectType.kind != TypeKind.OBJECT) {
        // some kind of bug ?
        continue;
      }
      for (const fieldToMerge of fieldsToMerge) {
        const { field } = fieldToMerge;
        const joinDirective = createJoinFieldDirectiveNode({});
        const newField = structuredClone(field);
        newField.ast.directives.push(joinDirective);
        objectType.fields.set(newField.name, newField);
      }
    }
  }

  for (const [_, interfaceContext] of interfaces) {
    const { interfaceType, graphName, typeName } = interfaceContext;
    const { fieldsToMerge } = interfacesToModify.get(typeName)!;
    const keyFields = interfaceType.keys.map(key => key.fields.split(' ')).flat();
    const foreignGraphs = [];
    for (const field of interfaceType.fields.values()) {
      if (keyFields.includes(field.name)) {
        continue;
      }

      field.ast.directives.push(createJoinFieldDirectiveNode({ graph: graphName }));
    }
    for (const { field, graph } of fieldsToMerge) {
      // add join__field directive to each field contributed by @interfaceObject
      interfaceType.fields.set(field.name, field);
      field.ast.directives.push(createJoinFieldDirectiveNode({ graph }));
      foreignGraphs.push(graph);
    }
    for (const foreignGraph of foreignGraphs) {
      // add join__type directive to the interface type itself
      const directive = createJoinTypeDirectiveNode({
        graph: foreignGraph,
        isInterfaceObject: true,
        key: keyFields.join(' '),
      });
      interfaceType.ast.directives.push(directive);
    }
  }

  return {};
}
