/**
 * Slim shim of cowork-gui's cli/helpers/imageResize. The real impl uses
 * sharp to downsize images before they're sent to the model. We don't
 * bundle sharp; pass the bytes through unchanged. Read.ts will still
 * surface a `[Image: foo.png]` placeholder + base64 data block.
 *
 * Return shape mirrors imageResize.shared.ts → ResizeResult.
 */

export interface ResizeResult {
    /** Base64-encoded image data. */
    data: string;
    mediaType: string;
    width: number;
    height: number;
    resized: boolean;
}

export async function resizeImageIfNeeded(
    buffer: Buffer,
    inputMediaType: string
): Promise<ResizeResult> {
    return {
        data: buffer.toString("base64"),
        mediaType: inputMediaType,
        width: 0,
        height: 0,
        resized: false,
    };
}
