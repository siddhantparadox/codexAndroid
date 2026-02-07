import { z } from "zod";
export declare const bridgePayloadSchema: z.ZodDiscriminatedUnion<"type", [z.ZodObject<{
    type: z.ZodLiteral<"hello">;
    v: z.ZodLiteral<1>;
    name: z.ZodString;
    cwd: z.ZodString;
    endpoints: z.ZodObject<{
        lan: z.ZodOptional<z.ZodString>;
        tailscale: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        lan?: string | undefined;
        tailscale?: string | undefined;
    }, {
        lan?: string | undefined;
        tailscale?: string | undefined;
    }>;
    timestamp: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    v: 1;
    type: "hello";
    name: string;
    endpoints: {
        lan?: string | undefined;
        tailscale?: string | undefined;
    };
    cwd: string;
    timestamp: number;
}, {
    v: 1;
    type: "hello";
    name: string;
    endpoints: {
        lan?: string | undefined;
        tailscale?: string | undefined;
    };
    cwd: string;
    timestamp: number;
}>, z.ZodObject<{
    type: z.ZodLiteral<"ping">;
    t: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    type: "ping";
    t: number;
}, {
    type: "ping";
    t: number;
}>, z.ZodObject<{
    type: z.ZodLiteral<"pong">;
    t: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    type: "pong";
    t: number;
}, {
    type: "pong";
    t: number;
}>, z.ZodObject<{
    type: z.ZodLiteral<"error">;
    code: z.ZodString;
    message: z.ZodString;
}, "strip", z.ZodTypeAny, {
    code: string;
    message: string;
    type: "error";
}, {
    code: string;
    message: string;
    type: "error";
}>]>;
export declare const bridgeControlMessageSchema: z.ZodObject<{
    __bridge: z.ZodDiscriminatedUnion<"type", [z.ZodObject<{
        type: z.ZodLiteral<"hello">;
        v: z.ZodLiteral<1>;
        name: z.ZodString;
        cwd: z.ZodString;
        endpoints: z.ZodObject<{
            lan: z.ZodOptional<z.ZodString>;
            tailscale: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            lan?: string | undefined;
            tailscale?: string | undefined;
        }, {
            lan?: string | undefined;
            tailscale?: string | undefined;
        }>;
        timestamp: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        v: 1;
        type: "hello";
        name: string;
        endpoints: {
            lan?: string | undefined;
            tailscale?: string | undefined;
        };
        cwd: string;
        timestamp: number;
    }, {
        v: 1;
        type: "hello";
        name: string;
        endpoints: {
            lan?: string | undefined;
            tailscale?: string | undefined;
        };
        cwd: string;
        timestamp: number;
    }>, z.ZodObject<{
        type: z.ZodLiteral<"ping">;
        t: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        type: "ping";
        t: number;
    }, {
        type: "ping";
        t: number;
    }>, z.ZodObject<{
        type: z.ZodLiteral<"pong">;
        t: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        type: "pong";
        t: number;
    }, {
        type: "pong";
        t: number;
    }>, z.ZodObject<{
        type: z.ZodLiteral<"error">;
        code: z.ZodString;
        message: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        code: string;
        message: string;
        type: "error";
    }, {
        code: string;
        message: string;
        type: "error";
    }>]>;
}, "strip", z.ZodTypeAny, {
    __bridge: {
        v: 1;
        type: "hello";
        name: string;
        endpoints: {
            lan?: string | undefined;
            tailscale?: string | undefined;
        };
        cwd: string;
        timestamp: number;
    } | {
        type: "ping";
        t: number;
    } | {
        type: "pong";
        t: number;
    } | {
        code: string;
        message: string;
        type: "error";
    };
}, {
    __bridge: {
        v: 1;
        type: "hello";
        name: string;
        endpoints: {
            lan?: string | undefined;
            tailscale?: string | undefined;
        };
        cwd: string;
        timestamp: number;
    } | {
        type: "ping";
        t: number;
    } | {
        type: "pong";
        t: number;
    } | {
        code: string;
        message: string;
        type: "error";
    };
}>;
export type BridgePayload = z.infer<typeof bridgePayloadSchema>;
export type BridgeControlMessage = z.infer<typeof bridgeControlMessageSchema>;
export declare const isBridgeControlMessage: (input: unknown) => input is BridgeControlMessage;
export declare const parseBridgeControlMessage: (input: unknown) => BridgeControlMessage;
//# sourceMappingURL=bridge.d.ts.map