/**
 * Pure validation and calculation utilities for image capture.
 * Extracted from CaptureScreen for testability.
 */

export const MIN_RESOLUTION = 480;
export const MIN_IMAGES = 4;
export const RECOMMENDED_IMAGES = 8;

/** Valid image file extensions (lowercase). */
export const VALID_EXTENSIONS = ['jpg', 'jpeg', 'png', 'heic', 'heif'] as const;

/**
 * Check whether an image meets the minimum resolution requirement.
 * Both width and height must be >= MIN_RESOLUTION.
 */
export function isValidResolution(width: number, height: number): boolean {
  return width >= MIN_RESOLUTION && height >= MIN_RESOLUTION;
}

/**
 * Check whether a filename has a supported image extension.
 * Returns true if the extension is in VALID_EXTENSIONS.
 * Returns false if no extension is found or the extension is unsupported.
 */
export function isSupportedExtension(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (!ext) return true; // No extension — let the picker handle it
  return (VALID_EXTENSIONS as readonly string[]).includes(ext);
}

/**
 * Calculate capture progress as a fraction [0, 1].
 */
export function calculateProgress(imageCount: number): number {
  return Math.min(imageCount / RECOMMENDED_IMAGES, 1);
}

export type ProgressColor = '#44aa44' | '#7c8aff' | '#cc8800';

/**
 * Determine the progress bar color based on image count.
 * - Green (#44aa44) when >= RECOMMENDED_IMAGES
 * - Blue (#7c8aff) when >= MIN_IMAGES
 * - Orange (#cc8800) when below MIN_IMAGES
 */
export function getProgressColor(imageCount: number): ProgressColor {
  if (imageCount >= RECOMMENDED_IMAGES) return '#44aa44';
  if (imageCount >= MIN_IMAGES) return '#7c8aff';
  return '#cc8800';
}

/**
 * Check whether the user should be warned about insufficient images.
 */
export function needsMinimumImageWarning(imageCount: number): boolean {
  return imageCount < MIN_IMAGES;
}
