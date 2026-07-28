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


const Native = VencordNative.pluginHelpers.DiscordVoiceOverlay as PluginNative<typeof import("./native")>;


/*
 * SpeakingStore is not exported by @webpack/common, so retrieve
 * Discord's Flux store by its stable store name.
 */
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
    version: 1;

    connected: boolean;

    channel: null | {
        id: string;
        name: string;
        guildId: string | null;
    };

    users: OverlayUser[];
}


let timer: number | undefined;
let lastJson = "";
let running = false;
let publishQueue = Promise.resolve();


function getVoiceChannelId(): string | null {
    /*
     * Prefer the actual client voice connection rather than whatever
     * channel happens to be selected in Discord's UI.
     */
    const store = VoiceStateStore as any;

    let current: string | null | undefined;

    if (typeof store.getCurrentClientVoiceChannelId === "function") {
        try {
            current = store.getCurrentClientVoiceChannelId();
        } catch {
            current = null;
        }
    }

    /*
     * Some Discord builds expose getCurrentClientVoiceChannelId()
     * but return null here. Vencord itself currently uses
     * SelectedChannelStore.getVoiceChannelId() for the active VC,
     * so fall back when the first result is empty as well.
     */
    current ??= SelectedChannelStore.getVoiceChannelId();

    return current ?? null;
}


function getAvatarUrl(user: any): string {
    /*
     * Discord's User object normally provides getAvatarURL().
     * Prefer it so Discord itself handles avatar format/defaults.
     */
    try {
        if (typeof user?.getAvatarURL === "function") {
            const url = user.getAvatarURL(undefined, 64, true);

            if (url)
                return url;
        }
    } catch {
        // Fall through to constructing the CDN URL ourselves.
    }

    if (user?.avatar) {
        const extension =
            String(user.avatar).startsWith("a_")
                ? "gif"
                : "png";

        return (
            "https://cdn.discordapp.com/avatars/"
            + `${user.id}/${user.avatar}.${extension}?size=64`
        );
    }

    /*
     * Handles both legacy discriminator accounts and the newer
     * username system's six default avatars.
     */
    let defaultIndex = 0;

    try {
        if (user?.discriminator && user.discriminator !== "0")
            defaultIndex = Number(user.discriminator) % 5;
        else
            defaultIndex = Number((BigInt(user.id) >> 22n) % 6n);
    } catch {
        defaultIndex = 0;
    }

    return `https://cdn.discordapp.com/embed/avatars/${defaultIndex}.png`;
}


function isSpeaking(userId: string): boolean {
    try {
        return Boolean(SpeakingStore?.isSpeaking?.(userId));
    } catch {
        return false;
    }
}


/*
 * Discord exposes both ApplicationStream and active Stream objects.
 * getAnyStreamForUser() handles either representation.
 */
function isLive(
    userId: string,
    channelId: string,
    guildId: string | null
): boolean {
    try {
        /*
         * Use Discord's active-stream lookup rather than
         * getAnyStreamForUser(), which may retain an application-stream
         * object briefly after sharing ends.
         */
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


function buildState(): OverlayState {
    const channelId = getVoiceChannelId();

    if (!channelId) {
        return {
            version: 1,
            connected: false,
            channel: null,
            users: []
        };
    }

    const channel = ChannelStore.getChannel(channelId);

    if (!channel) {
        return {
            version: 1,
            connected: false,
            channel: null,
            users: []
        };
    }

    const currentUser = UserStore.getCurrentUser();

    const voiceStates = VoiceStateStore.getVoiceStatesForChannel(channelId) as Record<string, any>;

    const users: OverlayUser[] = [];

    for (const userId of Object.keys(voiceStates ?? {})) {
        const voiceState = voiceStates[userId];
        const user = UserStore.getUser(userId);

        if (!user)
            continue;

        const guildId = channel.guild_id ?? null;

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
                channel.guild_id ?? null
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

    /*
     * Keep ordering stable so a speaking change doesn't randomly
     * rearrange people in the overlay.
     *
     * Local user first; everyone else alphabetically.
     */
    users.sort((a, b) => {
        if (a.self !== b.self)
            return a.self ? -1 : 1;

        return a.name.localeCompare(b.name);
    });

    return {
        version: 1,
        connected: true,

        channel: {
            id: channelId,
            name: channel.name ?? "Voice Channel",
            guildId: channel.guild_id ?? null
        },

        users
    };
}


async function publishState(force = false) {
    try {
        const state = buildState();

        const json =
            JSON.stringify(state, null, 2)
            + "\n";

        /*
         * Don't touch the filesystem 5 times per second unless
         * something actually changed.
         */
        if (!force && json === lastJson)
            return;

        await Native.writeState(json);
        lastJson = json;
    } catch (error) {
        console.error(
            "[DiscordVoiceOverlay] Failed to publish state:",
            error
        );
    }
}


function queuePublish(force = false) {
    publishQueue = publishQueue
        .then(async () => {
            if (running)
                await publishState(force);
        });
}


export default definePlugin({
    name: "DiscordVoiceOverlay",

    description:
        "Exports the current Discord voice channel for a local GNOME overlay.",

    authors: [
        {
            name: "rayan6ms",
            id: 0n
        }
    ],

    reporterTestable: ReporterTestable.None,


    start() {
        if (timer !== undefined)
            window.clearInterval(timer);

        running = true;
        lastJson = "";
        publishQueue = Promise.resolve();

        /*
         * 200 ms is responsive enough for speaking indicators while
         * remaining extremely cheap. Files are only written when the
         * resulting state actually changes.
         */
        timer = window.setInterval(
            () => queuePublish(),
            200
        );

        queuePublish(true);
    },


    stop() {
        running = false;

        if (timer !== undefined) {
            window.clearInterval(timer);
            timer = undefined;
        }

        lastJson = "";

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
