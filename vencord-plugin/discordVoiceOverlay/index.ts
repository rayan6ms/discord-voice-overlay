/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 rayan6ms
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import definePlugin, { PluginNative, ReporterTestable } from "@utils/types";
import { findStoreLazy } from "@webpack";
import {
    ApplicationStreamingStore,
    ChannelStore,
    GuildMemberStore,
    SelectedChannelStore,
    UserStore,
    VoiceStateStore
} from "@webpack/common";

import { getAvatarUrl } from "./avatar";

const Native = VencordNative.pluginHelpers.DiscordVoiceOverlay as PluginNative<typeof import("./native")>;

const STATE_PROTOCOL_VERSION = 2 as const;
const HEARTBEAT_INTERVAL_MS = 15_000;

// SpeakingStore is not exported by @webpack/common.
const SpeakingStore = findStoreLazy("SpeakingStore") as {
    isSpeaking(userId: string): boolean;
};

interface OverlayUser {
    id: string;
    name: string;
    username: string;
    avatar: string;
    speaking: boolean;
    live: boolean;
    muted: boolean;
    deafened: boolean;
    self: boolean;
}

interface OverlayState {
    version: typeof STATE_PROTOCOL_VERSION;
    publishedAt: number;
    connected: boolean;
    users: OverlayUser[];
}

let heartbeatTimer: number | undefined;
let scheduledPublishTimer: number | undefined;
let lastStateJson = "";
let lastPublishedAt = 0;
let running = false;
let pendingForce = false;
let publishQueue = Promise.resolve();

function getVoiceChannelId(): string | null {
    // Prefer the actual voice connection over the selected UI channel.
    const store = VoiceStateStore as any;

    let current: string | null | undefined;

    if (typeof store.getCurrentClientVoiceChannelId === "function") {
        try {
            current = store.getCurrentClientVoiceChannelId();
        } catch {
            current = null;
        }
    }

    // Some Discord builds expose the method but still return null.
    current ??= SelectedChannelStore.getVoiceChannelId();

    return current ?? null;
}

function isSpeaking(userId: string): boolean {
    try {
        return Boolean(SpeakingStore?.isSpeaking?.(userId));
    } catch {
        return false;
    }
}

function isLive(
    userId: string,
    channelId: string,
    guildId: string | null
): boolean {
    try {
        // getAnyStreamForUser() can briefly retain a stopped stream.
        const stream =
            (
                ApplicationStreamingStore
                    ?.getActiveStreamForUser?.(
                        userId,
                        guildId
                    )
                ?? ApplicationStreamingStore
                    ?.getStreamForUser?.(
                        userId,
                        guildId
                    )
            ) as any;

        if (!stream)
            return false;

        const streamChannelId =
            stream.channelId
            ?? stream.channel_id
            ?? null;

        return (
            streamChannelId == null
            || String(streamChannelId) === channelId
        );
    } catch {
        return false;
    }
}

function buildState(): Omit<OverlayState, "publishedAt"> {
    const channelId = getVoiceChannelId();
    const channel = channelId
        ? ChannelStore.getChannel(channelId)
        : null;

    if (!channelId || !channel) {
        return {
            version: STATE_PROTOCOL_VERSION,
            connected: false,
            users: []
        };
    }

    const currentUser = UserStore.getCurrentUser();

    const voiceStates = VoiceStateStore.getVoiceStatesForChannel(channelId) as Record<string, any>;
    const guildId = channel.guild_id ?? null;

    const users: OverlayUser[] = [];

    for (const userId of Object.keys(voiceStates ?? {})) {
        const voiceState = voiceStates[userId];
        const user = UserStore.getUser(userId);

        if (!user)
            continue;

        let nickname: string | null = null;

        if (guildId) {
            try {
                nickname =
                    GuildMemberStore.getNick(guildId, userId)
                    ?? null;
            } catch {
                nickname = null;
            }
        }

        const displayName =
            nickname
            ?? (user as any).globalName
            ?? user.username
            ?? userId;

        users.push({
            id: userId,
            name: displayName,
            username: user.username ?? displayName,
            avatar: getAvatarUrl(user),

            speaking: isSpeaking(userId),
            live: isLive(
                userId,
                channelId,
                guildId
            ),

            muted: Boolean(
                voiceState?.mute
                || voiceState?.selfMute
            ),

            deafened: Boolean(
                voiceState?.deaf
                || voiceState?.selfDeaf
            ),

            self: userId === currentUser?.id
        });
    }

    // Keep the local user first and everyone else in a stable order.
    users.sort((a, b) => {
        if (a.self !== b.self)
            return a.self ? -1 : 1;

        return a.name.localeCompare(b.name);
    });

    return {
        version: STATE_PROTOCOL_VERSION,
        connected: true,
        users
    };
}

async function publishState(force = false) {
    try {
        const state = buildState();

        const stateJson =
            JSON.stringify(state);

        const now = Date.now();

        if (
            !force
            && stateJson === lastStateJson
            && now - lastPublishedAt < HEARTBEAT_INTERVAL_MS
        ) {
            return;
        }

        const json =
            JSON.stringify(
                {
                    ...state,
                    publishedAt: now
                },
                null,
                2
            )
            + "\n";

        await Native.writeState(json);
        lastStateJson = stateJson;
        lastPublishedAt = now;
    } catch (error) {
        console.error(
            "[DiscordVoiceOverlay] Failed to publish state:",
            error
        );
    }
}

function schedulePublish(force = false) {
    if (!running)
        return;

    pendingForce ||= force;

    if (scheduledPublishTimer !== undefined)
        return;

    // Coalesce related Flux events dispatched in the same turn.
    scheduledPublishTimer =
        window.setTimeout(
            () => {
                scheduledPublishTimer = undefined;

                const forceNow = pendingForce;
                pendingForce = false;

                publishQueue = publishQueue
                    .then(async () => {
                        if (running)
                            await publishState(forceNow);
                    });
            },
            0
        );
}

export default definePlugin({
    name: "DiscordVoiceOverlay",

    description:
        "Exports Discord voice activity for a local GNOME overlay.",

    authors: [
        {
            name: "rayan6ms",
            id: 0n
        }
    ],

    reporterTestable: ReporterTestable.None,

    flux: {
        SPEAKING: () => schedulePublish(),
        VOICE_STATE_UPDATES: () => schedulePublish(),
        VOICE_CHANNEL_SELECT: () => schedulePublish(),
        CONNECTION_CLOSED: () => schedulePublish(),
        CONNECTION_OPEN: () => schedulePublish(),
        CONNECTION_RESUMED: () => schedulePublish(),

        AUDIO_SET_SELF_MUTE: () => schedulePublish(),
        AUDIO_TOGGLE_SELF_MUTE: () => schedulePublish(),
        AUDIO_TOGGLE_SELF_DEAF: () => schedulePublish(),

        STREAM_CREATE: () => schedulePublish(),
        STREAM_DELETE: () => schedulePublish(),
        STREAM_UPDATE: () => schedulePublish(),
        STREAMING_UPDATE: () => schedulePublish(),
        STREAM_START: () => schedulePublish(),
        STREAM_STOP: () => schedulePublish(),
        STREAM_CLOSE: () => schedulePublish(),

        CHANNEL_UPDATES: () => schedulePublish(),
        GUILD_MEMBER_UPDATE: () => schedulePublish(),
        CURRENT_USER_UPDATE: () => schedulePublish(),
        USER_UPDATE: () => schedulePublish()
    },

    start() {
        if (heartbeatTimer !== undefined)
            window.clearInterval(heartbeatTimer);

        if (scheduledPublishTimer !== undefined)
            window.clearTimeout(scheduledPublishTimer);

        running = true;
        lastStateJson = "";
        lastPublishedAt = 0;
        pendingForce = false;
        publishQueue = Promise.resolve();

        // The heartbeat lets GNOME detect an unclean Discord exit.
        heartbeatTimer = window.setInterval(
            () => schedulePublish(true),
            HEARTBEAT_INTERVAL_MS
        );

        schedulePublish(true);
    },

    stop() {
        running = false;

        if (heartbeatTimer !== undefined) {
            window.clearInterval(heartbeatTimer);
            heartbeatTimer = undefined;
        }

        if (scheduledPublishTimer !== undefined) {
            window.clearTimeout(
                scheduledPublishTimer
            );

            scheduledPublishTimer = undefined;
        }

        lastStateJson = "";
        lastPublishedAt = 0;
        pendingForce = false;

        publishQueue = publishQueue
            .catch(() => undefined)
            .then(() => Native.clearState())
            .catch(error => {
                console.error(
                    "[DiscordVoiceOverlay] Failed to clear state:",
                    error
                );
            });
    }
});
