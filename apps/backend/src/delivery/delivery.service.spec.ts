import { evaluateObjectiveAnswer } from './delivery.service';

describe('evaluateObjectiveAnswer', () => {
  it('does not mark unanswered single-choice questions as correct when no correct option is configured', () => {
    const result = evaluateObjectiveAnswer('single', [], []);

    expect(result).toBe(false);
  });

  it('does not mark unanswered multi-choice questions as correct when no correct options are configured', () => {
    const result = evaluateObjectiveAnswer('multi', [], []);

    expect(result).toBe(false);
  });

  it('does not mark unanswered arrange questions as correct when no correct order is configured', () => {
    const result = evaluateObjectiveAnswer('arrange', [], []);

    expect(result).toBe(false);
  });
});
