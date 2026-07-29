// SPDX-License-Identifier: GPL-3.0-or-later

import Meta from 'gi://Meta';
import Shell from 'gi://Shell';


function cleanIdentifier(value) {
    if (typeof value !== 'string')
        return '';

    return value.trim();
}


function optionalCall(object, methodName) {
    try {
        const method = object?.[methodName];

        if (typeof method !== 'function')
            return null;

        return method.call(object);
    } catch {
        /*
         * A single unusual or disappearing MetaWindow must not break
         * focus matching or the application picker.
         */
        return null;
    }
}


/*
 * Keep application picking and focus matching on the exact same set of
 * identifiers. The first value is the preferred display identifier, while
 * every value is added when an application is enabled from Preferences.
 */
export function windowIdentityCandidates(window) {
    if (!window)
        return [];

    const values = [
        optionalCall(window, 'get_wm_class'),
        optionalCall(window, 'get_wm_class_instance'),
        optionalCall(window, 'get_gtk_application_id'),
        optionalCall(window, 'get_sandboxed_app_id'),
    ];

    return [
        ...new Set(
            values
                .map(cleanIdentifier)
                .filter(value => value.length > 0)
        ),
    ];
}


export function focusedWindowIdentity() {
    return (
        windowIdentityCandidates(
            global.display.focus_window
        )[0]
        ?? ''
    );
}


function openWindows() {
    const windows = [];
    const seen = new Set();

    const addWindow = window => {
        if (!window || seen.has(window))
            return;

        seen.add(window);
        windows.push(window);
    };

    try {
        for (
            const window
            of global.display.list_all_windows()
        ) {
            addWindow(window);
        }
    } catch (error) {
        console.error(
            '[DiscordVoiceOverlay] Could not list Meta windows:',
            error
        );
    }

    /*
     * Keep a compositor-actor fallback for Shell/Mutter revisions where
     * a newly mapped window has not yet appeared in list_all_windows().
     */
    try {
        for (
            const actor
            of global.get_window_actors?.() ?? []
        ) {
            addWindow(
                actor.meta_window
                ?? actor.get_meta_window?.()
            );
        }
    } catch (error) {
        console.error(
            '[DiscordVoiceOverlay] Could not list window actors:',
            error
        );
    }

    return windows;
}


export function listOpenApplicationsJson(
    protocolVersion,
    extensionVersion
) {
    const tracker =
        Shell.WindowTracker.get_default();

    const applications = new Map();
    const windows = openWindows();

    const visibleWindowTypes = new Set([
        Meta.WindowType.NORMAL,
        Meta.WindowType.DIALOG,
        Meta.WindowType.MODAL_DIALOG,
        Meta.WindowType.UTILITY,
    ]);

    let eligibleWindowCount = 0;

    for (const window of windows) {
        if (
            !window
            || optionalCall(
                window,
                'is_override_redirect'
            )
        ) {
            continue;
        }

        const windowType =
            optionalCall(
                window,
                'get_window_type'
            );

        if (
            windowType !== undefined
            && windowType !== null
            && !visibleWindowTypes.has(windowType)
        ) {
            continue;
        }

        const identifiers =
            windowIdentityCandidates(window);

        if (identifiers.length === 0)
            continue;

        eligibleWindowCount += 1;

        let app = null;

        try {
            app =
                tracker.get_window_app(window);
        } catch {
            /*
             * Keep the window pickable by its Meta identifiers even if
             * Shell cannot associate it with a desktop application.
             */
        }

        const rawDesktopId =
            cleanIdentifier(
                optionalCall(app, 'get_id')
            );

        /*
         * Shell uses transient window:<id> identifiers for applications
         * without a desktop file. They are useful as grouping keys only,
         * not as persistent application metadata.
         */
        const desktopId =
            rawDesktopId.startsWith('window:')
                ? ''
                : rawDesktopId;

        const title =
            cleanIdentifier(
                optionalCall(window, 'get_title')
            );

        const name =
            cleanIdentifier(
                optionalCall(app, 'get_name')
            )
            || title
            || identifiers[0];

        const key =
            desktopId
            || identifiers[0];

        let entry = applications.get(key);

        if (!entry) {
            entry = {
                name,
                desktopId,
                identifiers: [],
                titles: [],
                windowCount: 0,
            };

            applications.set(key, entry);
        }

        entry.windowCount += 1;

        for (const identifier of identifiers) {
            if (!entry.identifiers.includes(identifier))
                entry.identifiers.push(identifier);
        }

        if (
            title
            && !entry.titles.includes(title)
            && entry.titles.length < 3
        ) {
            entry.titles.push(title);
        }
    }

    const sortedApplications = [
        ...applications.values(),
    ].sort(
        (left, right) =>
            left.name.localeCompare(right.name)
            || left.identifiers[0]
                .localeCompare(right.identifiers[0])
    );

    return JSON.stringify({
        protocolVersion,
        extensionVersion,
        totalWindowCount: windows.length,
        eligibleWindowCount,
        applications: sortedApplications,
    });
}
