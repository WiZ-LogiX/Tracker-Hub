/**
 * Shared template rendering utility for notification templates.
 * Replaces `{{key}}` placeholders with values from a vars dict.
 */
export function templateRender(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? "");
}
