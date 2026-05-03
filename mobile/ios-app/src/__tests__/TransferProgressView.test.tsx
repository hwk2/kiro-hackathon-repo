import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import TransferProgressView from '../components/TransferProgressView';
import type { TransferProgress } from '../utils/bleTransferManager';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProgress(overrides: Partial<TransferProgress> = {}): TransferProgress {
  return {
    currentImageIndex: 0,
    totalImages: 6,
    currentImageStatus: 'sending',
    overallProgress: 0,
    complete: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TransferProgressView', () => {
  it('renders overall progress percentage', () => {
    const { getByTestId } = render(
      <TransferProgressView progress={makeProgress({ overallProgress: 0.5 })} />,
    );

    expect(getByTestId('overall-percentage').props.children).toEqual([
      50,
      '% complete',
    ]);
  });

  it('renders current image info (e.g. "Image 1 of 6")', () => {
    const { getByTestId } = render(
      <TransferProgressView
        progress={makeProgress({ currentImageIndex: 0, totalImages: 6 })}
      />,
    );

    const infoText = getByTestId('image-info');
    // children: ["Sending image ", 1, " of", " ", 6, "..."]
    const text = infoText.props.children.join('');
    expect(text).toContain('1');
    expect(text).toContain('6');
  });

  it('shows "sending" status', () => {
    const { getByTestId } = render(
      <TransferProgressView
        progress={makeProgress({ currentImageStatus: 'sending' })}
      />,
    );

    const statusEl = getByTestId('image-status');
    const text = statusEl.props.children.join('');
    expect(text).toContain('Sending');
  });

  it('shows "sent" status with success indicator', () => {
    const { getByTestId } = render(
      <TransferProgressView
        progress={makeProgress({ currentImageStatus: 'sent' })}
      />,
    );

    const statusEl = getByTestId('image-status');
    const text = statusEl.props.children.join('');
    expect(text).toContain('Sent');
    expect(text).toContain('✅');
  });

  it('shows "failed" status with error indicator', () => {
    const { getByTestId } = render(
      <TransferProgressView
        progress={makeProgress({ currentImageStatus: 'failed' })}
      />,
    );

    const statusEl = getByTestId('image-status');
    const text = statusEl.props.children.join('');
    expect(text).toContain('Failed');
    expect(text).toContain('❌');
  });

  it('shows "Transfer complete" when complete is true', () => {
    const { getByTestId, queryByTestId } = render(
      <TransferProgressView
        progress={makeProgress({
          overallProgress: 1,
          complete: true,
          currentImageStatus: 'sent',
          currentImageIndex: 5,
          totalImages: 6,
        })}
      />,
    );

    expect(getByTestId('transfer-complete').props.children).toBe(
      'Transfer complete',
    );
    // Per-image status row should not be rendered
    expect(queryByTestId('image-info')).toBeNull();
  });

  it('cancel button calls onCancel', () => {
    const onCancel = jest.fn();
    const { getByTestId } = render(
      <TransferProgressView progress={makeProgress()} onCancel={onCancel} />,
    );

    fireEvent.press(getByTestId('cancel-button'));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('cancel button is hidden when onCancel is not provided', () => {
    const { queryByTestId } = render(
      <TransferProgressView progress={makeProgress()} />,
    );

    expect(queryByTestId('cancel-button')).toBeNull();
  });
});
