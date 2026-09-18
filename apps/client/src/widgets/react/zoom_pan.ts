import type { RefObject } from "preact";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import type { ReactZoomPanPinchRef } from "react-zoom-pan-pinch";

interface ZoomPanPinchOptions {
    /** The closest in and the furthest out the content can be taken, as the wrapper is given them. */
    minScale: number;
    maxScale: number;
    /** Puts the scale back to 1 when this changes, for a wrapper that is remounted under the hook. */
    resetOn?: unknown;
    /** Called with the scale on every change, for whatever else a caller derives from it. */
    onScaleChange?: (scale: number) => void;
}

/**
 * Drives a react-zoom-pan-pinch instance: the ref to hand `TransformWrapper`, the scale it is at,
 * whether either step has room left, and the three things a set of zoom controls does to it.
 *
 * `onTransform` goes on the wrapper, so the scale here follows every change — a button, the wheel,
 * a pinch, a double click. `wheel` turns the library's own wheel handler off in favour of
 * {@link useZoomPanWheel}.
 */
export function useZoomPanPinch({ minScale, maxScale, resetOn, onScaleChange }: ZoomPanPinchOptions) {
    const ref = useRef<ReactZoomPanPinchRef>(null);
    const [ scale, setScale ] = useState(1);

    // Read through a ref so a caller can pass a fresh closure without rewiring the wrapper.
    const onScaleChangeRef = useRef(onScaleChange);
    useEffect(() => { onScaleChangeRef.current = onScaleChange; });

    useEffect(() => { setScale(1); }, [ resetOn ]);

    const onTransform = useCallback((_ref: ReactZoomPanPinchRef, state: { scale: number }) => {
        setScale(state.scale);
        onScaleChangeRef.current?.(state.scale);
    }, []);

    return {
        ref,
        scale,
        onTransform,
        wheel: { disabled: true },
        canZoomIn: scale < maxScale * (1 - ZOOM_LIMIT_TOLERANCE),
        canZoomOut: scale > minScale * (1 + ZOOM_LIMIT_TOLERANCE),
        zoomIn: () => ref.current?.zoomIn(zoomStep(currentScale(ref), "in")),
        zoomOut: () => ref.current?.zoomOut(zoomStep(currentScale(ref), "out")),
        reset: () => ref.current?.resetTransform()
    };
}

/**
 * Zooms the content on a wheel notch, anchored on the pointer, in place of the library's own wheel
 * handler.
 *
 * That handler adds `step * |deltaY|` to the current scale (`handleWheelZoom`), and one step cannot
 * be both the `scale * (k - 1)` a notch in needs and the `scale * (1 - 1 / k)` a notch back needs.
 * A notch each way therefore leaves the content at `1 - k²` of where it started, so scrubbing the
 * wheel walks the view steadily smaller. Reading the direction off the event — which the library
 * cannot do before it has picked the step — and asking for a target scale removes that.
 *
 * `zoomIn`/`zoomOut` take the increment from the current scale to that target so that the library
 * clamps it to `minScale`/`maxScale` and recomputes its bounds; the transform that follows puts the
 * content back under the pointer, the library having zoomed toward the middle of the view.
 */
export function useZoomPanWheel(apiRef: RefObject<ReactZoomPanPinchRef>, element: HTMLElement | null) {
    useEffect(() => {
        if (!element) return;

        const onWheel = (event: WheelEvent) => {
            const api = apiRef.current;
            // A purely horizontal wheel carries no zoom, and is left to whatever else wants it.
            if (!api || event.deltaY === 0) return;
            event.preventDefault();

            const { scale, positionX, positionY } = api.instance.state;
            const target = wheelTargetScale(scale, event.deltaY);
            if (target > scale) api.zoomIn(target - scale, 0);
            else api.zoomOut(scale - target, 0);

            const rect = api.instance.wrapperComponent?.getBoundingClientRect();
            if (!rect) return;

            const zoomed = api.instance.state.scale;
            const anchored = zoomToPointPosition(
                scale, positionX, positionY, zoomed,
                event.clientX - rect.left, event.clientY - rect.top
            );
            const bounds = api.instance.bounds;
            const { x, y } = bounds ? clampPan(anchored.x, anchored.y, bounds) : anchored;
            api.setTransform(x, y, zoomed, 0);
        };

        element.addEventListener("wheel", onWheel, { passive: false });
        return () => element.removeEventListener("wheel", onWheel);
    }, [ apiRef, element ]);
}

/** What one press of a zoom step multiplies the scale by. */
const ZOOM_STEP = 1.2;
/**
 * What one wheel notch multiplies the scale by — gentler than a press, a notch being easy to repeat
 * and easy to overshoot with.
 */
const WHEEL_STEP = 1.1;
/** The `deltaY` a wheel notch reports where it reports a whole one; a trackpad reports far less. */
const WHEEL_NOTCH_DELTA = 100;
/**
 * How near a bound counts as being on it. The zoom animation reaches its target by adding the whole
 * difference back to the scale it started from, which can land a float's width short of the bound.
 */
const ZOOM_LIMIT_TOLERANCE = 1e-6;

/**
 * The increment that takes `scale` one {@link ZOOM_STEP} in the given direction.
 *
 * react-zoom-pan-pinch adds the step to the current scale rather than multiplying by it (see
 * `handleCalculateButtonZoom`), so a fixed step is a leap at the bottom of the range and a crawl at
 * the top: from a fitted view one press of a 0.5 step reaches a `minScale` of 0.5, while 98 more are
 * needed to reach a `maxScale` of 50. Scaling the step by the scale it applies to keeps every press
 * the same proportion of what is on screen.
 */
export function zoomStep(scale: number, direction: "in" | "out") {
    return direction === "in" ? scale * (ZOOM_STEP - 1) : scale * (1 - 1 / ZOOM_STEP);
}

/**
 * The scale a wheel notch takes `scale` to, multiplying or dividing by {@link WHEEL_STEP} so that a
 * notch each way returns to where it started. A trackpad reports a fraction of a notch and moves the
 * scale by that same fraction of the step.
 */
export function wheelTargetScale(scale: number, deltaY: number) {
    const factor = WHEEL_STEP ** (Math.abs(deltaY) / WHEEL_NOTCH_DELTA);
    return deltaY < 0 ? scale * factor : scale / factor;
}

interface PanBounds { minPositionX: number; maxPositionX: number; minPositionY: number; maxPositionY: number; }

/** Clamps a candidate content position to the library's computed pan bounds. */
export function clampPan(x: number, y: number, bounds: PanBounds): { x: number; y: number } {
    return {
        x: Math.min(Math.max(x, bounds.minPositionX), bounds.maxPositionX),
        y: Math.min(Math.max(y, bounds.minPositionY), bounds.maxPositionY)
    };
}

/**
 * The content translation that keeps a viewport point fixed across a scale change — i.e. a zoom
 * anchored on (`cursorX`, `cursorY`) (wrapper-local pixels) rather than the viewport centre.
 * `scale0`/`posX0`/`posY0` describe the transform before zooming to `scale1`.
 */
export function zoomToPointPosition(scale0: number, posX0: number, posY0: number, scale1: number, cursorX: number, cursorY: number): { x: number; y: number } {
    const contentX = (cursorX - posX0) / scale0;
    const contentY = (cursorY - posY0) / scale0;
    return { x: cursorX - contentX * scale1, y: cursorY - contentY * scale1 };
}

/** The scale the instance is at now, read as a button is pressed rather than when it was drawn. */
function currentScale(ref: RefObject<ReactZoomPanPinchRef>) {
    return ref.current?.instance?.state?.scale ?? 1;
}
