import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import {Text} from 'react-native';
import {useAutoHideOverlay} from '../src/hooks/useAutoHideOverlay';

let overlayRef: ReturnType<typeof useAutoHideOverlay>;

function TestComponent() {
  const overlay = useAutoHideOverlay();
  overlayRef = overlay;
  return <Text>{overlay.visible ? 'visible' : 'hidden'}</Text>;
}

describe('useAutoHideOverlay', () => {
  it('starts visible', () => {
    act(() => {
      ReactTestRenderer.create(<TestComponent />);
    });

    expect(overlayRef.visible).toBe(true);
  });

  it('does not hide over time — only toggle() changes visibility', () => {
    jest.useFakeTimers();
    act(() => {
      ReactTestRenderer.create(<TestComponent />);
    });

    act(() => {
      jest.advanceTimersByTime(60000);
    });
    expect(overlayRef.visible).toBe(true);
    jest.useRealTimers();
  });

  it('toggles visibility correctly', () => {
    act(() => {
      ReactTestRenderer.create(<TestComponent />);
    });

    expect(overlayRef.visible).toBe(true);

    act(() => {
      overlayRef.toggle();
    });
    expect(overlayRef.visible).toBe(false);

    act(() => {
      overlayRef.toggle();
    });
    expect(overlayRef.visible).toBe(true);
  });
});
