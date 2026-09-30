import type { GraphQLSchema, GraphQLType, GraphQLNamedType, GraphQLObjectType, GraphQLField, GraphQLInterfaceType } from 'graphql';
import {
  isObjectType,
  isInterfaceType,
  isScalarType,
  isEnumType,
  isInputObjectType,
  isListType,
  isNonNullType,
  getNamedType,
  parse
} from 'graphql';
import type { GraphQLInputType } from 'graphql';
import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import type { QueryBuilder, SelectionFn, FieldSelection, BuildContext } from './types.js';
import { isVariable } from './variables.js';

/**
 * Create a callable proxy that supports both function calls and property access
 * - builder.query(q => [...]) - anonymous operation
 * - builder.query('Name', q => [...]) - named operation (backward compatible)
 * - builder.query.Name(q => [...]) - named operation (new fluent API)
 */
function createOperationProxy(
  operationType: 'query' | 'mutation' | 'subscription',
  getRootType: () => GraphQLObjectType,
  context: BuildContext
): any {
  // Base function for direct calls
  const baseFunction = (nameOrSelectionFn: any, selectionFn?: any) => {
    if (typeof nameOrSelectionFn === 'function') {
      // Anonymous operation: builder.query(q => [...])
      return buildOperation(operationType, getRootType(), nameOrSelectionFn, context);
    }
    // Named operation (string): builder.query('Name', q => [...])
    return buildOperation(operationType, getRootType(), selectionFn as SelectionFn, context, nameOrSelectionFn as string);
  };

  // Create proxy to intercept property access
  return new Proxy(baseFunction, {
    get(target, prop: string) {
      // Ignore symbols and built-in properties
      if (typeof prop === 'symbol' || prop.startsWith('_')) {
        return undefined;
      }

      // Return a function that will be called with the selection function
      // This enables: builder.query.SearchMyIssues(q => [...])
      return (selectionFn: SelectionFn) => {
        return buildOperation(operationType, getRootType(), selectionFn, context, prop);
      };
    },
    // Make the proxy callable
    apply(target, thisArg, args: [any, any?]) {
      return baseFunction.apply(thisArg, args);
    }
  });
}

/**
 * Create a query builder for a GraphQL schema
 * 
 * @template TQueryFields - Optional type for Query fields (for full type safety)
 * @template TMutationFields - Optional type for Mutation fields (for full type safety)
 * 
 * @example Untyped usage:
 * ```typescript
 * const builder = createQueryBuilder(schema);
 * ```
 * 
 * @example Typed usage:
 * ```typescript
 * import type { QueryFields, MutationFields } from './generated/field-types';
 * const builder = createQueryBuilder<QueryFields, MutationFields>(schema);
 * ```
 */
export function createQueryBuilder<TQueryFields = any, TMutationFields = any>(
  schema: GraphQLSchema
): QueryBuilder<TQueryFields, TMutationFields> {
  const context: BuildContext = {
    schema,
    variables: new Map(),
    fragments: new Map(),
  };

  return {
    query: createOperationProxy('query', () => schema.getQueryType()!, context),
    mutation: createOperationProxy('mutation', () => schema.getMutationType()!, context),
    subscription: createOperationProxy('subscription', () => schema.getSubscriptionType()!, context),
  } as QueryBuilder<TQueryFields, TMutationFields>;
}


/**
 * Convert array-based selections to internal FieldSelection array
 * Supports:
 * - q.user.id - path-based selection
 * - q.user({ id: '123' }, ...) - selection with args
 * 
 * Groups selections by root field and builds nested structure
 */
function normalizeArraySelections(selectionsArray: any[]): FieldSelection[] {
  const groupedByField = new Map<string, FieldSelection[]>();
  
  for (const selection of selectionsArray) {
    // Extract field selection
    let fieldSelection: FieldSelection;
    
    // If it's a callable with __fieldSelection marker (property access or path)
    if (selection && typeof selection === 'function' && selection.__fieldSelection) {
      fieldSelection = selection.__fieldSelection;
    }
    // If it's already a FieldSelection object
    else if (selection && typeof selection === 'object' && 'name' in selection) {
      fieldSelection = selection;
    } else {
      throw new Error(`Invalid selection in array: ${selection}`);
    }
    
    // Group by root field name
    const rootField = fieldSelection.name;
    if (!groupedByField.has(rootField)) {
      groupedByField.set(rootField, []);
    }
    groupedByField.get(rootField)!.push(fieldSelection);
  }
  
  // Merge grouped selections
  const merged: FieldSelection[] = [];
  for (const [fieldName, fieldSelections] of groupedByField) {
    if (fieldSelections.length === 1) {
      // Single selection for this field
      merged.push(fieldSelections[0]);
    } else {
      // Multiple selections - merge them
      const first = fieldSelections[0];
      const allSubSelections: FieldSelection[] = [];
      
      for (const fs of fieldSelections) {
        if (fs.selection) {
          allSubSelections.push(...fs.selection);
        }
      }
      
      merged.push({
        name: fieldName,
        args: first.args,
        selection: allSubSelections.length > 0 ? allSubSelections : undefined
      });
    }
  }
  
  return merged;
}

/**
 * Convert object-based selection to internal FieldSelection array
 * Supports:
 * - { id: user.id } - simple field
 * - { user: user(...) } - nested object
 * - { myUser: user(...) } - aliased field
 */
function normalizeSelections(selectionsObj: Record<string, any>): FieldSelection[] {
  const selections: FieldSelection[] = [];
  
  for (const [key, value] of Object.entries(selectionsObj)) {
    // Extract the actual field selection
    let fieldSelection: FieldSelection;
    
    // If it's a callable with __fieldSelection marker (property access)
    if (value && typeof value === 'function' && value.__fieldSelection) {
      fieldSelection = value.__fieldSelection;
    }
    // If it's already a FieldSelection object
    else if (value && typeof value === 'object' && 'name' in value) {
      fieldSelection = value;
    } else {
      throw new Error(`Invalid selection for key "${key}": ${value}`);
    }
    
    // Check if this is an alias (key !== field name)
    if (key !== fieldSelection.name) {
      fieldSelection = { ...fieldSelection, alias: key };
    }
    
    // Note: nested selections are already normalized in createFieldSelection
    // No need to normalize them again here!
    
    selections.push(fieldSelection);
  }
  
  return selections;
}

/**
 * Build a GraphQL operation (query/mutation/subscription)
 */
function buildOperation<TResult = any>(
  operationType: 'query' | 'mutation' | 'subscription',
  rootType: GraphQLObjectType,
  selectionFn: SelectionFn<any, TResult>,
  context: BuildContext,
  operationName?: string
): TypedDocumentNode<TResult, any> {
  // Reset variables for this operation
  context.variables.clear();

  // Create proxy for the root type
  const proxy = createTypeProxy(rootType, context);

  // Execute selection function to collect fields
  const selectionsResult = selectionFn(proxy);

  // Detect if it's an array or object and normalize accordingly
  const selections = Array.isArray(selectionsResult)
    ? normalizeArraySelections(selectionsResult)
    : normalizeSelections(selectionsResult as Record<string, any>);

  // Build the operation string
  const operationString = buildOperationString(operationType, selections, context, operationName);

  // Parse into a DocumentNode
  const documentNode = parse(operationString);

  // Return as TypedDocumentNode with inferred result type
  return documentNode as TypedDocumentNode<TResult, any>;
}

/**
 * Create a Proxy for a GraphQL type that intercepts field access
 * Supports both object types and interface types
 * Now with PATH TRACKING for nested property access (q.user.id)
 * 
 * NEW: Support for "select all scalars" via:
 * - user['*'] - explicit wildcard
 * - user - returning object proxy selects all scalars automatically
 */
function createTypeProxy(
  type: GraphQLObjectType | GraphQLInterfaceType, 
  context: BuildContext,
  parentPath: string[] = []
): any {
  const fields = type.getFields();

  return new Proxy({} as any, {
    get(target, prop: string) {
      // Handle wildcard '*' for "select all scalars"
      if (prop === '*') {
        return createSelectAllScalars(type, context);
      }

      // Ignore symbols and built-in properties
      if (typeof prop === 'symbol' || prop.startsWith('_') || prop === '__fieldSelection') {
        return target[prop];
      }

      // Ignore common built-in Object properties
      const builtinProps = ['toString', 'valueOf', 'toLocaleString', 'hasOwnProperty', 'isPrototypeOf', 'propertyIsEnumerable', 'constructor'];
      if (builtinProps.includes(prop)) {
        return target[prop];
      }

      const field = fields[prop];
      if (!field) {
        throw new Error(`Field "${prop}" does not exist on type "${type.name}"`);
      }

      const currentPath = [...parentPath, prop];
      const fieldType = getNamedType(field.type);
      const isScalar = isScalarType(fieldType) || isEnumType(fieldType);

      // For scalar fields with no args
      if (isScalar && field.args.length === 0) {
        const selection = createFieldSelectionFromPath(currentPath, fields, context);
        const callable = (() => selection) as any;
        callable.__fieldSelection = selection;
        return callable;
      }

      // For object fields, return a proxy that supports BOTH:
      // 1. Function call: q.user({ id: '123' }, ...)
      // 2. Property access: q.user.id
      // 3. NEW: Direct reference: user.profile → selects all scalars in profile
      if (isObjectType(fieldType) || isInterfaceType(fieldType)) {
        const nestedProxy = createTypeProxy(
          fieldType as GraphQLObjectType | GraphQLInterfaceType,
          context,
          currentPath  // Pass the path down!
        );
        
        // For path-based access, create the field selection with expanded scalars
        const pathFieldSelection = createFieldSelectionFromPath(
          currentPath, 
          fields, 
          context, 
          true // expandScalars flag
        );
        
        // Make it callable for function-style access
        const callableProxy = new Proxy(
          (...args: any[]) => createFieldSelection(prop, field, args, context),
          {
            get(target, nestedProp) {
              // Return __fieldSelection if requested
              if (nestedProp === '__fieldSelection') {
                return pathFieldSelection;
              }
              // Delegate other property access to nested proxy
              return nestedProxy[nestedProp];
            },
            apply(target, thisArg, args) {
              // Handle function calls
              return createFieldSelection(prop, field, args, context);
            }
          }
        );
        
        return callableProxy;
      }

      // For scalar fields with args, return a function
      return (...args: any[]): FieldSelection => {
        return createFieldSelection(prop, field, args, context);
      };
    },
  });
}

/**
 * Create a field selection from a path (for q.user.id style access)
 * 
 * @param expandScalars - If true, expand all scalar fields at the leaf node
 */
function createFieldSelectionFromPath(
  path: string[],
  rootFields: Record<string, GraphQLField<any, any>>,
  context: BuildContext,
  expandScalars = false
): FieldSelection {
  if (path.length === 0) {
    throw new Error('Path cannot be empty');
  }

  // Build nested structure from path
  const [fieldName, ...rest] = path;
  const field = rootFields[fieldName];
  
  if (!field) {
    throw new Error(`Field "${fieldName}" not found`);
  }

  if (rest.length === 0) {
    // Leaf node
    const fieldType = getNamedType(field.type);
    
    // If expandScalars is true and this is an object type, expand all its scalars
    if (expandScalars && (isObjectType(fieldType) || isInterfaceType(fieldType))) {
      const objectType = fieldType as GraphQLObjectType | GraphQLInterfaceType;
      const scalarSelections = expandAllScalarFields(objectType, context);
      
      return {
        name: fieldName,
        args: undefined,
        selection: scalarSelections
      };
    }
    
    // Otherwise, just return the field
    return {
      name: fieldName,
      args: undefined,
      selection: undefined
    };
  }

  // Has nested path - recursively build
  const fieldType = getNamedType(field.type);
  if (isObjectType(fieldType) || isInterfaceType(fieldType)) {
    const nestedFields = (fieldType as GraphQLObjectType | GraphQLInterfaceType).getFields();
    const nestedSelection = createFieldSelectionFromPath(rest, nestedFields, context, expandScalars);
    
    return {
      name: fieldName,
      args: undefined,
      selection: [nestedSelection]
    };
  }

  throw new Error(`Cannot access path ${path.join('.')} - ${fieldName} is not an object type`);
}

/**
 * Expand all scalar fields (and enums) from a GraphQL type
 * Returns an array of field selections for all scalars
 */
function expandAllScalarFields(
  type: GraphQLObjectType | GraphQLInterfaceType,
  context: BuildContext
): FieldSelection[] {
  const fields = type.getFields();
  const selections: FieldSelection[] = [];

  for (const [fieldName, field] of Object.entries(fields)) {
    // Skip fields with required arguments (can't auto-select them)
    const hasRequiredArgs = field.args.some(arg => isNonNullType(arg.type));
    if (hasRequiredArgs) {
      continue;
    }

    const fieldType = getNamedType(field.type);
    
    // Only include scalars and enums (leaf types)
    if (isScalarType(fieldType) || isEnumType(fieldType)) {
      selections.push({
        name: fieldName,
        args: undefined,
        selection: undefined
      });
    }
  }

  return selections;
}

/**
 * Create a callable that selects all scalars (for user['*'] syntax)
 */
function createSelectAllScalars(
  type: GraphQLObjectType | GraphQLInterfaceType,
  context: BuildContext
): any {
  const scalarSelections = expandAllScalarFields(type, context);
  
  // Return the selections wrapped in a way that the normalization can handle
  const callable = (() => scalarSelections) as any;
  
  // Mark each scalar selection as a proper field selection
  // This allows spreading: [...user['*'], user.extraField]
  return scalarSelections.map(sel => {
    const c = (() => sel) as any;
    c.__fieldSelection = sel;
    return c;
  });
}

/**
 * Create a field selection from arguments
 */
function createFieldSelection(
  fieldName: string,
  field: GraphQLField<any, any>,
  args: any[],
  context: BuildContext
): FieldSelection {
  let fieldArgs: Record<string, any> | undefined;
  let selectionFn: SelectionFn | undefined;

  // Parse arguments: can be (selectionFn) or (args, selectionFn) or ()
  if (args.length === 0) {
    // Scalar field with no args
  } else if (args.length === 1) {
    if (typeof args[0] === 'function') {
      selectionFn = args[0];
    } else {
      fieldArgs = args[0];
    }
  } else if (args.length === 2) {
    fieldArgs = args[0];
    selectionFn = args[1];
  }

  // Process field arguments and collect variables
  if (fieldArgs) {
    fieldArgs = processArguments(fieldArgs, field, context);
  }

  // If there's a selection function, recursively build nested selections
  let nestedSelections: FieldSelection[] | undefined;
  if (selectionFn) {
    const fieldType = getNamedType(field.type);
    // Support both object types and interface types (interfaces also have fields)
    if (isObjectType(fieldType) || isInterfaceType(fieldType)) {
      const nestedProxy = createTypeProxy(fieldType as GraphQLObjectType | GraphQLInterfaceType, context);
      const nestedSelectionsResult = selectionFn(nestedProxy);
      
      // Handle both array and object returns
      nestedSelections = Array.isArray(nestedSelectionsResult)
        ? normalizeArraySelections(nestedSelectionsResult)
        : normalizeSelections(nestedSelectionsResult as Record<string, any>);
    }
  }

  return {
    name: fieldName,
    args: fieldArgs,
    selection: nestedSelections,
  };
}

/**
 * Marker key for enum literal values — strings that must be emitted
 * unquoted (GraphQL enum values are not String literals).
 */
const ENUM_LITERAL = '__gqlbEnum';

/**
 * Process field arguments and extract variables
 */
function processArguments(
  args: Record<string, any>,
  field: GraphQLField<any, any>,
  context: BuildContext
): Record<string, any> {
  const processed: Record<string, any> = {};

  for (const [argName, argValue] of Object.entries(args)) {
    const fieldArg = field.args.find(a => a.name === argName);
    processed[argName] = processArgumentValue(argValue, fieldArg?.type, context);
  }

  return processed;
}

/**
 * Process a single argument value with schema-aware type handling.
 *
 * - Variables register their REAL declared type (not the old 'String'
 *   hardcode that broke nested variables)
 * - Enum-typed string values are wrapped in the ENUM_LITERAL marker so
 *   formatArgumentValue emits them unquoted
 * - Lists recurse per element, input objects recurse per field
 */
function processArgumentValue(
  value: any,
  argType: GraphQLInputType | undefined,
  context: BuildContext
): any {
  if (isVariable(value)) {
    context.variables.set(value.name, {
      type: argType ? printType(argType) : 'String',
      required: (argType ? isNonNullType(argType) : false) || value.required,
    });
    return `$${value.name}`;
  }

  let t = argType;
  while (t && isNonNullType(t)) t = t.ofType;

  if (t && isListType(t) && Array.isArray(value)) {
    const inner = t.ofType;
    return value.map(v => processArgumentValue(v, inner, context));
  }

  if (t && isEnumType(t) && typeof value === 'string') {
    return { [ENUM_LITERAL]: value };
  }

  if (t && isInputObjectType(t) && value && typeof value === 'object' && !Array.isArray(value)) {
    const fields = t.getFields();
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = processArgumentValue(v, fields[k]?.type, context);
    }
    return out;
  }

  // No type info — recurse structurally (backward compatible)
  if (Array.isArray(value)) {
    return value.map(v => processArgumentValue(v, undefined, context));
  }
  if (value && typeof value === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = processArgumentValue(v, undefined, context);
    }
    return out;
  }
  return value;
}

/**
 * Build the final operation string
 */
function buildOperationString(
  operationType: string,
  selections: FieldSelection[],
  context: BuildContext,
  operationName?: string
): string {
  const parts: string[] = [];

  // Build operation header
  const opName = operationName ? ` ${operationName}` : '';
  
  // Add operation with variables
  if (context.variables.size > 0) {
    const varDeclarations = Array.from(context.variables.entries())
      .map(([name, { type, required }]) => {
        // Don't add ! if type already ends with ! (from schema)
        const needsExclamation = required && !type.endsWith('!');
        return `$${name}: ${type}${needsExclamation ? '!' : ''}`;
      })
      .join(', ');
    parts.push(`${operationType}${opName}(${varDeclarations}) {`);
  } else {
    parts.push(`${operationType}${opName} {`);
  }

  // Add selections
  for (const selection of selections) {
    parts.push(buildSelectionString(selection, 1));
  }

  parts.push('}');

  return parts.join('\n');
}

/**
 * Build a selection string (field with optional nested selections)
 */
function buildSelectionString(selection: FieldSelection, indent: number): string {
  const indentation = '  '.repeat(indent);
  const parts: string[] = [];

  // Field name with optional alias
  let fieldStr = selection.alias ? `${selection.alias}: ${selection.name}` : selection.name;

  // Add arguments
  if (selection.args) {
    const argStr = Object.entries(selection.args)
      .map(([name, value]) => `${name}: ${formatArgumentValue(value)}`)
      .join(', ');
    fieldStr += `(${argStr})`;
  }

  // Add nested selections
  if (selection.selection && selection.selection.length > 0) {
    parts.push(`${indentation}${fieldStr} {`);
    for (const nested of selection.selection) {
      parts.push(buildSelectionString(nested, indent + 1));
    }
    parts.push(`${indentation}}`);
  } else {
    parts.push(`${indentation}${fieldStr}`);
  }

  return parts.join('\n');
}

/**
 * Format an argument value for GraphQL
 */
function formatArgumentValue(value: any): string {
  if (value && typeof value === 'object' && ENUM_LITERAL in value) {
    // Enum literal — emitted bare, never quoted
    return String((value as Record<string, any>)[ENUM_LITERAL]);
  }
  if (typeof value === 'string' && value.startsWith('$')) {
    // Variable reference
    return value;
  }
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'boolean' || typeof value === 'number') {
    return String(value);
  }
  if (value === null) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map(formatArgumentValue).join(', ')}]`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value)
      .map(([k, v]) => `${k}: ${formatArgumentValue(v)}`)
      .join(', ');
    return `{${entries}}`;
  }
  return String(value);
}

/**
 * Print a GraphQL type as a string
 */
function printType(type: GraphQLType): string {
  if (isNonNullType(type)) {
    return `${printType(type.ofType)}!`;
  }
  if (isListType(type)) {
    return `[${printType(type.ofType)}]`;
  }
  return (type as GraphQLNamedType).name;
}

