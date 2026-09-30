/**
 * Enum argument values must be emitted UNQUOTED (bare literals).
 * GraphQL enums are not String literals — `role: "ADMIN"` is a spec
 * violation and servers reject it (argumentLiteralsIncompatible).
 */
import { createQueryBuilder } from '../../src/index.js';
import { schema } from '../schema/index.js';
import { Role, Status } from '../schema/generated/schema-types.js';
import type { QueryFields } from '../schema/generated/field-types.js';

const builder = createQueryBuilder<QueryFields>(schema);

export const query = builder.query(q => ({
  searchUsers: q.searchUsers({
    filter: {
      role: Role.ADMIN,
      status: Status.ACTIVE
    }
  }, user => ({
    id: user.id,
    role: user.role,
    status: user.status
  })),

  // Single value into a list-typed enum arg — valid GraphQL input
  // coercion (states: OPEN ≡ states: [OPEN]); must still emit bare.
  // (graphql-codegen types require an array; GraphQL doesn't.)
  usersByStatus: q.usersByStatus({ statuses: Status.PENDING } as any, user => ({
    id: user.id
  }))
}));
