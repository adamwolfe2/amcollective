/**
 * CEO Tool Definitions — aggregates all domain-specific tool definitions
 */

import type Anthropic from "@anthropic-ai/sdk";
import { definitions as memoryDefinitions } from "./memory-tools";
import { definitions as communicationDefinitions } from "./communication-tools";
import { definitions as crmDefinitions } from "./crm-tools";
import { definitions as financeDefinitions } from "./finance-tools";
import { definitions as operationsDefinitions } from "./operations-tools";
import { definitions as systemDefinitions } from "./system-tools";

export const CEO_TOOL_DEFINITIONS: Anthropic.Tool[] = [
  ...memoryDefinitions,
  ...communicationDefinitions,
  ...crmDefinitions,
  ...financeDefinitions,
  ...operationsDefinitions,
  ...systemDefinitions,
];
