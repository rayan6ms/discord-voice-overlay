// SPDX-License-Identifier: GPL-3.0-or-later

export function monitorForPoint(
    monitors,
    primaryMonitor,
    x,
    y
) {
    for (const monitor of monitors) {
        if (
            x >= monitor.x
            && x < monitor.x + monitor.width
            && y >= monitor.y
            && y < monitor.y + monitor.height
        ) {
            return monitor;
        }
    }

    let nearest = null;
    let nearestDistance = Infinity;

    for (const monitor of monitors) {
        const nearestX =
            Math.max(
                monitor.x,
                Math.min(
                    monitor.x + monitor.width,
                    x
                )
            );

        const nearestY =
            Math.max(
                monitor.y,
                Math.min(
                    monitor.y + monitor.height,
                    y
                )
            );

        const distance =
            (x - nearestX) ** 2
            + (y - nearestY) ** 2;

        if (distance < nearestDistance) {
            nearestDistance = distance;
            nearest = monitor;
        }
    }

    return nearest ?? primaryMonitor ?? null;
}


export function fitRectToMonitor(
    width,
    height,
    monitor,
    proposedX,
    proposedY,
    margin
) {
    if (!monitor)
        return [proposedX, proposedY];

    const minX =
        monitor.x + margin;

    const minY =
        monitor.y + margin;

    const maxX =
        Math.max(
            minX,
            monitor.x
            + monitor.width
            - width
            - margin
        );

    const maxY =
        Math.max(
            minY,
            monitor.y
            + monitor.height
            - height
            - margin
        );

    return [
        Math.max(
            minX,
            Math.min(maxX, proposedX)
        ),

        Math.max(
            minY,
            Math.min(maxY, proposedY)
        ),
    ];
}


export function actorShouldAnchorRight(
    actorX,
    actorWidth,
    monitor
) {
    return (
        actorX + actorWidth / 2
        > monitor.x + monitor.width / 2
    );
}
