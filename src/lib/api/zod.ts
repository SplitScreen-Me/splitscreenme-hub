import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

// Adds `.openapi()` to zod schemas, once. API schemas import `z` from here only.
extendZodWithOpenApi(z);

export { z };
