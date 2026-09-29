import { describe, expect, it } from 'vitest';
import { describeAdjustment, summaryText } from './summary';

describe('describeAdjustment', () => {
  it('explains an overcount as winners giving back a percentage', () => {
    expect(describeAdjustment(1200, 6000, 'Dave')).toBe(
      'Chips counted $12 more than the total buy-ins, so the winners each gave back 20% of their winnings to cover it.',
    );
  });
  it('explains leftover money going to the banker', () => {
    expect(describeAdjustment(-600, 0, 'Dave')).toBe('Chips counted $6 less than the total buy-ins. Dave, the banker, keeps the extra $6.');
  });
  it('says nothing when exact', () => {
    expect(describeAdjustment(0, 100, 'Dave')).toBeNull();
  });
});

describe('summaryText', () => {
  it('reads cleanly in a group chat and never says "pot"', () => {
    const text = summaryText({
      dateLabel: 'Tue, Sep 29',
      totalCents: 50000,
      bankerName: 'Dave',
      bankerContact: 'dave@example.com',
      results: [
        { name: 'Alex', net: 3200 },
        { name: 'Dave', net: 0 },
        { name: 'Kim', net: -4800 },
      ],
      payments: [
        { from: 'Kim', to: 'Dave', amount: 4800 },
        { from: 'Dave', to: 'Alex', amount: 3200 },
      ],
      note: null,
    });
    expect(text).toBe(
      [
        'Poker night, Tue, Sep 29',
        '$500 on the table',
        '',
        'Alex: +$32',
        'Dave: even',
        'Kim: −$48',
        '',
        'e-Transfers (Dave is the banker: dave@example.com)',
        'Kim sends Dave $48',
        'Dave sends Alex $32',
      ].join('\n'),
    );
    expect(text.toLowerCase()).not.toContain('pot');
  });
});
