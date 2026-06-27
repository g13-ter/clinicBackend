// Escapes special regex characters in user input before it's used
// inside a MongoDB $regex query. Without this, characters like
// . * + ? ( ) [ ] { } | \ ^ $ change the meaning of the search
// instead of being treated as literal text, and a crafted input
// could trigger a slow/expensive pattern (ReDoS-lite).
export const escapeRegex = (value: string): string => {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};