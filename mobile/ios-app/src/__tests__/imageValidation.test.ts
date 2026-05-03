import {
  isValidResolution,
  isSupportedExtension,
  calculateProgress,
  getProgressColor,
  needsMinimumImageWarning,
  MIN_RESOLUTION,
  MIN_IMAGES,
  RECOMMENDED_IMAGES,
} from '../utils/imageValidation';

describe('isValidResolution', () => {
  it('accepts images at exactly the minimum resolution', () => {
    expect(isValidResolution(480, 480)).toBe(true);
  });

  it('accepts images above the minimum resolution', () => {
    expect(isValidResolution(1920, 1080)).toBe(true);
  });

  it('rejects images where width is below minimum', () => {
    expect(isValidResolution(479, 1080)).toBe(false);
  });

  it('rejects images where height is below minimum', () => {
    expect(isValidResolution(1920, 479)).toBe(false);
  });

  it('rejects images where both dimensions are below minimum', () => {
    expect(isValidResolution(320, 240)).toBe(false);
  });

  it('rejects zero dimensions', () => {
    expect(isValidResolution(0, 0)).toBe(false);
  });
});

describe('isSupportedExtension', () => {
  it.each(['jpg', 'jpeg', 'png', 'heic', 'heif'])(
    'accepts .%s files',
    (ext) => {
      expect(isSupportedExtension(`photo.${ext}`)).toBe(true);
    }
  );

  it('accepts uppercase extensions', () => {
    expect(isSupportedExtension('photo.JPG')).toBe(true);
    expect(isSupportedExtension('photo.PNG')).toBe(true);
    expect(isSupportedExtension('photo.HEIC')).toBe(true);
  });

  it('rejects unsupported extensions', () => {
    expect(isSupportedExtension('document.pdf')).toBe(false);
    expect(isSupportedExtension('video.mp4')).toBe(false);
    expect(isSupportedExtension('image.bmp')).toBe(false);
    expect(isSupportedExtension('image.gif')).toBe(false);
    expect(isSupportedExtension('image.webp')).toBe(false);
  });

  it('rejects filenames with no extension', () => {
    expect(isSupportedExtension('noextension')).toBe(false);
  });

  it('handles filenames with multiple dots', () => {
    expect(isSupportedExtension('my.room.photo.jpg')).toBe(true);
    expect(isSupportedExtension('my.room.photo.pdf')).toBe(false);
  });
});

describe('calculateProgress', () => {
  it('returns 0 for no images', () => {
    expect(calculateProgress(0)).toBe(0);
  });

  it('returns 0.5 for half the recommended count', () => {
    expect(calculateProgress(RECOMMENDED_IMAGES / 2)).toBe(0.5);
  });

  it('returns 1 at exactly the recommended count', () => {
    expect(calculateProgress(RECOMMENDED_IMAGES)).toBe(1);
  });

  it('caps at 1 when exceeding the recommended count', () => {
    expect(calculateProgress(RECOMMENDED_IMAGES + 5)).toBe(1);
    expect(calculateProgress(100)).toBe(1);
  });

  it('returns correct fraction for partial progress', () => {
    expect(calculateProgress(1)).toBeCloseTo(1 / RECOMMENDED_IMAGES);
  });
});

describe('getProgressColor', () => {
  it('returns orange when below minimum images', () => {
    expect(getProgressColor(0)).toBe('#cc8800');
    expect(getProgressColor(MIN_IMAGES - 1)).toBe('#cc8800');
  });

  it('returns blue when at or above minimum but below recommended', () => {
    expect(getProgressColor(MIN_IMAGES)).toBe('#7c8aff');
    expect(getProgressColor(RECOMMENDED_IMAGES - 1)).toBe('#7c8aff');
  });

  it('returns green when at or above recommended', () => {
    expect(getProgressColor(RECOMMENDED_IMAGES)).toBe('#44aa44');
    expect(getProgressColor(RECOMMENDED_IMAGES + 5)).toBe('#44aa44');
  });
});

describe('needsMinimumImageWarning', () => {
  it('returns true when below minimum', () => {
    expect(needsMinimumImageWarning(0)).toBe(true);
    expect(needsMinimumImageWarning(1)).toBe(true);
    expect(needsMinimumImageWarning(MIN_IMAGES - 1)).toBe(true);
  });

  it('returns false at exactly the minimum', () => {
    expect(needsMinimumImageWarning(MIN_IMAGES)).toBe(false);
  });

  it('returns false above the minimum', () => {
    expect(needsMinimumImageWarning(MIN_IMAGES + 1)).toBe(false);
    expect(needsMinimumImageWarning(RECOMMENDED_IMAGES)).toBe(false);
  });
});

describe('constants', () => {
  it('has expected values', () => {
    expect(MIN_RESOLUTION).toBe(480);
    expect(MIN_IMAGES).toBe(4);
    expect(RECOMMENDED_IMAGES).toBe(8);
  });
});
