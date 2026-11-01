import { z } from 'zod';
import { highScores } from './schema';

export const errorSchemas = {
  validation: z.object({ message: z.string(), field: z.string().optional() }),
  internal: z.object({ message: z.string() }),
};

export const api = {
  highScores: {
    list: {
      method: 'GET' as const,
      path: '/api/high-scores' as const,
      input: z.object({ limit: z.coerce.number().optional() }).optional(),
      responses: {
        200: z.array(z.custom<typeof highScores.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/high-scores' as const,
      input: z.object({
        score: z.number().int(),
        cudaCoresCollected: z.number().int(),
        distance: z.number().int(),
        flopsCollected: z.number().int().min(0).optional(),
        pcBuildFast: z.boolean().optional(),
      }),
      responses: {
        201: z.custom<typeof highScores.$inferSelect>(),
        400: errorSchemas.validation,
        401: errorSchemas.validation,
      },
    },
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) url = url.replace(`:${key}`, String(value));
    });
  }
  return url;
}

export type HighScoreResponse = z.infer<typeof api.highScores.create.responses[201]>;
export type HighScoresListResponse = z.infer<typeof api.highScores.list.responses[200]>;
export type ValidationError = z.infer<typeof errorSchemas.validation>;
