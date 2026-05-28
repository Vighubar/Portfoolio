import { writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const config = {
  mcpServers: {
    "Figma Desktop": {
      url: "http://127.0.0.1:3845/mcp",
      autoApprove: ["get_metadata", "get_design_context", "get_screenshot"]
    },
    retune: {
      url: "http://127.0.0.1:9223/mcp"
    }
  }
};

const path = join(homedir(), '.kiro', 'settings', 'mcp.json');
writeFileSync(path, JSON.stringify(config, null, 2));
console.log('Written to', path);
