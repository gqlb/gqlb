/**
 * Test runner for gqlb - verifies query generation matches expected fixtures
 */
import { describe, test } from 'node:test';
import { strictEqual } from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { TypedDocumentNode } from '@graphql-typed-document-node/core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Normalize GraphQL query strings for comparison
 * - Trims whitespace
 * - Collapses multiple spaces
 * - Normalizes line endings
 */
function normalizeQuery(query: string): string {
  return query
    .trim()
    .replace(/\r\n/g, '\n')
    .replace(/\s+/g, ' ')
    .replace(/\s*\{\s*/g, ' { ')
    .replace(/\s*\}\s*/g, ' } ')
    .replace(/\s*\(\s*/g, '(')
    .replace(/\s*\)\s*/g, ') ')
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s*:\s*/g, ': ')
    .trim();
}

/**
 * Test a scenario against its fixture
 */
async function testScenario(
  name: string,
  _documentOrPromise: TypedDocumentNode | Promise<TypedDocumentNode>,
  documentKey = 'query'
): Promise<void> {
  await test(name, async () => {
    // Import the scenario module
    const module = await import(`./scenarios/${name}.ts`);
    const document: TypedDocumentNode = module[documentKey];
    
    // Get the generated query
    const generated = document.loc?.source.body;
    if (!generated) {
      throw new Error(`No query generated for ${name}`);
    }
    
    // Load the expected fixture
    const fixturePath = join(__dirname, 'fixtures', `${name}.graphql`);
    const expected = readFileSync(fixturePath, 'utf-8');
    
    // Normalize and compare
    const normalizedGenerated = normalizeQuery(generated);
    const normalizedExpected = normalizeQuery(expected);
    
    strictEqual(
      normalizedGenerated,
      normalizedExpected,
      `Generated query does not match fixture for ${name}`
    );
  });
}

describe('gqlb query builder', () => {
  describe('queries', () => {
    testScenario('01-query-simple', import('./scenarios/01-query-simple.ts').then(m => m.query));
    testScenario('02-query-with-args', import('./scenarios/02-query-with-args.ts').then(m => m.query));
    testScenario('03-query-with-variables', import('./scenarios/03-query-with-variables.ts').then(m => m.query));
    testScenario('04-query-arrays', import('./scenarios/04-query-arrays.ts').then(m => m.query));
    testScenario('05-query-nested', import('./scenarios/05-query-nested.ts').then(m => m.query));
    testScenario('06-query-nullable', import('./scenarios/06-query-nullable.ts').then(m => m.query));
    testScenario('07-query-nested-args', import('./scenarios/07-query-nested-args.ts').then(m => m.query));
    testScenario('08-named-operation', import('./scenarios/08-named-operation.ts').then(m => m.query));
    testScenario('09-multiple-fields', import('./scenarios/09-multiple-fields.ts').then(m => m.query));
    testScenario('12-query-result-access', import('./scenarios/12-query-result-access.ts').then(m => m.query));
    testScenario('14-array-result-access', import('./scenarios/14-array-result-access.ts').then(m => m.query));
    testScenario('15-wildcard-select-all', import('./scenarios/15-wildcard-select-all.ts').then(m => m.query));
    testScenario('16-wildcard-explicit-spread', import('./scenarios/16-wildcard-explicit-spread.ts').then(m => m.query));
    testScenario('17-query-enum-args', import('./scenarios/17-query-enum-args.ts').then(m => m.query));
    
    // Runtime test for complete flow with mock client (object syntax)
    test('12-query-result-access (runtime execution)', async () => {
      const module = await import('./scenarios/12-query-result-access.ts');
      
      // Test the complete flow
      const result = await module.testCompleteFlow();
      strictEqual(result.userId, '123', 'User ID should match');
      strictEqual(result.userName, 'John Doe', 'User name should match');
      strictEqual(result.userEmail, 'john@example.com', 'User email should match');
      
      // Test inline typing
      const inlineResult = await module.testInlineTyping();
      strictEqual(inlineResult.id, '456', 'User ID should match for inline test');
      strictEqual(inlineResult.name, 'John Doe', 'User name should match for inline test');
    });
    
    // Runtime test for ARRAY syntax (like typed-graphql-builder!)
    test('14-array-result-access (runtime execution)', async () => {
      const module = await import('./scenarios/14-array-result-access.ts');
      
      // Test array syntax with type inference
      const result = await module.testArraySyntaxWithInference();
      strictEqual(result.userId, '123', 'Array syntax: User ID should match');
      strictEqual(result.userName, 'John Doe', 'Array syntax: User name should match');
      strictEqual(result.userEmail, 'john@example.com', 'Array syntax: User email should match');
      
      // Test nested arrays
      const nestedResult = await module.testNestedArrays();
      strictEqual(nestedResult.firstUserId, '1', 'Nested array: User ID should match');
      strictEqual(nestedResult.firstUserName, 'Alice', 'Nested array: User name should match');
      strictEqual(nestedResult.firstPostTitle, 'Post 1', 'Nested array: Post title should match');
    });
  });

  describe('mutations', () => {
    testScenario('10-mutation-simple', import('./scenarios/10-mutation-simple.ts').then(m => m.mutation), 'mutation');
    testScenario('11-mutation-with-input', import('./scenarios/11-mutation-with-input.ts').then(m => m.mutation), 'mutation');
  });
});

