import { z } from "zod";

const bridgeHelloPayloadSchema = z.object({
  type: z.literal("hello"),
  v: z.literal(1),
  name: z.string().min(1),
  cwd: z.string(),
  endpoints: z.object({
    lan: z.string().url().optional(),
    tailscale: z.string().url().optional()
  }),
  timestamp: z.number().int().positive()
});

const bridgePingPayloadSchema = z.object({
  type: z.literal("ping"),
  t: z.number().int().nonnegative()
});

const bridgePongPayloadSchema = z.object({
  type: z.literal("pong"),
  t: z.number().int().nonnegative()
});

const bridgeErrorPayloadSchema = z.object({
  type: z.literal("error"),
  code: z.string().min(1),
  message: z.string().min(1)
});

const bridgeAuthBrowserLaunchPayloadSchema = z.object({
  type: z.literal("authBrowserLaunch"),
  url: z.string().url(),
  success: z.boolean(),
  message: z.string().min(1).optional()
});

export const bridgePayloadSchema = z.discriminatedUnion("type", [
  bridgeHelloPayloadSchema,
  bridgePingPayloadSchema,
  bridgePongPayloadSchema,
  bridgeErrorPayloadSchema,
  bridgeAuthBrowserLaunchPayloadSchema
]);

export const bridgeControlMessageSchema = z.object({
  __bridge: bridgePayloadSchema
});

export type BridgePayload = z.infer<typeof bridgePayloadSchema>;
export type BridgeControlMessage = z.infer<typeof bridgeControlMessageSchema>;

export const isBridgeControlMessage = (input: unknown): input is BridgeControlMessage =>
  bridgeControlMessageSchema.safeParse(input).success;

export const parseBridgeControlMessage = (input: unknown): BridgeControlMessage =>
  bridgeControlMessageSchema.parse(input);
