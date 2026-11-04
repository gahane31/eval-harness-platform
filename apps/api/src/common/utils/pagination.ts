import type { PaginationMeta } from '@eval/shared';

export function buildPagination(page: number, pageSize: number, total: number): PaginationMeta {
  return {
    page,
    pageSize,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
  };
}

export class Paginated<T> {
  constructor(
    readonly items: T[],
    readonly meta: PaginationMeta,
  ) {}
}
