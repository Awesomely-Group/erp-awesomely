export const ROLE_COLORS = {
  gray:   { bg: "bg-gray-100",   text: "text-gray-700",   dot: "bg-gray-400" },
  indigo: { bg: "bg-indigo-100", text: "text-indigo-700", dot: "bg-indigo-400" },
  blue:   { bg: "bg-blue-100",   text: "text-blue-700",   dot: "bg-blue-400" },
  green:  { bg: "bg-green-100",  text: "text-green-700",  dot: "bg-green-400" },
  yellow: { bg: "bg-yellow-100", text: "text-yellow-700", dot: "bg-yellow-400" },
  orange: { bg: "bg-orange-100", text: "text-orange-700", dot: "bg-orange-400" },
  red:    { bg: "bg-red-100",    text: "text-red-700",    dot: "bg-red-400" },
  purple: { bg: "bg-purple-100", text: "text-purple-700", dot: "bg-purple-400" },
  pink:   { bg: "bg-pink-100",   text: "text-pink-700",   dot: "bg-pink-400" },
  teal:   { bg: "bg-teal-100",   text: "text-teal-700",   dot: "bg-teal-400" },
} as const;

export type RoleColor = keyof typeof ROLE_COLORS;

export const ROLE_COLOR_KEYS = Object.keys(ROLE_COLORS) as RoleColor[];

export function roleColorClasses(color: string): { bg: string; text: string; dot: string } {
  return ROLE_COLORS[color as RoleColor] ?? ROLE_COLORS.gray;
}
