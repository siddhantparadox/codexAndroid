import { z } from "zod";
const wsUrlSchema = z
    .string()
    .url()
    .refine((value) => value.startsWith("ws://") || value.startsWith("wss://"), {
    message: "endpoint must start with ws:// or wss://"
});
export const pairingPayloadSchema = z.object({
    v: z.literal(1),
    name: z.string().min(1),
    token: z.string().min(24),
    endpoints: z
        .object({
        lan: wsUrlSchema.optional(),
        tailscale: wsUrlSchema.optional()
    })
        .refine((endpoints) => Boolean(endpoints.lan || endpoints.tailscale), {
        message: "at least one endpoint is required"
    }),
    cwdHint: z.string().optional()
});
export const parsePairingPayload = (input) => pairingPayloadSchema.parse(input);
