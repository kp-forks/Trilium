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
 * a pinch, a double click.
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
        wheel: { step: wheelStep(scale) },
        canZoomIn: scale < maxScale * (1 - ZOOM_LIMIT_TOLERANCE),
        canZoomOut: scale > minScale * (1 + ZOOM_LIMIT_TOLERANCE),
        zoomIn: () => ref.current?.zoomIn(zoomStep(currentScale(ref), "in")),
        zoomOut: () => ref.current?.zoomOut(zoomStep(currentScale(ref), "out")),
        reset: () => ref.current?.resetTransform()
    };
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
 * The `wheel.step` that makes a notch a {@link WHEEL_STEP}, at the scale the content is drawn at.
 *
 * react-zoom-pan-pinch adds `step * |deltaY|` to the current scale (see `handleWheelZoom`), so its
 * own default of 0.015 is a flat +1.5 a notch: from a diagram fitted at 0.5 one notch reaches 2.0,
 * while at 8 the same notch is barely a twelfth of what is on screen. Scaling the step by the scale
 * it applies to keeps a notch the same fraction of the view wherever it is taken from.
 *
 * The scale is the one last reported through `onTransform`, so a scroll fast enough to outrun a
 * render takes a notch or two sized for where it just was. The error is a fraction of one notch and
 * corrects itself on the next.
 */
export function wheelStep(scale: number) {
    return (scale * (WHEEL_STEP - 1)) / WHEEL_NOTCH_DELTA;
}

/** The scale the instance is at now, read as a button is pressed rather than when it was drawn. */
function currentScale(ref: RefObject<ReactZoomPanPinchRef>) {
    return ref.current?.instance?.state?.scale ?? 1;
}
