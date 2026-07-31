// Treat user input as literal text in MongoDB regex queries.
export const escapeRegex = (value: string): string => {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};
