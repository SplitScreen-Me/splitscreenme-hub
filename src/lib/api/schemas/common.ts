import { z } from '../zod';

/** Shared API schemas. Resource schemas of section 5.3 live next to this file. */

export const Id = z
  .string()
  .regex(/^[A-Za-z0-9]{1,64}$/)
  .openapi({ example: 'RkbcpmL5dNbrDcfjL' });

export const ApiError = z
  .object({
    error: z.object({
      code: z.string().openapi({ example: 'not_found' }),
      message: z.string(),
      issues: z.array(z.unknown()).optional(),
    }),
  })
  .openapi('Error');

export const Health = z.object({ status: z.literal('ok') }).openapi('Health');
