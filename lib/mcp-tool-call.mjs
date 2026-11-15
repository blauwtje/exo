const MCP_PREFIXED = /^mcp:\S/;

export function mcpToolCall(command) {
  return MCP_PREFIXED.test(command) ? command : null;
}
