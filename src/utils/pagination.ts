export interface PaginationParams {
  page: number;
  limit: number;
  skip: number;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// Parses page/limit query params into safe numbers.
// Falls back to page 1 / limit 10 if missing or invalid.
// Caps limit at 100 so no one can request the entire collection in one go.
export const getPaginationParams = (query: any): PaginationParams => {
  let page = Number(query.page) || 1;
  let limit = Number(query.limit) || 10;

  if (page < 1) page = 1;
  if (limit < 1) limit = 10;
  if (limit > 100) limit = 100;

  const skip = (page - 1) * limit;

  return { page, limit, skip };
};

export const buildPaginationMeta = (
  page: number,
  limit: number,
  total: number
): PaginationMeta => ({
  page,
  limit,
  total,
  totalPages: Math.ceil(total / limit) || 1,
});