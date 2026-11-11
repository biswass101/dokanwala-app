import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { Button, EmptyState, ErrorState, NumericInput, SyncStatusPill } from '@/components';
import { usePreferencesStore } from '@/store/preferences.store';

describe('Design System Components', () => {
  beforeEach(() => {
    usePreferencesStore.getState().setLanguage('bn');
    usePreferencesStore.getState().setSyncIndicator('synced', 0);
  });

  it('renders Button and handles press when enabled', async () => {
    const onPress = jest.fn();
    await render(<Button label="সংরক্ষণ করুন" onPress={onPress} />);
    const btn = screen.getByRole('button', { name: 'সংরক্ষণ করুন' });
    await fireEvent.press(btn);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('normalizes Bangla keyboard digits in NumericInput', async () => {
    const onChangeNormalized = jest.fn();
    await render(
      <NumericInput
        label="মূল্য"
        placeholder="মূল্য লিখুন"
        value=""
        onChangeNormalized={onChangeNormalized}
      />,
    );
    const input = screen.getByPlaceholderText('মূল্য লিখুন');
    await fireEvent.changeText(input, '২৫০.৭৫');
    expect(onChangeNormalized).toHaveBeenCalledWith('250.75', '২৫০.৭৫');
  });

  it('renders EmptyState and ErrorState with Bangla defaults and triggers actions', async () => {
    const onRetry = jest.fn();
    await render(
      <>
        <EmptyState title="কোনো পণ্য নেই" description="নতুন পণ্য যোগ করুন" />
        <ErrorState message="সার্ভার পাওয়া যায়নি" onRetry={onRetry} />
      </>,
    );

    expect(screen.getByText('কোনো পণ্য নেই')).toBeTruthy();
    expect(screen.getByText('সার্ভার পাওয়া যায়নি')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'আবার চেষ্টা করুন' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('displays SyncStatusPill with Bangla pending count and toggles to English', async () => {
    usePreferencesStore.getState().setSyncIndicator('pending', 3);
    const { rerender } = await render(<SyncStatusPill />);
    expect(screen.getByText('অপেক্ষমাণ (৩টি)')).toBeTruthy();

    await act(async () => {
      usePreferencesStore.getState().setLanguage('en');
    });
    await rerender(<SyncStatusPill />);
    expect(screen.getByText('Pending (3)')).toBeTruthy();
  });
});
