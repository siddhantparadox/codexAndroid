import { z } from "zod";
export declare const pairingPayloadSchema: z.ZodObject<{
    v: z.ZodLiteral<1>;
    name: z.ZodString;
    token: z.ZodString;
    endpoints: z.ZodEffects<z.ZodObject<{
        lan: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
        tailscale: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    }, "strip", z.ZodTypeAny, {
        lan?: string | undefined;
        tailscale?: string | undefined;
    }, {
        lan?: string | undefined;
        tailscale?: string | undefined;
    }>, {
        lan?: string | undefined;
        tailscale?: string | undefined;
    }, {
        lan?: string | undefined;
        tailscale?: string | undefined;
    }>;
    cwdHint: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    v: 1;
    name: string;
    token: string;
    endpoints: {
        lan?: string | undefined;
        tailscale?: string | undefined;
    };
    cwdHint?: string | undefined;
}, {
    v: 1;
    name: string;
    token: string;
    endpoints: {
        lan?: string | undefined;
        tailscale?: string | undefined;
    };
    cwdHint?: string | undefined;
}>;
export type PairingPayload = z.infer<typeof pairingPayloadSchema>;
export declare const parsePairingPayload: (input: unknown) => PairingPayload;
//# sourceMappingURL=pairing.d.ts.map