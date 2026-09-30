import { z } from "zod";

export const MarketIntelligenceSchema = z.object({
  query: z
    .string()
    .describe("The research topic, consumer trend, or retail innovation query to search for"),
  limit: z
    .number()
    .optional()
    .default(5)
    .describe("Maximum number of evidence nodes and insights to retrieve (default: 5)"),
});

export const EarningsIntelligenceSchema = z.object({
  query: z
    .string()
    .describe("The strategic topic, financial metric, margin issue, or consumer demand pattern to analyze"),
  ticker: z
    .string()
    .optional()
    .describe("Specific stock ticker (e.g. 'NKE', 'WMT', 'CMG', 'TGT') to isolate to"),
  limit: z
    .number()
    .optional()
    .default(5)
    .describe("Maximum number of transcript excerpts or disclosures to retrieve (default: 5)"),
});

export const ConsultHumanAgentSchema = z.object({
  agent_id: z
    .string()
    .describe("The expert slug (e.g. 'ben-dietz', 'peter-abraham', 'piers-fawkes', 'anu-lingala')"),
  question: z
    .string()
    .describe("Specific strategic question or scenario to consult the expert about"),
});
