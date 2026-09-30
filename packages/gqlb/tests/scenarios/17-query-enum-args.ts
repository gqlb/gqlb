/**
 * Enum argument values must be emitted UNQUOTED (bare literals).
 * GraphQL enums are not String literals — `role: "ADMIN"` is a spec
 * violation and servers reject it (argumentLiteralsIncompatible).
 */
import { createQueryBuilder } from '../../src/index.js';
import { $ } from '../../src/variables.js';
import { schema } from '../schema/index.js';
import { Role, Status } from '../schema/generated/schema-types.js';
import type { QueryFields } from '../schema/generated/field-types.js';

const builder = createQueryBuilder<QueryFields>(schema);

// Nested-position variable — must be declared with its REAL schema type
// ($ageVar: Int, not the old 'String' hardcode).
// (WithVariables types stop at union-wrapped fields; runtime supports it.)
const ageVar = $<number>('ageVar');

export const query = builder.query(q => ({
  searchUsers: q.searchUsers({
    filter: {
      role: Role.ADMIN,
      status: Status.ACTIVE,
      age: { gte: ageVar } as any
    }
  }, user => ({
    id: user.id,
    role: user.role,
    status: user.status
  })),

  // Single value into a list-typed enum arg — valid GraphQL input
  // coercion (states: OPEN ≡ states: [OPEN]); must still emit bare.
  // (graphql-codegen types require an array; GraphQL doesn't.)
  bySingle: q.usersByStatus({ statuses: Status.PENDING } as any, user => ({
    id: user.id
  })),

  // Top-level list of enum literals — the headline GitHub-style case
  // (pullRequests(states: [OPEN])).
  byList: q.usersByStatus({ statuses: [Status.ACTIVE, Status.INACTIVE] }, user => ({
    id: user.id
  })),

  // null into a nullable enum arg stays a literal — must not throw.
  byNull: q.searchUsers({ filter: { status: null } }, user => ({
    id: user.id
  }))
}));
