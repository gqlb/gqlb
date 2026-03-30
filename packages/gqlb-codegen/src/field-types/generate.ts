/**
 * Generate fully typed FieldFn types from GraphQL schema
 * 
 * Key insight: Field selections return a marker type, not the actual value!
 * The value type is only used for type inference, not the return type.
 */

import { GraphQLSchema, GraphQLObjectType, GraphQLInterfaceType, GraphQLField, isNonNullType, isListType, isScalarType, isEnumType, isObjectType, isInterfaceType, isUnionType, GraphQLOutputType, GraphQLUnionType, GraphQLNamedType } from 'graphql';

/**
 * Generate the Args type name that GraphQL Codegen will create.
 * 
 * We directly query the GraphQL schema to determine which fields have arguments,
 * then generate the type name using GraphQL Codegen's standard naming convention.
 * 
 * This is the most reliable approach because:
 * 1. We have direct access to the schema (no file parsing needed)
 * 2. We know exactly which fields have args: `field.args.length > 0`
 * 3. We use the standard GraphQL Codegen naming: ParentType + CapitalizedFieldName + "Args"
 * 
 * @param parentTypeName - Parent type name (e.g., "Query", "Mutation", "User")
 * @param fieldName - Field name (e.g., "createUser", "posts")
 * @returns The Args type name (e.g., "QueryCreateUserArgs")
 * 
 * @example
 * generateArgsTypeName('Query', 'user') // => 'QueryUserArgs'
 * generateArgsTypeName('Mutation', 'createUser') // => 'MutationCreateUserArgs'
 */
function generateArgsTypeName(parentTypeName: string, fieldName: string): string {
  // GraphQL Codegen with namingConvention: 'keep' preserves the original field name casing
  // Example: Backlog.cards -> BacklogcardsArgs (NOT BacklogCardsArgs)
  return `${parentTypeName}${fieldName}Args`;
}

interface FieldInfo {
  name: string;
  typeName: string;
  isNonNull: boolean;
  isList: boolean;
  isScalar: boolean;
  hasArgs: boolean;
  argsTypeName: string | null;
  hasRequiredArgs: boolean;
}

function unwrapType(type: GraphQLOutputType): {
  baseType: GraphQLNamedType;
  isNonNull: boolean;
  isList: boolean;
} {
  // The outermost NonNull determines whether the field itself can be null.
  // We check it once before entering the loop so that inner NonNull wrappers
  // (e.g. inside a nested list like [[String!]!]) do not override it.
  const isNonNull = isNonNullType(type);
  let isList = false;
  let current: GraphQLOutputType = type;

  // Unwrap all wrapping types (NonNull and List at any nesting depth)
  // until we reach a named type (scalar, object, enum, interface, union).
  while (isNonNullType(current) || isListType(current)) {
    if (isListType(current)) {
      isList = true;
    }
    current = (current as { ofType: GraphQLOutputType }).ofType;
  }

  return { baseType: current as GraphQLNamedType, isNonNull, isList };
}

function getFieldInfo(
  field: GraphQLField<unknown, unknown>,
  parentTypeName: string,
  referencedTypes: Set<string>
): FieldInfo {
  const { baseType, isNonNull, isList } = unwrapType(field.type);
  const typeName = baseType.name;
  const isScalar = isScalarType(baseType) || isEnumType(baseType);
  
  if (isEnumType(baseType)) {
    referencedTypes.add(typeName);
  }
  
  const hasArgs = Object.keys(field.args).length > 0;
  // Generate the Args type name using GraphQL Codegen's standard convention
  const argsTypeName = hasArgs ? generateArgsTypeName(parentTypeName, field.name) : null;
  const hasRequiredArgs = field.args.some(arg => isNonNullType(arg.type));

  return {
    name: field.name,
    typeName,
    isNonNull,
    isList,
    isScalar,
    hasArgs,
    argsTypeName,
    hasRequiredArgs
  };
}

function generateFieldType(field: FieldInfo): string {
  const { name, typeName, isNonNull, isList, isScalar, hasArgs, argsTypeName, hasRequiredArgs } = field;

  // Build result type
  let resultType: string;
  if (isScalar) {
    const scalarMap: Record<string, string> = {
      'String': 'string',
      'Int': 'number',
      'Float': 'number',
      'Boolean': 'boolean',
      'ID': 'string',
      'DateTime': 'string',
      // Common custom scalars
      'Long': 'number',
      'BigDecimal': 'number',
      'Date': 'string',
      'JSON': 'unknown',
      'JSONObject': 'Record<string, unknown>'
    };
    // Default unknown custom scalars to 'string' (most common mapping)
    const baseType = scalarMap[typeName] || 'string';
    resultType = isList ? `${baseType}[]` : baseType;
  } else {
    const baseType = `${typeName}Fields`;
    resultType = isList ? `${baseType}[]` : baseType;
  }
  
  if (!isNonNull) {
    resultType = `${resultType} | null`;
  }

  // Generate field signature compatible with TypedOperationBuilder
  // All fields return FieldSelection<T, FieldName> where:
  // - T is the inferred result type  
  // - FieldName enables array-based type inference
  // Args accept WithVariables to allow TypedVariable usage
  if (isScalar) {
    // Scalar field - encode field name for array inference!
    const scalarFieldType = `FieldSelection<${resultType}, "${name}">`;
    if (hasArgs) {
      if (hasRequiredArgs) {
        return `  ${name}: (args: WithVariables<${argsTypeName}>) => ${scalarFieldType};`;
      } else {
        return `  ${name}: (args?: WithVariables<${argsTypeName}>) => ${scalarFieldType};`;
      }
    } else {
      return `  ${name}: ${scalarFieldType};`;
    }
  } else {
    // Object field - requires selection
    // NEW: Use generic TSelection to enable automatic type inference!
    // ALSO encode field name for array inference!
    // IMPORTANT: Wrap in array type if the field returns a list!
    
    const inferredType = isList 
      ? `InferResultType<TSelection>[]` 
      : `InferResultType<TSelection>`;
    
    // Add null if the field is nullable
    const finalType = isNonNull ? inferredType : `${inferredType} | null`;
    
    if (hasArgs) {
      if (hasRequiredArgs) {
        return `  ${name}: <TSelection>(args: WithVariables<${argsTypeName}>, select: (obj: ${typeName}Fields) => TSelection) => FieldSelection<${finalType}, "${name}">;`;
      } else {
        return `  ${name}: {
    <TSelection>(select: (obj: ${typeName}Fields) => TSelection): FieldSelection<${finalType}, "${name}">;
    <TSelection>(args: WithVariables<${argsTypeName}>, select: (obj: ${typeName}Fields) => TSelection): FieldSelection<${finalType}, "${name}">;
  };`;
      }
    } else {
      return `  ${name}: <TSelection>(select: (obj: ${typeName}Fields) => TSelection) => FieldSelection<${finalType}, "${name}">;`;
    }
  }
}

function generateTypeFields(
  type: GraphQLObjectType | GraphQLInterfaceType,
  referencedTypes: Set<string>
): string {
  const fields = Object.values(type.getFields());
  const fieldInfos = fields.map(field => getFieldInfo(field, type.name, referencedTypes));
  
  const lines: string[] = [
    `export interface ${type.name}Fields {`
  ];
  
  for (const fieldInfo of fieldInfos) {
    lines.push(generateFieldType(fieldInfo));
  }
  
  lines.push('}');
  lines.push('');
  
  return lines.join('\n');
}

export interface GenerateFieldTypesOptions {
  /** GraphQL schema instance */
  schema: GraphQLSchema;
  /** Relative path from output file to schema-types.ts (generated by graphql-codegen) */
  schemaTypesImportPath: string;
  /**
   * Import path for helper types (FieldSelection, TypedVariable, WithVariables)
   * @default 'gqlb' - Imports TypedFieldSelection, TypedVariable, WithVariables from gqlb
   */
  helpersImportPath?: string;
}

/**
 * Generate TypeScript field types from a GraphQL schema
 * 
 * @param options - Configuration options
 * @returns Generated TypeScript code as string
 * 
 * @example
 * ```typescript
 * import { buildSchema } from 'graphql';
 * import { generateFieldTypes } from 'gqlb-codegen/field-types';
 * 
 * const schema = buildSchema(`
 *   type Query {
 *     hello: String!
 *   }
 * `);
 * 
 * const code = generateFieldTypes({
 *   schema,
 *   schemaTypesImportPath: './schema-types.js'
 * });
 * ```
 */
export function generateFieldTypes(options: GenerateFieldTypesOptions): string {
  const { schema, schemaTypesImportPath, helpersImportPath = 'gqlb' } = options;
  
  const argsTypes = new Set<string>();
  const referencedTypes = new Set<string>();
  
  // Generate import statement based on helpers path
  const importStatement = helpersImportPath === 'gqlb' 
    ? `import type { TypedFieldSelection as FieldSelection, TypedVariable, WithVariables, InferResultType } from 'gqlb';`
    : `import type { FieldSelection, TypedVariable, WithVariables, InferResultType } from '${helpersImportPath}';`;
  
  const output: string[] = [
    '/**',
    ' * Generated field types for fully typed query builder',
    ' * DO NOT EDIT - Generated by gqlb-codegen',
    ' */',
    '',
    '// Import helper types',
    importStatement,
    'export type { FieldSelection, TypedVariable, WithVariables, InferResultType };',
    '',
    '// Import generated schema types',
    'import type {',
  ];

  // Scan all fields to collect types (both object types and interfaces)
  const typeMap = schema.getTypeMap();
  const objectAndInterfaceTypes = Object.values(typeMap).filter(
    type => (isObjectType(type) || isInterfaceType(type)) && !type.name.startsWith('__')
  ) as (GraphQLObjectType | GraphQLInterfaceType)[];

  // Collect args types
  const queryType = schema.getQueryType();
  const mutationType = schema.getMutationType();

  if (queryType) {
    Object.values(queryType.getFields()).forEach(field => {
      if (field.args.length > 0) {
        argsTypes.add(generateArgsTypeName('Query', field.name));
      }
    });
  }

  if (mutationType) {
    Object.values(mutationType.getFields()).forEach(field => {
      if (field.args.length > 0) {
        argsTypes.add(generateArgsTypeName('Mutation', field.name));
      }
    });
  }

  // Collect nested field args (from both object types and interfaces)
  for (const type of objectAndInterfaceTypes) {
    const fields = Object.values(type.getFields());
    fields.forEach(field => {
      getFieldInfo(field, type.name, referencedTypes);
      if (field.args.length > 0) {
        argsTypes.add(generateArgsTypeName(type.name, field.name));
      }
    });
  }

  const allImports = [...Array.from(argsTypes), ...Array.from(referencedTypes)].sort();
  output.push(...allImports.map(t => `  ${t},`));
  output.push(`} from '${schemaTypesImportPath}';`);
  output.push('');

  // Generate object types and interface types
  for (const type of objectAndInterfaceTypes) {
    output.push(generateTypeFields(type, referencedTypes));
  }

  // Generate union types
  const unionTypes = Object.values(typeMap).filter(
    type => isUnionType(type) && !type.name.startsWith('__')
  ) as GraphQLUnionType[];

  for (const unionType of unionTypes) {
    const possibleTypes = unionType.getTypes().map(t => `${t.name}Fields`).join(' | ');
    output.push(`export type ${unionType.name}Fields = ${possibleTypes};`);
    output.push('');
  }

  return output.join('\n');
}

